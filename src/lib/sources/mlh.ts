import type { Opportunity, SourceAdapter } from "../types";
import { buildTags } from "../normalize";
import { toISO } from "../parse";
import { BROWSER_UA, buildOpportunity, fetchText } from "./_shared";
import { sanitizeSourceError } from "./diagnostics";

// MLH (Major League Hacking) season events. No API, but the season page embeds a
// JSON payload with an `upcomingEvents` array — extract current and next season.
// Keyless. Deep-links to each event's own website.

interface MlhEvent {
  name?: string;
  startsAt?: string;
  endsAt?: string;
  dateRange?: string;
  url?: string;
  websiteUrl?: string;
  location?: string;
  formatType?: string; // "digital" | "physical" | "hybrid"
  logoUrl?: string;
  backgroundUrl?: string;
}

/** Fallback deep link when an event exposes neither its own website nor an MLH path. */
const SEASON_URL = "https://mlh.com";

/** Extract a JSON array value by key from a larger blob via bracket matching. */
function extractJsonArray(html: string, key: string): unknown[] | null {
  const marker = `"${key}":`;
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const start = html.indexOf("[", i);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let k = start; k < html.length; k++) {
    const ch = html[k];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, k + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function normalize(e: MlhEvent): Opportunity | null {
  if (!e.name) return null;
  const digital = e.formatType === "digital" || /everywhere|worldwide|online|digital/i.test(e.location ?? "");
  const sourceUrl = e.websiteUrl || (e.url ? `https://mlh.com${e.url}` : SEASON_URL);
  const opportunity = buildOpportunity("mlh", "MLH", {
    category: "hackathon",
    title: e.name.trim(),
    organization: "Major League Hacking",
    sourceUrl,
    imageUrl: e.backgroundUrl,
    logoUrl: e.logoUrl,
    location: digital ? "Online" : e.location,
    isRemote: digital || undefined,
    startDate: toISO(e.startsAt),
    deadline: toISO(e.startsAt), // you register before it begins
    summary: [e.location, e.dateRange].filter(Boolean).join(" · ") || undefined,
    tags: buildTags({ text: e.name, limit: 6 }),
  });
  return opportunity;
}

export const mlhAdapter: SourceAdapter = {
  meta: {
    id: "mlh",
    label: "MLH",
    category: "hackathon",
    homepage: "https://mlh.com",
    tier: "amber",
  },
  async fetch(): Promise<Opportunity[]> {
    const currentYear = new Date().getUTCFullYear();
    const years = [currentYear, currentYear + 1];
    const results = await Promise.allSettled(years.map(async (year) => {
      const url = `https://mlh.com/seasons/${year}/events`;
      const html = await fetchText(url, { ua: BROWSER_UA, timeoutMs: 12_000 });
      const events = extractJsonArray(html, "upcomingEvents");
      if (!events) throw new Error("MLH season page did not contain upcoming events.");
      return events as MlhEvent[];
    }));

    const events: MlhEvent[] = [];
    let successfulSeasons = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        successfulSeasons++;
        events.push(...result.value);
      } else {
        console.warn(
          `[MLH] ${years[i]} season failed: ${sanitizeSourceError(result.reason)}`,
        );
      }
    }
    if (successfulSeasons === 0) throw new Error("MLH season pages were unavailable.");

    const out: Opportunity[] = [];
    const seen = new Set<string>();
    for (const e of events) {
      const o = normalize(e);
      if (o && !seen.has(o.sourceUrl)) {
        seen.add(o.sourceUrl);
        out.push(o);
      }
    }
    return out;
  },
};
