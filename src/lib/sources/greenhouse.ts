import type { Eligibility, Opportunity, SourceAdapter } from "../types";
import { buildTags, canonicalizeTerms } from "../normalize";
import { parseMoney, parseRangeEnd, parseRangeStart, toDeadlineISO, toISO } from "../parse";
import { BOT_UA, buildOpportunity, fetchJson, snippet } from "./_shared";

// ─────────────────────────────────────────────────────────────────────────────
// Greenhouse ATS Job Board API — the internship backbone. Zero-auth public JSON.
//   GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs[?content=true]
// Verified live 2026-06-22: every token below returned HTTP 200 with a `jobs`
// array and at least some India presence. We curate companies that HIRE INTERNS
// IN INDIA, then runtime-filter each board to early-career roles. Intern reqs are
// seasonal, so a board can legitimately have 0 matches off-season — that's fine,
// it'll light up when the campus season opens.
//
// `parseMoney`, `parseRangeEnd`, `parseRangeStart` are imported per the adapter
// contract; Greenhouse rarely exposes structured stipend/date fields, so they are
// used opportunistically where a description blob is fetched (content=true).
// ─────────────────────────────────────────────────────────────────────────────

interface GhBoard {
  /** Greenhouse board token, e.g. "razorpaysoftwareprivatelimited". */
  token: string;
  /** Friendly company label for the UI. */
  label: string;
  /** Registrable domain for the company logo. */
  domain: string;
}

// Curated + LIVE-VERIFIED (2026-06-22) tokens. Each returns HTTP 200 with a jobs
// array and hires in India. The orchestrator hits all of these per refresh.
const BOARDS: GhBoard[] = [
  { token: "razorpaysoftwareprivatelimited", label: "Razorpay", domain: "razorpay.com" },
  { token: "groww", label: "Groww", domain: "groww.in" },
  { token: "phonepe", label: "PhonePe", domain: "phonepe.com" },
  { token: "zscaler", label: "Zscaler", domain: "zscaler.com" },
  { token: "rubrik", label: "Rubrik", domain: "rubrik.com" },
  { token: "cloudflare", label: "Cloudflare", domain: "cloudflare.com" },
  { token: "coinbase", label: "Coinbase", domain: "coinbase.com" },
  { token: "stripe", label: "Stripe", domain: "stripe.com" },
  { token: "mongodb", label: "MongoDB", domain: "mongodb.com" },
  { token: "twilio", label: "Twilio", domain: "twilio.com" },
  { token: "databricks", label: "Databricks", domain: "databricks.com" },
  { token: "samsara", label: "Samsara", domain: "samsara.com" },
  { token: "gitlab", label: "GitLab", domain: "gitlab.com" },
  { token: "postman", label: "Postman", domain: "postman.com" },
  { token: "elastic", label: "Elastic", domain: "elastic.co" },
  { token: "dropbox", label: "Dropbox", domain: "dropbox.com" },
  { token: "clickhouse", label: "ClickHouse", domain: "clickhouse.com" },
  { token: "affirm", label: "Affirm", domain: "affirm.com" },
  { token: "reddit", label: "Reddit", domain: "reddit.com" },
  { token: "okta", label: "Okta", domain: "okta.com" },
  { token: "asana", label: "Asana", domain: "asana.com" },
  { token: "mixpanel", label: "Mixpanel", domain: "mixpanel.com" },
  { token: "cockroachlabs", label: "Cockroach Labs", domain: "cockroachlabs.com" },
  { token: "thetradedesk", label: "The Trade Desk", domain: "thetradedesk.com" },
];

// Title gate: keep only early-career roles (per task spec).
const EARLY_CAREER_RE =
  /intern|graduate|trainee|campus|apprentic|fresher|early[- ]?career|new[- ]?grad|university/i;
// Exclude senior roles that incidentally contain a gate word
// (e.g. "University Recruiting Manager", "Graduate Program Lead" are fine to keep,
// but "Senior … Internal Audit" must not slip through via "intern").
const FALSE_POSITIVE_RE = /\binternal\b|\binternational\b|\bintern(?:al)? (?:audit|control)/i;

const REMOTE_RE = /remote|anywhere|work[- ]?from[- ]?home|wfh/i;
// India geo hints — used only to flag/keep India-relevant rows in the summary,
// never to hard-filter (a remote global role is valid for Indian students too).
const INDIA_RE =
  /india|bangalore|bengaluru|gurgaon|gurugram|noida|mumbai|chennai|hyderabad|pune|delhi|kolkata|ahmedabad|jaipur/i;

interface GhLocation {
  name?: string;
}
interface GhMetadata {
  id?: number;
  name?: string;
  value?: unknown;
  value_type?: string;
}
interface GhDepartment {
  id?: number;
  name?: string;
}
interface GhOffice {
  id?: number;
  name?: string;
  location?: string;
}
interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: GhLocation;
  updated_at?: string;
  first_published?: string;
  company_name?: string;
  requisition_id?: string;
  application_deadline?: string | null;
  content?: string; // present when ?content=true (HTML-escaped description)
  metadata?: GhMetadata[];
  departments?: GhDepartment[];
  offices?: GhOffice[];
}
interface GhResponse {
  jobs?: GhJob[];
  meta?: { total?: number };
}

const SOURCE = "greenhouse";
const SOURCE_LABEL = "Greenhouse";
const PER_TOKEN_TIMEOUT_MS = 12_000;

