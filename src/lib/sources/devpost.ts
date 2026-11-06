import type { Opportunity, SourceAdapter } from "../types";
import { buildTags } from "../normalize";
import { parseMoney, parseRangeEnd, parseRangeStart } from "../parse";
import { BOT_UA, buildOpportunity, fetchJson, snippet } from "./_shared";

// Devpost public JSON — verified live 2026-06-22, zero-auth.
// GET https://devpost.com/api/hackathons?status[]=open&page=N  → ~9 items/page.
interface DevpostTheme {
  id: number;
  name: string;
}
interface DevpostHackathon {
  id: number;
  title: string;
  url: string;
  submission_period_dates: string; // "May 19 - Aug 17, 2026"
  prize_amount: string; // "$<span data-currency-value>2,000,000</span>"
  time_left_to_submission: string;
  open_state: string; // "open"
  organization_name: string;
  registrations_count: number;
  displayed_location?: { icon?: string; location?: string };
  themes?: DevpostTheme[];
  thumbnail_url?: string;
}
interface DevpostResponse {
  hackathons: DevpostHackathon[];
  meta?: { total_count?: number; per_page?: number };
}

const MAX_PAGES = 4;

function normalize(h: DevpostHackathon): Opportunity | null {
  if (!h.url || !h.title) return null;
  const loc = h.displayed_location?.location;
  const isRemote = !!loc && /online|virtual|anywhere/i.test(loc);
  const prizeText = h.prize_amount ? h.prize_amount.replace(/<[^>]*>/g, "") : undefined;
  const money = parseMoney(prizeText);
  const themeNames = (h.themes ?? []).map((t) => t.name);

  return buildOpportunity("devpost", "Devpost", {
    category: "hackathon",
    title: h.title.trim(),
    organization: h.organization_name?.trim(),
    sourceUrl: h.url,
    summary: snippet(
      [themeNames.join(", "), loc, h.time_left_to_submission].filter(Boolean).join(" · "),
    ),
    location: loc,
    isRemote,
    imageUrl: h.thumbnail_url
      ? h.thumbnail_url.startsWith("//")
        ? `https:${h.thumbnail_url}`
        : h.thumbnail_url
      : undefined,
    deadline: parseRangeEnd(h.submission_period_dates),
    startDate: parseRangeStart(h.submission_period_dates),
    tags: buildTags({ explicit: themeNames, text: h.title, limit: 8 }),
    prizeAmount: money?.max,
    currency: money?.currency ?? "USD",
    popularity: h.registrations_count,
  });
}

export const devpostAdapter: SourceAdapter = {
  meta: {
    id: "devpost",
    label: "Devpost",
    category: "hackathon",
    homepage: "https://devpost.com",
    tier: "green",
  },
  async fetch(): Promise<Opportunity[]> {
    const out: Opportunity[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `https://devpost.com/api/hackathons?status[]=open&page=${page}`;
      const data = await fetchJson<DevpostResponse>(url, { ua: BOT_UA, timeoutMs: 12_000 });
      if (!data || !Array.isArray(data.hackathons)) {
        throw new Error("Devpost response did not contain a hackathon list.");
      }
      const items = data.hackathons;
      if (!items.length) break;
      for (const h of items) {
        const o = normalize(h);
        if (o) out.push(o);
      }
      if (items.length < 6) break; // last page
    }
    return out;
  },
};
