import type { Opportunity, Profile, ScoreBreakdown, ScoredOpportunity } from "./types";
import { passesEligibility } from "./eligibility";
import { proximity, resolveHome, type PlaceRef, type Proximity } from "./geo";
import { BRANCHES, SKILL_LABELS } from "./taxonomy";
import { deadlineInfo } from "./format";
import { clamp, uniq } from "./utils";

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 2 ranking: a transparent, deterministic weighted score. No ML training,
// runs as a pure function over the cached corpus in milliseconds. Every number
// here is surfaced in the debug panel and reduced to plain-English reason chips.
// ─────────────────────────────────────────────────────────────────────────────

export type SignalKey = keyof ScoreBreakdown;

/**
 * Base weights with semantic embeddings OFF (the default). When embeddings are
 * enabled the 0.15 semantic weight is taken from skill (+0.10) and interest
 * (+0.05) — i.e. skill 0.30 / interest 0.20 / semantic 0.15.
 */
export const BASE_WEIGHTS: Record<Exclude<SignalKey, "semantic">, number> = {
  skill: 0.4,
  interest: 0.25,
  urgency: 0.15,
  recency: 0.1,
  popularity: 0.05,
  location: 0.05,
};

const BRANCH_AFFINITY: Record<string, string[]> = Object.fromEntries(
  BRANCHES.map((b) => [b.slug, b.affinity]),
);

const MS_DAY = 86_400_000;

export interface RankContext {
  now: number;
  maxPop: number;
  weights: Record<string, number>;
  /**
   * The student's resolved home. Optional so existing callers keep working;
   * when omitted it is derived from the profile on first use.
   */
  home?: PlaceRef;
}

/** Location weight once the student's home resolves to a real place. */
const LOCATED_LOCATION_WEIGHT = 0.15;

/** Cold-start: zero out signals the profile can't produce, then renormalise. */
export function effectiveWeights(profile: Profile): Record<string, number> {
  const w = { ...BASE_WEIGHTS } as Record<string, number>;
  const hasSkillSignal =
    (profile.skills?.length ?? 0) > 0 ||
    (profile.branch ? (BRANCH_AFFINITY[profile.branch]?.length ?? 0) > 0 : false);
  if (!hasSkillSignal) w.skill = 0;

  // A student who told us their city is asking to be shown what is near them.
  // At the 0.05 base weight even a perfect local match shifted the final score
  // by <0.03, so locality was effectively invisible in the ordering.
  const home = resolveHome(profile.location, profile.state);
  const located = home.cities.length > 0 || home.clusters.length > 0 || home.states.length > 0;
  if (located) w.location = LOCATED_LOCATION_WEIGHT;

  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(w)) w[k] = w[k] / total;
  return w;
}

function effectiveSkills(profile: Profile): { explicit: Set<string>; affinity: Set<string> } {
  const explicit = new Set(profile.skills ?? []);
  const affinity = new Set(profile.branch ? BRANCH_AFFINITY[profile.branch] ?? [] : []);
  return { explicit, affinity };
}

// ── Individual signals (each returns 0..1) ───────────────────────────────────

function skillSignal(o: Opportunity, profile: Profile): { score: number; matched: string[] } {
  const { explicit, affinity } = effectiveSkills(profile);
  const matched: string[] = [];
  let weightedMatches = 0;
  for (const tag of o.tags) {
    if (explicit.has(tag)) {
      weightedMatches += 1;
      matched.push(tag);
    } else if (affinity.has(tag)) {
      weightedMatches += 0.5;
    }
  }
  // Saturating: 1 strong match ≈ 0.49, 2 ≈ 0.74, 3 ≈ 0.86.
  const score = weightedMatches === 0 ? 0 : 1 - Math.exp(-weightedMatches / 1.5);
  return { score, matched: uniq(matched) };
}

