import type { Category, Profile, ScoredOpportunity } from "./types";
import type { Corpus } from "./store";
import { rank } from "./rank";
import { CATEGORIES } from "./types";
import { isNearby } from "./geo";

const MS_DAY = 86_400_000;

export type DeadlineWindow = "all" | "24h" | "3d" | "7d" | "30d";
export type LocationFilter = "all" | "nearby" | "remote" | "onsite";
export type SortKey = "closing" | "match" | "newest";

export interface FilterState {
  categories?: Category[];
  query?: string;
  deadlineWindow?: DeadlineWindow;
  location?: LocationFilter;
  /** Skill / theme tags to narrow by (match = at least one). */
  tags?: string[];
  /** INR/month floor for internships. */
  minStipend?: number;
}

export interface Facets {
  category: Record<Category, number>;
  total: number;
  remote: number;
  /** Items in the student's city / commuter region / state, or online. */
  nearby: number;
  closingThisWeek: number;
  withDeadline: number;
  /** Most common tags within the active category (the per-category filter set). */
  topTags: { tag: string; count: number }[];
}

export interface FeedResult {
  items: ScoredOpportunity[];
  facets: Facets;
  broadened: boolean;
  /** Count after filters. */
  total: number;
  /** Count of all eligible (pre-filter) items. */
  eligibleTotal: number;
}

function daysLeft(deadline: string | undefined, now: number): number | null {
  if (!deadline) return null;
  const t = new Date(deadline).getTime();
  if (isNaN(t)) return null;
  return (t - now) / MS_DAY;
}

function matchesFilter(s: ScoredOpportunity, f: FilterState, now: number): boolean {
  const o = s.opportunity;

  if (f.categories?.length && !f.categories.includes(o.category)) return false;

  if (f.query) {
    const q = f.query.toLowerCase().trim();
    if (q) {
      const hay = `${o.title} ${o.organization ?? ""} ${o.summary ?? ""} ${o.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
  }

  if (f.deadlineWindow && f.deadlineWindow !== "all") {
    const d = daysLeft(o.deadline, now);
    if (d == null) return false; // rolling items excluded from "closing within" filters
    const cap = f.deadlineWindow === "24h" ? 1 : f.deadlineWindow === "3d" ? 3 : f.deadlineWindow === "7d" ? 7 : 30;
    if (d > cap) return false;
  }

  if (f.location === "remote" && o.isRemote !== true) return false;
  if (f.location === "onsite" && o.isRemote === true) return false;
  if (f.location === "nearby") {
    // "Near me" keeps anything in the student's city, commuter region or state,
    // plus online items — those are attendable from home, so excluding them
    // would strip the feed of half its value. Only genuinely distant and
    // region-locked items are dropped.
    const tier = s.proximity?.tier;
    if (!tier) return false;
    if (!isNearby(tier) && tier !== "remote") return false;
    if (tier === "remote" && (s.proximity?.score ?? 1) < 0.6) return false;
  }

  if (f.tags?.length && !f.tags.some((t) => o.tags.includes(t))) return false;

  if (f.minStipend && o.category === "internship") {
    const top = o.stipendMax ?? o.stipendMin ?? 0;
    if (top < f.minStipend) return false;
  }

  return true;
}

function sortItems(items: ScoredOpportunity[], sort: SortKey, now: number): ScoredOpportunity[] {
  const arr = [...items];
  if (sort === "match") {
    arr.sort((a, b) => b.score - a.score);
  } else if (sort === "closing") {
    arr.sort((a, b) => {
      const da = daysLeft(a.opportunity.deadline, now);
      const db = daysLeft(b.opportunity.deadline, now);
      if (da == null && db == null) return b.score - a.score;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });
  } else {
    // newest
    arr.sort((a, b) => {
      const ta = a.opportunity.postedAt ? new Date(a.opportunity.postedAt).getTime() : 0;
      const tb = b.opportunity.postedAt ? new Date(b.opportunity.postedAt).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return b.score - a.score;
    });
  }
  return arr;
}

function buildFacets(items: ScoredOpportunity[], now: number, catScope?: Category): Facets {
  const category = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  let remote = 0;
  let nearby = 0;
  let closingThisWeek = 0;
  let withDeadline = 0;
  const tagCount = new Map<string, number>();
  for (const s of items) {
    const o = s.opportunity;
    category[o.category]++;
    if (o.isRemote) remote++;
    const tier = s.proximity?.tier;
    if (tier && isNearby(tier)) nearby++;
    const d = daysLeft(o.deadline, now);
    if (d != null) {
      withDeadline++;
      if (d >= 0 && d <= 7) closingThisWeek++;
    }
    // Top tags scoped to the active category (or all when none selected).
    if (!catScope || o.category === catScope) {
      for (const t of o.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    }
  }
  const topTags = [...tagCount.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 16);
  return { category, total: items.length, remote, nearby, closingThisWeek, withDeadline, topTags };
}

/**
 * The one function the feed route calls: eligibility-ranked → faceted →
 * filtered → sorted. Facets are computed over the full eligible pool so chip
 * counts reflect what's available, not what's currently filtered in.
 */
export function buildFeed(
  corpus: Corpus,
  profile: Profile,
  filter: FilterState = {},
  sort: SortKey = "closing",
  now = Date.now(),
  scope: "all" | "eligible" = "eligible",
): FeedResult {
  const { items: ranked, broadened } = rank(corpus.opportunities, profile, {
    now,
    skipEligibility: scope === "all",
  });
  const catScope = filter.categories?.length === 1 ? filter.categories[0] : undefined;
  const facets = buildFacets(ranked, now, catScope);
  const filtered = ranked.filter((s) => matchesFilter(s, filter, now));
  let ordered = sortItems(filtered, sort, now);
  if (filter.location === "nearby") {
    // Stable partition: things actually happening around the student first,
    // online items after, each half keeping the chosen sort order.
    const local = ordered.filter((s) => s.proximity && isNearby(s.proximity.tier));
    const online = ordered.filter((s) => !s.proximity || !isNearby(s.proximity.tier));
    ordered = [...local, ...online];
  }
  const items = ordered.slice(0, 200);
  return { items, facets, broadened, total: filtered.length, eligibleTotal: ranked.length };
}