function isEarlyCareer(title: string): boolean {
  if (!title) return false;
  if (FALSE_POSITIVE_RE.test(title) && !/\bintern(?:ship)?\b/i.test(title.replace(FALSE_POSITIVE_RE, "")))
    return false;
  return EARLY_CAREER_RE.test(title);
}

/** Pull free-text terms (departments + a metadata "skills"/"function" field) for tagging. */
function explicitTerms(job: GhJob): string[] {
  const terms: string[] = [];
  for (const d of job.departments ?? []) if (d.name) terms.push(d.name);
  for (const m of job.metadata ?? []) {
    if (typeof m.value === "string" && m.value && m.value.length < 40) terms.push(m.value);
  }
  return terms;
}

/**
 * Greenhouse exposes no eligibility schema. We only set a field we are highly
 * confident about: roles explicitly tagged "PhD", "Master's", or "MBA" in the
 * title imply a postgraduate year — but since `years` is noisy we keep eligibility
 * essentially OPEN (per the project rule: missing = eligible) and only attach the
 * India citizenship hint when the role is location-locked to India.
 */
function deriveEligibility(job: GhJob, locName: string): Eligibility | undefined {
  // Location-locked India role → safe, high-confidence India hint for the detail view.
  if (locName && INDIA_RE.test(locName) && !REMOTE_RE.test(locName)) {
    return { citizenship: "IN", raw: locName };
  }
  return undefined;
}

function normalize(job: GhJob, board: GhBoard): Opportunity | null {
  if (!job.absolute_url || !job.title) return null;
  const title = job.title.trim();
  if (!isEarlyCareer(title)) return null;

  const locName = job.location?.name?.trim();
  const isRemote = !!locName && REMOTE_RE.test(locName);

  // Deadline: Greenhouse `application_deadline` is usually null → rolling.
  // Fall back to a date parsed out of the description if content was fetched.
  const deadline =
    toDeadlineISO(job.application_deadline ?? undefined) ??
    (job.content ? parseRangeEnd(decodeHtml(job.content)) : undefined);

  const postedAt = toISO(job.first_published) ?? toISO(job.updated_at);

  // Stipend is almost never structured; try the description blob if present.
  const money = job.content ? parseMoney(snippet(decodeHtml(job.content), 600)) : undefined;
  const stipendMin = money && money.min ? money.min : undefined;
  const stipendMax = money && money.max ? money.max : undefined;

  const startDate = job.content ? parseRangeStart(decodeHtml(job.content)) : undefined;

  const summaryBits = [
    locName,
    isRemote ? "Remote" : null,
    (job.departments ?? []).map((d) => d.name).filter(Boolean).join(", ") || null,
    job.content ? snippet(decodeHtml(job.content), 160) : null,
  ].filter(Boolean) as string[];

  return buildOpportunity(SOURCE, SOURCE_LABEL, {
    category: "internship",
    title,
    organization: job.company_name?.trim() || board.label,
    sourceUrl: job.absolute_url,
    summary: snippet(summaryBits.join(" · ")),
    logoUrl: `https://icons.duckduckgo.com/ip3/${board.domain}.ico`,
    location: locName,
    isRemote,
    deadline, // undefined ⇒ rolling
    startDate,
    postedAt,
    tags: buildTags({ explicit: canonicalizeTerms(explicitTerms(job)), text: title, limit: 8 }),
    stipendMin,
    stipendMax,
    stipendPeriod: stipendMin != null || stipendMax != null ? "month" : undefined,
    currency: money?.currency,
    eligibility: deriveEligibility(job, locName ?? ""),
  });
}

/** Minimal HTML-entity decode for Greenhouse `content` (it double-escapes). */
function decodeHtml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function fetchBoard(board: GhBoard): Promise<Opportunity[]> {
  // content=true gives us descriptions for opportunistic stipend/date parsing.
  const url = `https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs?content=true`;
  const data = await fetchJson<GhResponse>(url, { ua: BOT_UA, timeoutMs: PER_TOKEN_TIMEOUT_MS });
  if (!data || !Array.isArray(data.jobs)) {
    throw new Error("Greenhouse board returned a malformed jobs list.");
  }
  const jobs = data.jobs;
  const out: Opportunity[] = [];
  for (const job of jobs) {
    try {
      const o = normalize(job, board);
      if (o) out.push(o);
    } catch {
      // Skip a single malformed row; never let it sink the whole board.
    }
  }
  return out;
}

export const greenhouseAdapter: SourceAdapter = {
  meta: {
    id: SOURCE,
    label: SOURCE_LABEL,
    category: "internship",
    homepage: "https://boards.greenhouse.io",
    tier: "green",
  },
  async fetch(): Promise<Opportunity[]> {
    // Promise.allSettled so one dead/slow token can't kill the run.
    const results = await Promise.allSettled(BOARDS.map((b) => fetchBoard(b)));

    const out: Opportunity[] = [];
    let okBoards = 0;
    for (const r of results) {
      if (r.status === "fulfilled") {
        okBoards += 1;
        out.push(...r.value);
      }
    }

    // If EVERY token failed, the source is genuinely unreachable → throw so the
    // orchestrator marks the run failed (it isolates us per-source).
    if (okBoards === 0 && BOARDS.length > 0) {
      throw new Error("greenhouse: all board tokens failed");
    }

    // De-dupe by sourceUrl (a company occasionally lists the same req twice).
    const seen = new Set<string>();
    return out.filter((o) => (seen.has(o.sourceUrl) ? false : (seen.add(o.sourceUrl), true)));
  },
};
