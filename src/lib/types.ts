// ─────────────────────────────────────────────────────────────────────────────
// Canonical domain types for PATHROO.
// Every live source normalises INTO `Opportunity`. The whole app reads this one
// shape — the feed, the ranking engine, the nudge scheduler, the UI cards.
// ─────────────────────────────────────────────────────────────────────────────

export type Category = "internship" | "scholarship" | "competition" | "hackathon" | "event";

export const CATEGORIES: Category[] = [
  "internship",
  "scholarship",
  "competition",
  "hackathon",
  "event",
];

export type SocialCategory = "general" | "obc" | "sc" | "st" | "ews";
export type Gender = "male" | "female" | "other" | "prefer-not";

/**
 * Eligibility constraints parsed from a source. CRITICAL RULE (per research):
 * a missing / unparseable field means OPEN (eligible). We only ever hard-filter
 * on high-confidence parsed fields so noisy scraped data never wrongly hides a
 * valid opportunity.
 */
export interface Eligibility {
  /** Normalised branch slugs eligible. Empty/undefined = open to all branches. */
  branches?: string[];
  /** Years of study eligible, e.g. [2,3,4]. Empty/undefined = open to all years. */
  years?: number[];
  /** Minimum CGPA on a 10-point scale. */
  minCGPA?: number;
  /** State slugs (scholarship geo-gating). Empty/undefined = all-India. */
  states?: string[];
  /** Reserved categories eligible (SC/ST/OBC/EWS). Empty/undefined = open. */
  socialCategories?: SocialCategory[];
  /** Gender restriction (e.g. girl-child scholarships). Undefined = any. */
  gender?: "female" | "male";
  /** ISO country code if citizenship is required, e.g. "IN". */
  citizenship?: string;
  /** Original eligibility text, kept for provenance + the detail view. */
  raw?: string;
}

export type StipendPeriod = "month" | "year" | "one-time" | "week";

export interface Opportunity {
  /** Stable id: `${source}:${sha1(canonicalUrl)}` */
  id: string;
  /** Adapter id, e.g. "devpost". */
  source: string;
  /** Human label for the source, e.g. "Devpost". */
  sourceLabel: string;
  /** Deep-link to apply / register at the ORIGIN. We never are the endpoint. */
  sourceUrl: string;

  category: Category;
  title: string;
  organization?: string;
  /** Our own short summary / snippet (facts, not verbatim republication). */
  summary?: string;

  /** Banner / cover image (e.g. a hackathon cover) when the source provides one. */
  imageUrl?: string;
  /** Square org / source logo when the source provides one. */
  logoUrl?: string;

  location?: string;
  isRemote?: boolean;

  /** Normalised tags drawn from the shared controlled vocabulary. */
  tags: string[];

  /** Apply-by / registration-close date (ISO). The heart of the product. */
  deadline?: string;
  /** Event / program start date (ISO). */
  startDate?: string;
  /** When the opportunity was posted/published (ISO) — drives recency score. */
  postedAt?: string;

  // ── Value signals (one of these depending on category) ──────────────────────
  stipendMin?: number;
  stipendMax?: number;
  stipendPeriod?: StipendPeriod;
  /** Scholarship award amount. */
  awardAmount?: number;
  /** Competition / hackathon total prize pool. */
  prizeAmount?: number;
  /** ISO 4217, e.g. "INR" | "USD". */
  currency?: string;

  /** Registrations / applicants — popularity signal. */
  popularity?: number;

  eligibility?: Eligibility;

  /** ISO timestamp this row was fetched/verified. */
  lastVerified: string;
  /** True when the row wasn't seen in the latest refresh (served as stale). */
  stale?: boolean;
}

// ─── Source adapter contract ────────────────────────────────────────────────

export interface SourceMeta {
  id: string;
  label: string;
  /** Primary category the source serves (or "mixed"). */
  category: Category | "mixed";
  homepage: string;
  /** Access tier: green = API/JSON, amber = polite scrape, seed = curated. */
  tier: "green" | "amber" | "seed";
}

export interface SourceAdapter {
  meta: SourceMeta;
  /** Fetch + normalise. Throws on failure (orchestrator isolates per-source). */
  fetch(): Promise<Opportunity[]>;
}

