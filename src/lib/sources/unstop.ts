import type { Opportunity, SourceAdapter } from "../types";
import { buildOpportunity, fetchJson, snippet, BROWSER_UA } from "./_shared";
import { buildTags } from "../normalize";
import { parseMoney, toDeadlineISO, toISO } from "../parse";

// ─────────────────────────────────────────────────────────────────────────────
// Unstop (formerly Dare2Compete) — the best single India-wide source; spans
// hackathons, competitions, internships/jobs and scholarships.
//
// Public search JSON, verified live 2026-06-22, zero-auth but REQUIRES a
// browser User-Agent (a bot UA 403s). Undocumented endpoint → tier "amber":
// we read only metadata, write our OWN summary, and always deep-link out to the
// origin listing. We never republish their content or act as the apply endpoint.
//
// GET https://unstop.com/api/public/opportunity/search-result
//        ?opportunity=<type>&page=1&per_page=15&oppstatus=open
// Nested shape (verified): { data: { data: Item[] , ... } }
// ─────────────────────────────────────────────────────────────────────────────

import type { Category } from "../types";

interface UnstopSkill {
  id?: number;
  skill?: string;
}
interface UnstopPrize {
  rank?: string;
  cash?: number | string | null;
  currency?: string | null; // e.g. "fa-rupee"
  currencyCode?: string | null; // e.g. "INR" | "USD"
  max_cash?: number | string | null;
}
interface UnstopOrg {
  id?: number;
  name?: string;
  public_url?: string;
}
interface UnstopRegn {
  start_regn_dt?: string;
  end_regn_dt?: string;
  remain_days?: string;
}
interface UnstopJobDetail {
  min_salary?: number | null;
  max_salary?: number | null;
  paid_unpaid?: string; // "paid" | "unpaid"
  pay_in?: string; // "monthly" | "yearly" | "one-time" ...
  currency?: string | null; // "fa-rupee"
  type?: string; // "wfh" | "in_office" | ...
}
interface UnstopItem {
  id?: number;
  title?: string;
  type?: string; // "hackathons" | "competitions" | "quizzes" | "jobs" | "scholarships"
  subtype?: string;
  public_url?: string; // relative, e.g. "hackathons/...-1702687"
  seo_url?: string; // absolute, e.g. "https://unstop.com/hackathons/...-1702687"
  region?: string; // "online" | "offline"
  end_date?: string; // ISO with +05:30
  updated_at?: string;
  approved_date?: string;
  registerCount?: number;
  viewsCount?: number;
  logoUrl2?: string;
  prizes?: UnstopPrize[];
  organisation?: UnstopOrg;
  organisation_name?: string;
  required_skills?: UnstopSkill[];
  regnRequirements?: UnstopRegn;
  jobDetail?: UnstopJobDetail;
}

interface UnstopResponse {
  data?: {
    data?: UnstopItem[];
    total?: number;
  };
}

// Which API "opportunity" param maps to which of our canonical categories.
const TYPE_PLAN: { param: string; category: Category }[] = [
  { param: "hackathons", category: "hackathon" },
  { param: "competitions", category: "competition" },
  { param: "internships", category: "internship" },
  { param: "scholarships", category: "scholarship" },
];

const PER_PAGE = 15;
const ENDPOINT = "https://unstop.com/api/public/opportunity/search-result";

