import type { Opportunity, SourceAdapter } from "../types";
import { buildTags } from "../normalize";
import { BROWSER_UA, buildOpportunity, fetchJson, snippet } from "./_shared";
import { sanitizeSourceError } from "./diagnostics";

interface DoraHacksItem {
  id: number;
  uname: string | null;
  title: string;
  description: string;
  image_url: string;
  start_time: number;
  end_time: number;
  participation_form: string;
  venue_name: string | null;
  venue_address: string | null;
  ecosystem: string | null;
  field: string | null;
  bonus_price: number | null;
  token: string | null;
  hackers_count: number;
}

interface DoraHacksResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: DoraHacksItem[];
}

const MAX_PAGES = 3;

function normalize(h: DoraHacksItem): Opportunity | null {
  if (!h.title) return null;
  
  const isRemote = h.participation_form?.toLowerCase() === "virtual";
  let loc = "Virtual";
  if (!isRemote) {
    loc = [h.venue_name, h.venue_address].filter(Boolean).join(", ") || "IRL";
  }

  const explicitTags = [
    ...(h.ecosystem ? h.ecosystem.split(",").map(t => t.trim()) : []),
    ...(h.field ? h.field.split(",").map(t => t.trim()) : [])
  ].filter(Boolean);

  const startDate = h.start_time ? new Date(h.start_time * 1000).toISOString() : undefined;
  const deadline = h.end_time ? new Date(h.end_time * 1000).toISOString() : undefined;
  const sourceUrl = `https://dorahacks.io/hackathon/${h.id}/detail`;

  return buildOpportunity("dorahacks", "DoraHacks", {
    category: "hackathon",
    title: h.title.trim(),
    organization: "DoraHacks",
    sourceUrl,
    summary: snippet(h.description),
    location: loc,
    isRemote,
    imageUrl: h.image_url,
    deadline,
    startDate,
    tags: buildTags({ explicit: explicitTags, text: h.title + " " + (h.description || ""), limit: 6 }),
    prizeAmount: h.bonus_price ? h.bonus_price : undefined,
    currency: h.token || "USD",
    popularity: h.hackers_count || 0,
  });
}

export const dorahacksAdapter: SourceAdapter = {
  meta: {
    id: "dorahacks",
    label: "DoraHacks",
    category: "hackathon",
    homepage: "https://dorahacks.io",
    tier: "green",
  },
  async fetch(): Promise<Opportunity[]> {
    const out: Opportunity[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `https://dorahacks.io/api/hackathon/?status=upcoming&page_size=24&page=${page}`;
      try {
        const data = await fetchJson<DoraHacksResponse>(url, { ua: BROWSER_UA, timeoutMs: 12_000 });
        const items = data.results || [];
        if (!items.length) break;
        
        for (const h of items) {
          const o = normalize(h);
          if (o) out.push(o);
        }
        
        if (!data.next) break;
      } catch (err) {
        console.error(`DoraHacks page ${page} failed: ${sanitizeSourceError(err)}`);
        break;
      }
    }
    return out;
  },
};