export interface SourceRun {
  id: string;
  label: string;
  ok: boolean;
  count: number;
  expiredCount?: number;
  invalidCount?: number;
  durationMs: number;
  error?: string;
  ranAt: string;
}

// ─── Student profile ────────────────────────────────────────────────────────

export interface Profile {
  name?: string;
  /** Branch slug, see taxonomy.BRANCHES. */
  branch?: string;
  /** Year of study 1–5. */
  year?: number;
  /** Categories the student wants in their feed. */
  interests: Category[];
  /** Normalised skill slugs. */
  skills: string[];
  cgpa?: number;
  /** Home state slug. */
  state?: string;
  socialCategory?: SocialCategory;
  gender?: Gender;
  /** Home city (free text). */
  location?: string;
  willingToRelocate?: boolean;
  remoteOnly?: boolean;
  degree?: string;
  college?: string;
  email?: string;
  createdAt?: string;
  onboarded?: boolean;
}

// ─── Ranking output ─────────────────────────────────────────────────────────

export interface ScoreBreakdown {
  skill: number;
  interest: number;
  recency: number;
  urgency: number;
  popularity: number;
  location: number;
  semantic?: number;
}

export interface ScoredOpportunity {
  opportunity: Opportunity;
  /** Final 0–1 relevance score. */
  score: number;
  /** Weighted contribution of each signal (already multiplied by its weight). */
  breakdown: ScoreBreakdown;
  /** Raw 0–1 sub-scores before weighting (for the debug panel). */
  rawSignals: ScoreBreakdown;
  /** Deterministic, templated "why this matched you" chips. */
  reasons: string[];
  /** 1–3 signal-strength bars for the card glyph. */
  matchLevel: 1 | 2 | 3;
  /** True when the item survived only because of relaxed (broadened) filters. */
  broadened?: boolean;
  /** How local this is to the student — see lib/geo.proximity. */
  proximity?: import("./geo").Proximity;
}

// ─── Nudges ─────────────────────────────────────────────────────────────────

export type NudgeWindow = "T-14d" | "T-7d" | "T-3d" | "T-1d" | "T-3h";
export type NudgeChannel = "in-app" | "push" | "email" | "telegram" | "calendar";

export interface Nudge {
  id: string;
  opportunityId: string;
  title: string;
  window: NudgeWindow;
  /** ISO time the nudge is scheduled to fire. */
  fireAt: string;
  /** Pre-rendered, loss-aversion-framed copy. */
  message: string;
  channel: NudgeChannel;
  deadline?: string;
  sourceUrl: string;
  category: Category;
  /** Whether this nudge's window has already elapsed (i.e. would have fired). */
  due: boolean;
  read?: boolean;
  snoozedUntil?: string;
}

// ─── AI types ───────────────────────────────────────────────────────────────

/** AI-generated structured summary for an opportunity. */
export interface AISummary {
  what: string;
  whoShouldApply: string;
  keyEligibility: string;
  skillsRequired: string[];
  benefits: string;
  importantDeadlines: string;
  estimatedDifficulty: "Beginner" | "Intermediate" | "Advanced";
}

/** AI-generated match explanation. */
export interface AIMatchReason {
  explanation: string;
  matchStrength: "Strong" | "Moderate" | "Weak";
}

/** AI-generated smart tags. */
export interface AISmartTags {
  tags: string[];
}

/** AI-generated deadline intelligence. */
export interface AIDeadlineInsight {
  insight: string;
}

/** Resume analysis result. */
export interface ResumeAnalysis {
  matchScore: number;
  extractedSkills: string[];
  extractedTechnologies: string[];
  education: string;
  projects: string[];
  missingSkills: string[];
  strengths: string[];
  improvements: string[];
}

/** One row of the comparison table. */
export interface ComparisonRow {
  opportunityId: string;
  title: string;
  eligibility: string;
  difficulty: string;
  benefits: string;
  learningValue: string;
  careerImpact: string;
  deadline: string;
  recommendation: string;
}

/** AI comparison result. */
export interface ComparisonResult {
  rows: ComparisonRow[];
  bestPick: string;
  bestPickReason: string;
}

/** Weekly digest. */
export interface WeeklyDigest {
  summary: string;
  highlights: { category: string; count: number; note: string }[];
  urgentDeadlines: { title: string; daysLeft: number }[];
}
