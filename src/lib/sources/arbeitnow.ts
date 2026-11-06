import type { Opportunity, SourceAdapter, Eligibility } from "../types";
import { buildOpportunity, fetchJson, snippet, BOT_UA, BROWSER_UA } from "./_shared";
import { buildTags } from "../normalize";
import { parseMoney, toISO } from "../parse";

// ─────────────────────────────────────────────────────────────────────────────
// Arbeitnow public job board API — verified live 2026-06-22, zero-auth, clean JSON.
//   GET https://www.arbeitnow.com/api/job-board-api
//   → { data: [ { slug, company_name, title, description(HTML), remote(bool),
//                 url, tags[], job_types[], location, created_at(epoch seconds) } ],
//       links, meta }
//
// This is a BREADTH source for remote / early-career roles. The board is mostly
// the German market, so it carries both English (intern/junior/graduate) and
// German (praktikum/werkstudent/trainee/berufseinstieg) early-career markers; we
// match on either. No deadlines are provided → roles are rolling (deadline left
// undefined). category 'internship'.
// ─────────────────────────────────────────────────────────────────────────────

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description?: string;
  remote: boolean;
  url: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number; // epoch seconds
}

interface ArbeitnowResponse {
  data?: ArbeitnowJob[];
  links?: { next?: string | null; prev?: string | null };
  meta?: { current_page?: number };
}

const API_URL = "https://www.arbeitnow.com/api/job-board-api";
const MAX_ITEMS = 25;

// English + German early-career / student / remote-friendly markers.
// (praktikum = internship, werkstudent = working student, einsteiger/berufseinstieg
//  = entry-level, absolvent = graduate, ausbildung = trainee/apprentice.)
const EARLY_CAREER =
  /intern|internship|junior|entry[\s-]?level|entry|graduate|grad\b|working student|werkstudent|werkstudierende|trainee|praktik|studentenjob|student\b|absolvent|berufseinstieg|einsteiger|ausbildung|apprentice|new ?grad/i;

function isEarlyCareer(job: ArbeitnowJob): boolean {
  const haystack = [job.title, ...(job.job_types ?? []), ...(job.tags ?? [])]
    .filter(Boolean)
    .join(" ");
  return EARLY_CAREER.test(haystack);
}

function normalize(job: ArbeitnowJob): Opportunity | null {
  if (!job.url || !job.title) return null;

  const title = job.title.replace(/\s+/g, " ").trim();
  const summary = snippet(job.description) ?? undefined;
  const location = job.location?.trim() || undefined;
  const tags = job.tags ?? [];

  // Money is not a structured field here; mine it from the description if present
  // (some posts list a salary). Treat as monthly stipend for the internship card.
  const money = parseMoney(job.description);
  const stipMin = money?.min && money.min > 0 ? money.min : undefined;
  const stipMax = money?.max && money.max > 0 ? money.max : undefined;
  const hasStipend = stipMax !== undefined;

  // Eligibility: this is a non-Indian, open job board. We are confident the
  // location is outside India (German market) but NOT confident enough to gate
  // students out, so we leave eligibility OPEN (per the missing = open rule).
  const eligibility: Eligibility | undefined = undefined;

  return buildOpportunity("arbeitnow", "Arbeitnow", {
    category: "internship",
    title,
    organization: job.company_name?.replace(/\s+/g, " ").trim() || undefined,
    sourceUrl: job.url,
    summary,
    location,
    isRemote: !!job.remote,
    // No close date is published → rolling. Leave deadline undefined.
    postedAt: toISO(job.created_at),
    tags: buildTags({ explicit: tags, text: title, limit: 8 }),
    // Only attach stipend if the description actually yielded a positive amount.
    stipendMin: stipMin,
    stipendMax: stipMax,
    stipendPeriod: hasStipend ? "month" : undefined,
    currency: hasStipend ? (money?.currency as "INR" | "USD") : undefined,
    eligibility,
  });
}

export const arbeitnowAdapter: SourceAdapter = {
  meta: {
    id: "arbeitnow",
    label: "Arbeitnow",
    category: "internship",
    homepage: "https://www.arbeitnow.com",
    tier: "green",
  },
  async fetch(): Promise<Opportunity[]> {
    let data: ArbeitnowResponse;
    try {
      data = await fetchJson<ArbeitnowResponse>(API_URL, { ua: BOT_UA, timeoutMs: 12_000 });
    } catch {
      // A handful of CDNs 403 a bot UA — retry once with a browser UA before
      // giving up. If this also throws, the whole source is unreachable and the
      // orchestrator will isolate it.
      data = await fetchJson<ArbeitnowResponse>(API_URL, { ua: BROWSER_UA, timeoutMs: 12_000 });
    }

    if (!data || !Array.isArray(data.data)) {
      throw new Error("Arbeitnow returned a malformed jobs list.");
    }
    const jobs = data.data;
    const out: Opportunity[] = [];
    const seen = new Set<string>();

    // First pass: strict early-career / student / trainee matches.
    for (const job of jobs) {
      if (out.length >= MAX_ITEMS) break;
      if (!isEarlyCareer(job)) continue;
      const o = normalize(job);
      if (o && !seen.has(o.id)) {
        seen.add(o.id);
        out.push(o);
      }
    }

    // Breadth fallback: if too few matched, top up with remote roles (more likely
    // to be accessible to students for breadth) until we hit the cap.
    if (out.length < 10) {
      for (const job of jobs) {
        if (out.length >= MAX_ITEMS) break;
        if (!job.remote) continue;
        const o = normalize(job);
        if (o && !seen.has(o.id)) {
          seen.add(o.id);
          out.push(o);
        }
      }
    }

    return out.slice(0, MAX_ITEMS);
  },
};