function interestSignal(o: Opportunity, profile: Profile): number {
  if (!profile.interests?.length) return 0.5;
  return profile.interests.includes(o.category) ? 1 : 0.3;
}

function recencySignal(o: Opportunity, now: number): number {
  if (!o.postedAt) return 0.5; // unknown → neutral
  const t = new Date(o.postedAt).getTime();
  if (isNaN(t)) return 0.5;
  const ageDays = Math.max(0, (now - t) / MS_DAY);
  return Math.exp(-ageDays / 14); // ~10-day half-life
}

/** Peaks ~8 days out (sweet spot to act); penalises <2 days and far-off items. */
function urgencySignal(o: Opportunity, now: number): number {
  if (!o.deadline) return 0.35; // rolling / no deadline → not time-pressured
  const t = new Date(o.deadline).getTime();
  if (isNaN(t)) return 0.35;
  const days = (t - now) / MS_DAY;
  if (days <= 0) return 0;
  if (days < 2) return 0.55; // might be too late — slight penalty
  const z = Math.log(days / 8) / 1.1; // log-normal around 8 days
  return clamp(Math.exp(-(z * z) / 2), 0, 1);
}

function popularitySignal(o: Opportunity, maxPop: number): number {
  if (o.popularity == null || o.popularity <= 0) return 0.5; // unknown → neutral
  if (maxPop <= 0) return 0.5;
  return Math.log1p(o.popularity) / Math.log1p(maxPop);
}

/**
 * Locality signal. Delegates to the geo layer so a commuter region counts as
 * local: a student in Delhi scores Noida / Gurugram / Ghaziabad events at 0.92
 * instead of the flat 0.4 a substring match used to give them.
 */
function locationSignal(o: Opportunity, profile: Profile, home: PlaceRef): Proximity {
  return proximity(o, home, { willingToRelocate: profile.willingToRelocate });
}

// ── Scoring ──────────────────────────────────────────────────────────────────

export function scoreOpportunity(
  o: Opportunity,
  profile: Profile,
  ctx: RankContext,
): ScoredOpportunity {
  const skill = skillSignal(o, profile);
  const home = ctx.home ?? resolveHome(profile.location, profile.state);
  const prox = locationSignal(o, profile, home);
  const raw: ScoreBreakdown = {
    skill: skill.score,
    interest: interestSignal(o, profile),
    recency: recencySignal(o, ctx.now),
    urgency: urgencySignal(o, ctx.now),
    popularity: popularitySignal(o, ctx.maxPop),
    location: prox.score,
  };

  const w = ctx.weights;
  const breakdown: ScoreBreakdown = {
    skill: raw.skill * (w.skill ?? 0),
    interest: raw.interest * (w.interest ?? 0),
    recency: raw.recency * (w.recency ?? 0),
    urgency: raw.urgency * (w.urgency ?? 0),
    popularity: raw.popularity * (w.popularity ?? 0),
    location: raw.location * (w.location ?? 0),
  };
  const score = clamp(
    breakdown.skill + breakdown.interest + breakdown.recency + breakdown.urgency + breakdown.popularity + breakdown.location,
    0,
    1,
  );

  const reasons = buildReasons(o, profile, raw, breakdown, skill.matched, ctx.now, prox);
  const matchLevel: 1 | 2 | 3 = score >= 0.66 ? 3 : score >= 0.42 ? 2 : 1;

  return { opportunity: o, score, breakdown, rawSignals: raw, reasons, matchLevel, proximity: prox };
}