/** Build the canonical deep-link to the origin listing on unstop.com. */
function originUrl(item: UnstopItem): string | undefined {
  const seo = item.seo_url?.trim();
  if (seo && /^https?:\/\//i.test(seo)) return seo;
  const rel = item.public_url?.trim();
  if (rel) return `https://unstop.com/${rel.replace(/^\/+/, "")}`;
  return undefined;
}

/** Total prize pool (sum of cash ranks) + dominant currency, from prizes[]. */
function prizeFromPrizes(prizes: UnstopPrize[] | undefined): { amount?: number; currency?: string } {
  if (!prizes || !prizes.length) return {};
  let total = 0;
  let sawUsd = false;
  let any = false;
  for (const p of prizes) {
    const raw = p.cash ?? p.max_cash;
    const n = typeof raw === "string" ? parseFloat(raw.replace(/[^\d.]/g, "")) : raw;
    if (typeof n === "number" && isFinite(n) && n > 0) {
      total += n;
      any = true;
    }
    const code = (p.currencyCode || p.currency || "").toLowerCase();
    if (/usd|dollar/.test(code)) sawUsd = true;
  }
  if (!any) return {};
  return { amount: total, currency: sawUsd ? "USD" : "INR" };
}

/** Map Unstop jobDetail.pay_in to our StipendPeriod. */
function stipendPeriod(payIn: string | undefined): "month" | "year" | "one-time" | "week" {
  const l = (payIn || "").toLowerCase();
  if (/year|annum|annual/.test(l)) return "year";
  if (/week/.test(l)) return "week";
  if (/month/.test(l)) return "month";
  return "month";
}

function normalize(item: UnstopItem, category: Category): Opportunity | null {
  const url = originUrl(item);
  const title = item.title?.trim();
  if (!url || !title) return null;

  const orgName = item.organisation?.name?.trim() || item.organisation_name?.trim();
  const skillNames = (item.required_skills ?? [])
    .map((s) => s.skill)
    .filter((s): s is string => !!s);

  // Deadline: prefer registration close; fall back to end_date.
  const deadline =
    toDeadlineISO(item.regnRequirements?.end_regn_dt) || toDeadlineISO(item.end_date);
  const startDate = toISO(item.regnRequirements?.start_regn_dt);

  // Remote detection: region "online", or a WFH internship.
  const region = (item.region || "").toLowerCase();
  const jobType = (item.jobDetail?.type || "").toLowerCase();
  const isRemote =
    /online|remote|virtual/.test(region) || /wfh|remote|work.?from.?home/.test(jobType) || undefined;

  // Unstop opportunities are India-centric and almost all are open to all
  // branches/years, so we set no eligibility we aren't certain of (missing = open).
  const tags = buildTags({ explicit: skillNames, text: title, limit: 8 });

  // Build our own factual summary (no verbatim republication).
  const summaryBits = [
    skillNames.slice(0, 4).join(", "),
    orgName ? `by ${orgName}` : undefined,
    item.regnRequirements?.remain_days,
  ].filter(Boolean);

  const base = {
    category,
    title,
    organization: orgName,
    sourceUrl: url,
    summary: snippet(summaryBits.join(" · ")),
    logoUrl: item.logoUrl2,
    isRemote,
    deadline,
    startDate,
    tags,
    popularity: typeof item.registerCount === "number" ? item.registerCount : undefined,
  };

  if (category === "internship") {
    const jd = item.jobDetail;
    let stipendMin: number | undefined;
    let stipendMax: number | undefined;
    let period: "month" | "year" | "one-time" | "week" | undefined;
    let currency: string | undefined;
    if (jd && (jd.paid_unpaid || "").toLowerCase() === "paid") {
      const min = typeof jd.min_salary === "number" ? jd.min_salary : undefined;
      const max = typeof jd.max_salary === "number" ? jd.max_salary : undefined;
      if (min != null || max != null) {
        stipendMin = min ?? max;
        stipendMax = max ?? min;
        period = stipendPeriod(jd.pay_in);
        currency = /usd|dollar/.test((jd.currency || "").toLowerCase()) ? "USD" : "INR";
      }
    } else if (jd && (jd.paid_unpaid || "").toLowerCase() === "unpaid") {
      stipendMin = 0;
      stipendMax = 0;
      period = "month";
      currency = "INR";
    }
    return buildOpportunity("unstop", "Unstop", {
      ...base,
      stipendMin,
      stipendMax,
      stipendPeriod: period,
      currency,
    });
  }

  if (category === "scholarship") {
    // Scholarship award, if any prize/cash is attached.
    const { amount, currency } = prizeFromPrizes(item.prizes);
    return buildOpportunity("unstop", "Unstop", {
      ...base,
      awardAmount: amount,
      currency: amount != null ? currency ?? "INR" : undefined,
    });
  }

  // competition | hackathon → prize pool.
  let prize = prizeFromPrizes(item.prizes);
  if (prize.amount == null) {
    // Fall back to parsing any free-text prize hints in the title/skills (rare).
    const money = parseMoney(title);
    if (money?.max) prize = { amount: money.max, currency: money.currency };
  }
  return buildOpportunity("unstop", "Unstop", {
    ...base,
    prizeAmount: prize.amount,
    currency: prize.amount != null ? prize.currency ?? "INR" : undefined,
  });
}

async function fetchType(param: string, category: Category): Promise<Opportunity[]> {
  const url = `${ENDPOINT}?opportunity=${encodeURIComponent(param)}&page=1&per_page=${PER_PAGE}&oppstatus=open`;
  const data = await fetchJson<UnstopResponse>(url, { ua: BROWSER_UA, timeoutMs: 12_000 });
  if (!data?.data || !Array.isArray(data.data.data)) {
    throw new Error("Unstop returned a malformed opportunity list.");
  }
  const items = data.data.data;
  const out: Opportunity[] = [];
  for (const item of items) {
    try {
      const o = normalize(item, category);
      if (o) out.push(o);
    } catch {
      // Skip a single malformed item; keep the rest.
    }
  }
  return out.slice(0, PER_PAGE);
}

export const unstopAdapter: SourceAdapter = {
  meta: {
    id: "unstop",
    label: "Unstop",
    category: "mixed",
    homepage: "https://unstop.com",
    tier: "amber",
  },
  async fetch(): Promise<Opportunity[]> {
    const out: Opportunity[] = [];
    const errors: string[] = [];

    // Fetch each type independently so one failing type doesn't sink the rest.
    const results = await Promise.allSettled(
      TYPE_PLAN.map((t) => fetchType(t.param, t.category)),
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled") {
        out.push(...r.value);
      } else {
        errors.push(`${TYPE_PLAN[i].param}: ${String(r.reason)}`);
      }
    }

    // Only throw if the ENTIRE source is unreachable (every type failed).
    if (!out.length && errors.length === TYPE_PLAN.length) {
      throw new Error(`Unstop unreachable — ${errors.join("; ")}`);
    }
    return out;
  },
};
