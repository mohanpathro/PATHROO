import type { Opportunity, SourceAdapter } from "../types";
import { buildTags } from "../normalize";
import { toISO } from "../parse";
import { BOT_UA, buildOpportunity, fetchJson, snippet } from "./_shared";
import { sanitizeSourceError } from "./diagnostics";

// Adzuna India jobs API — free key from https://developer.adzuna.com/
// Env-gated: this source only appears once ADZUNA_APP_ID + ADZUNA_APP_KEY are set.
// GET https://api.adzuna.com/v1/api/jobs/in/search/{page}?app_id=&app_key=&what=intern
interface AdzunaJob {
  id?: string;
  title?: string;
  description?: string;
  redirect_url?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  created?: string;
  salary_min?: number;
  salary_max?: number;
}
interface AdzunaResp {
  results?: AdzunaJob[];
  count?: number;
}

const QUERIES = ["intern", "graduate trainee", "campus hire"];

function normalize(j: AdzunaJob): Opportunity | null {
  if (!j.redirect_url || !j.title) return null;
  const loc = j.location?.display_name;
  const isRemote = /remote|anywhere|work from home|wfh/i.test(`${loc ?? ""} ${j.title}`);
  return buildOpportunity("adzuna", "Adzuna", {
    category: "internship",
    title: j.title.trim(),
    organization: j.company?.display_name,
    sourceUrl: j.redirect_url,
    summary: snippet(j.description),
    location: loc,
    isRemote: isRemote || undefined,
    postedAt: toISO(j.created),
    tags: buildTags({ text: `${j.title} ${j.description ?? ""}`, limit: 8 }),
    stipendMin: j.salary_min ? Math.round(j.salary_min) : undefined,
    stipendMax: j.salary_max ? Math.round(j.salary_max) : undefined,
    stipendPeriod: "year",
    currency: "INR",
  });
}

export const adzunaAdapter: SourceAdapter = {
  meta: {
    id: "adzuna",
    label: "Adzuna (India)",
    category: "internship",
    homepage: "https://www.adzuna.in",
    tier: "green",
  },
  async fetch(): Promise<Opportunity[]> {
    const id = process.env.ADZUNA_APP_ID;
    const key = process.env.ADZUNA_APP_KEY;
    if (!id || !key) throw new Error("Not configured — set ADZUNA_APP_ID & ADZUNA_APP_KEY in .env.local");

    const seen = new Set<string>();
    const out: Opportunity[] = [];
    let lastErr: unknown = null;
    for (const what of QUERIES) {
      const url = new URL("https://api.adzuna.com/v1/api/jobs/in/search/1");
      url.search = new URLSearchParams({
        app_id: id,
        app_key: key,
        results_per_page: "30",
        max_days_old: "60",
        "content-type": "application/json",
        what,
      }).toString();
      try {
        const data = await fetchJson<AdzunaResp>(url.toString(), { ua: BOT_UA, timeoutMs: 12_000 });
        for (const j of data.results ?? []) {
          const o = normalize(j);
          if (o && !seen.has(o.id)) {
            seen.add(o.id);
            out.push(o);
          }
        }
      } catch (err) {
        lastErr = new Error(sanitizeSourceError(err));
      }
    }
    // If we got nothing AND every query errored, surface it (likely a bad key/quota).
    if (out.length === 0 && lastErr) throw lastErr;
    return out;
  },
};
