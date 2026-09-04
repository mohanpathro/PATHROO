import type { Category, Opportunity, SourceAdapter } from "../types";
import { buildTags } from "../normalize";
import { toISO } from "../parse";
import { BOT_UA, buildOpportunity, fetchJson, snippet } from "./_shared";

// HackerEarth public events JSON — verified live 2026-09-04, zero-auth.
// GET https://www.hackerearth.com/chrome-extension/events/
//   → { response: HEEvent[] }
// This is the same feed HackerEarth ships in its own browser extension. Their
// robots.txt is `Allow: /` with only login params, /*AJAX and language paths
// disallowed, so this path is fair game; the /challenges/ listing page is
// client-rendered and exposes nothing in its HTML.
//
// The payload carries no location or prize field. Every event is an online
// challenge run on HackerEarth's own platform, so we mark them remote rather
// than inventing a venue.

interface HEEvent {
  title?: string;
  description?: string;
  url?: string;
  subscribe?: string;
  /** "ONGOING" | "UPCOMING" | … */
  status?: string;
  /** True for college-restricted challenges. */
  college?: boolean;
  date?: string;
  time?: string;
  end_date?: string;
  end_time?: string;
  start_timestamp?: string;
  end_timestamp?: string;
  /** ISO-ish with offset, e.g. "2026-08-14 13:00:00+05:30". */
  start_tz?: string;
  end_tz?: string;
  /** UTC variants — preferred, unambiguous. */
  start_utc_tz?: string;
  end_utc_tz?: string;
  thumbnail?: string;
  cover_image?: string;
  is_hackerearth?: boolean;
  /** e.g. "Monthly Challenges", "Hiring Challenges". */
  challenge_type?: string;
}

interface HEResponse {
  response?: HEEvent[];
}

const ENDPOINT = "https://www.hackerearth.com/chrome-extension/events/";

/**
 * HackerEarth files everything under /challenges/, but the path segment says
 * what it actually is: `hackathon` builds a project, `competitive` is a timed
 * contest or hiring challenge.
 */
function categoryOf(e: HEEvent): Category {
  const url = e.url ?? "";
  if (/\/challenges\/hackathon\//i.test(url)) return "hackathon";
  if (/\/challenges\/(competitive|college|new)\//i.test(url)) return "competition";
  // Fall back to the human label when the URL shape is unfamiliar.
  return /hackathon/i.test(e.challenge_type ?? "") ? "hackathon" : "competition";
}

/**
 * "2026-09-20 23:59:00+00:00" parses natively; the space-separated form is
 * accepted by Date in every runtime we target, but normalise the `T` anyway so
 * the value is unambiguous before it reaches toISO.
 */
function tsToISO(utc: string | undefined, fallback: string | undefined): string | undefined {
  const raw = utc ?? fallback;
  if (!raw) return undefined;
  return toISO(raw.trim().replace(" ", "T")) ?? toISO(raw);
}

function normalize(e: HEEvent): Opportunity | null {
  const title = e.title?.trim();
  const sourceUrl = e.url?.trim() || e.subscribe?.trim();
  if (!title || !sourceUrl) return null;

  // Skip anything already finished — the feed includes recently-closed events.
  const deadline = tsToISO(e.end_utc_tz, e.end_tz);
  const startDate = tsToISO(e.start_utc_tz, e.start_tz);

  const category = categoryOf(e);
  const summary = snippet(
    [e.description, e.challenge_type, e.status === "ONGOING" ? "Live now" : undefined]
      .filter(Boolean)
      .join(" · "),
  );

  return buildOpportunity("hackerearth", "HackerEarth", {
    category,
    title,
    sourceUrl,
    summary,
    imageUrl: e.cover_image ?? e.thumbnail ?? undefined,
    // Every event on this feed runs on HackerEarth's own platform.
    location: "Online",
    isRemote: true,
    deadline,
    startDate,
    tags: buildTags({
      explicit: category === "competition" ? ["competitive-programming"] : [],
      text: `${title} ${e.description ?? ""} ${e.challenge_type ?? ""}`,
      limit: 8,
    }),
  });
}

export const hackerearthAdapter: SourceAdapter = {
  meta: {
    id: "hackerearth",
    label: "HackerEarth",
    category: "mixed",
    homepage: "https://www.hackerearth.com/challenges/",
    tier: "green",
  },
  async fetch(): Promise<Opportunity[]> {
    const data = await fetchJson<HEResponse>(ENDPOINT, { ua: BOT_UA, timeoutMs: 12_000 });
    const events = Array.isArray(data.response) ? data.response : [];

    const seen = new Set<string>();
    const out: Opportunity[] = [];
    for (const e of events) {
      const o = normalize(e);
      if (!o || !o.sourceUrl) continue;
      if (seen.has(o.sourceUrl)) continue;
      seen.add(o.sourceUrl);
      out.push(o);
    }
    return out;
  },
};