/** Deterministic, template-based "why this matched you" — no LLM. */
function buildReasons(
  o: Opportunity,
  profile: Profile,
  raw: ScoreBreakdown,
  breakdown: ScoreBreakdown,
  matchedSkills: string[],
  now: number,
  prox: Proximity,
): string[] {
  const candidates: { key: SignalKey; weight: number; text: string }[] = [];

  if (matchedSkills.length) {
    const labels = matchedSkills.slice(0, 3).map((s) => SKILL_LABELS[s] ?? s);
    candidates.push({
      key: "skill",
      weight: breakdown.skill,
      text:
        matchedSkills.length === 1
          ? `Matches your skill: ${labels[0]}`
          : `Matches ${matchedSkills.length} of your skills: ${labels.join(", ")}`,
    });
  }

  if (profile.interests?.includes(o.category) && raw.interest >= 0.9) {
    candidates.push({ key: "interest", weight: breakdown.interest, text: `In your ${o.category}s feed` });
  }

  const dl = deadlineInfo(o.deadline, now);
  if (dl.urgency !== "none" && dl.urgency !== "passed") {
    const urgent = dl.urgency === "imminent" || dl.urgency === "soon";
    candidates.push({
      key: "urgency",
      weight: urgent ? 1 : breakdown.urgency, // always surface a near deadline
      text: dl.urgency === "imminent" ? `Closing ${dl.label}` : `Closes in ${dl.label.replace(" left", "")}`,
    });
  }

  if (o.popularity && o.popularity > 200) {
    const noun = o.category === "internship" ? "applicants" : "registered";
    candidates.push({
      key: "popularity",
      weight: breakdown.popularity,
      text: `${o.popularity.toLocaleString("en-IN")} ${noun}`,
    });
  }

  if (raw.recency > 0.8 && o.postedAt) {
    candidates.push({ key: "recency", weight: breakdown.recency, text: "Freshly posted" });
  }

  if (prox.tier === "city" || prox.tier === "metro") {
    // A genuinely local event is the strongest reason to show it — weight it
    // above the raw signal so it always makes the three-chip cut.
    candidates.push({
      key: "location",
      weight: 1,
      text: prox.label ?? (o.location ? `In ${o.location}` : "Near you"),
    });
  } else if (prox.tier === "state" && prox.label) {
    candidates.push({ key: "location", weight: breakdown.location, text: prox.label });
  } else if (o.isRemote || prox.tier === "remote") {
    candidates.push({ key: "location", weight: breakdown.location * 0.5, text: "Remote" });
  }

  return candidates
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((c) => c.text);
}

export interface RankOptions {
  now?: number;
  weights?: Record<string, number>;
  /** Browse-all mode: score everything (still drops closed), no eligibility hard-filter. */
  skipEligibility?: boolean;
}

export interface RankResult {
  items: ScoredOpportunity[];
  /** True when we relaxed eligibility because nothing passed (broadened matches). */
  broadened: boolean;
}

/**
 * Full pipeline: hard eligibility filter → weighted score → best-match sort.
 * If nothing passes, relax to deadline-only filtering and flag `broadened`.
 */
export function rank(opps: Opportunity[], profile: Profile, opts: RankOptions = {}): RankResult {
  const now = opts.now ?? Date.now();
  const weights = opts.weights ?? effectiveWeights(profile);

  const notClosed = (o: Opportunity) => {
    if (!o.deadline) return true;
    const t = new Date(o.deadline).getTime();
    return isNaN(t) || t >= now;
  };

  let broadened = false;
  let pool: Opportunity[];

  if (opts.skipEligibility) {
    // Home "browse all": the full live catalogue, only closed items dropped.
    pool = opps.filter(notClosed);
  } else {
    pool = opps.filter((o) => passesEligibility(o, profile, now).ok);
    if (pool.length === 0) {
      broadened = true;
      pool = opps.filter(notClosed);
    }
  }

  const maxPop = pool.reduce((m, o) => Math.max(m, o.popularity ?? 0), 0);
  // Parse the student's geography once per pass, not once per opportunity.
  const ctx: RankContext = { now, maxPop, weights, home: resolveHome(profile.location, profile.state) };

  const items = pool
    .map((o) => {
      const s = scoreOpportunity(o, profile, ctx);
      if (broadened) s.broadened = true;
      return s;
    })
    .sort((a, b) => b.score - a.score);

  return { items, broadened };
}
