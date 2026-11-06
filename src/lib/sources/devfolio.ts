import type { Eligibility, Opportunity, SourceAdapter } from "../types";
import { buildTags, canonicalizeTerms } from "../normalize";
import { parseMoney, toDeadlineISO, toISO } from "../parse";
import { BOT_UA, buildOpportunity, fetchJson, snippet } from "./_shared";

// Devfolio public JSON — verified live 2026-06-22, zero-auth.
// GET https://api.devfolio.co/api/hackathons?filter=<f>&page=N
//   → { result: Hackathon[], count, pages }
// Filters: application_open | live | upcoming. India-heavy source.
// No prize field is exposed by this endpoint; we surface what's available.

interface DevfolioTheme {
  uuid?: string;
  name?: string;
  verified?: boolean;
}

interface DevfolioHackathonSetting {
  reg_starts_at?: string | null;
  reg_ends_at?: string | null;
}

interface DevfolioHackathon {
  uuid?: string;
  name?: string;
  slug?: string;
  cover_img?: string | null;
  favicon?: string | null;
  tagline?: string | null;
  desc?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_online?: boolean;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  location?: string | null;
  participants_count?: number;
  approx_participant?: number | null;
  themes?: DevfolioTheme[];
  hackathon_setting?: DevfolioHackathonSetting | null;
}

interface DevfolioResponse {
  result?: DevfolioHackathon[];
  count?: number;
  pages?: number;
}

const FILTERS = ["application_open", "live", "upcoming"] as const;
const MAX_PAGES = 3;

/** Build the canonical apply/register deep-link from the hackathon slug. */
function slugUrl(slug: string): string {
  return `https://${slug}.devfolio.co/`;
}

/** Compose a human location string from city/state/country parts. */
function locationOf(h: DevfolioHackathon): string | undefined {
  if (h.is_online) return "Online";
  const parts = [h.city, h.state, h.country].filter((p): p is string => !!p && p.trim().length > 0);
  return parts.length ? parts.join(", ") : undefined;
}

function normalize(h: DevfolioHackathon): Opportunity | null {
  const slug = h.slug?.trim();
  const name = h.name?.trim();
  if (!slug || !name) return null;

  const sourceUrl = slugUrl(slug);
  const themeNames = (h.themes ?? [])
    .map((t) => t?.name?.trim())
    .filter((n): n is string => !!n);

  const isRemote = !!h.is_online;
  const location = locationOf(h);

  // Deadline = registration close (reg_ends_at) when present, else event start.
  const setting = h.hackathon_setting ?? undefined;
  const deadline = toDeadlineISO(setting?.reg_ends_at) ?? toDeadlineISO(h.starts_at);
  const startDate = toISO(h.starts_at);

  // A theme may carry a money signal (rare on this endpoint); try to surface it.
  const money = parseMoney(themeNames.join(" "));
  const prizeAmount = money && money.max && money.max > 0 ? money.max : undefined;

  // Citizenship/geo: India when the host country is India and it's not online.
  let eligibility: Eligibility | undefined;
  if (!isRemote && h.country && /india/i.test(h.country)) {
    eligibility = { citizenship: "IN" };
  }

  const summary = snippet(
    [
      h.tagline ?? undefined,
      h.desc ?? undefined,
      themeNames.length ? `Themes: ${themeNames.join(", ")}` : undefined,
      location,
    ]
      .filter(Boolean)
      .join(" · "),
  );

  return buildOpportunity("devfolio", "Devfolio", {
    category: "hackathon",
    title: name,
    sourceUrl,
    summary,
    imageUrl: h.cover_img ?? undefined,
    logoUrl: h.favicon ?? undefined,
    location,
    isRemote,
    deadline,
    startDate,
    tags: buildTags({
      explicit: canonicalizeTerms(themeNames),
      text: `${name} ${h.tagline ?? ""} ${h.desc ?? ""}`,
      limit: 8,
    }),
    prizeAmount,
    currency: prizeAmount ? money?.currency ?? "INR" : undefined,
    popularity: typeof h.participants_count === "number" ? h.participants_count : undefined,
    eligibility,
  });
}

export const devfolioAdapter: SourceAdapter = {
  meta: {
    id: "devfolio",
    label: "Devfolio",
    category: "hackathon",
    homepage: "https://devfolio.co",
    tier: "green",
  },
  async fetch(): Promise<Opportunity[]> {
    const seen = new Set<string>();
    const out: Opportunity[] = [];
    let anySuccess = false;
    let lastError: unknown;

    for (const filter of FILTERS) {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const url = `https://api.devfolio.co/api/hackathons?filter=${filter}&page=${page}`;
        let data: DevfolioResponse;
        try {
          data = await fetchJson<DevfolioResponse>(url, { ua: BOT_UA, timeoutMs: 12_000 });
          if (!data || !Array.isArray(data.result)) {
            throw new Error("Devfolio response did not contain a hackathon list.");
          }
          anySuccess = true;
        } catch (err) {
          // Isolate per-request failure; keep collecting from other pages/filters.
          lastError = err;
          break;
        }

        const items = data.result ?? [];
        if (!items.length) break;

        for (const h of items) {
          const o = normalize(h);
          if (!o) continue;
          if (seen.has(o.sourceUrl)) continue; // dedupe across filters
          seen.add(o.sourceUrl);
          out.push(o);
        }

        // Stop early once we've consumed all reported pages.
        if (typeof data.pages === "number" && page >= data.pages) break;
        if (items.length < 5) break; // heuristic last page
      }
    }

    // Only throw if the ENTIRE source was unreachable (every request failed).
    if (!anySuccess) {
      throw lastError instanceof Error
        ? lastError
        : new Error("Devfolio: all requests failed");
    }

    return out;
  },
};
