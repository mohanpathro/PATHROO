import * as chrono from "chrono-node";

/**
 * Coerce many date representations into an ISO string (or undefined).
 * Accepts: Date, epoch seconds, epoch ms, ISO/loose strings.
 */
export function toISO(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return isNaN(+value) ? undefined : value.toISOString();
  if (typeof value === "number") {
    // Heuristic: < 1e12 → seconds, else ms.
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return isNaN(+d) ? undefined : d.toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const direct = new Date(trimmed);
    if (!isNaN(+direct) && /\d{4}/.test(trimmed)) return direct.toISOString();
    // Fall back to natural-language parsing.
    const parsed = chrono.parseDate(trimmed, new Date());
    return parsed ? parsed.toISOString() : undefined;
  }
  return undefined;
}

/** A date-only application deadline stays open through the full stated date. */
export function toDeadlineISO(value: unknown): string | undefined {
  if (typeof value === "string") {
    const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(value.trim());
    if (dateOnly) {
      const date = new Date(`${dateOnly[1]}T00:00:00.000Z`);
      if (isNaN(+date) || date.toISOString().slice(0, 10) !== dateOnly[1]) return undefined;
      return `${dateOnly[1]}T23:59:59.999Z`;
    }
  }
  return toISO(value);
}

/**
 * Parse a human date *range* like "May 19 - Aug 17, 2026" and return the END
 * (the close date that matters for deadlines). Falls back to the single date.
 */
export function parseRangeEnd(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const results = chrono.parse(text, new Date(), { forwardDate: true });
  if (!results.length) return undefined;
  const last = results[results.length - 1];
  const end = last.end ?? last.start;
  const d = end.date();
  if (isNaN(+d)) return undefined;
  if (!end.isCertain("hour")) d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

export function parseRangeStart(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const results = chrono.parse(text, new Date(), { forwardDate: true });
  if (!results.length) return undefined;
  const d = results[0].start.date();
  return isNaN(+d) ? undefined : d.toISOString();
}

export interface MoneyParse {
  min?: number;
  max?: number;
  currency: string;
}

const CURRENCY_HINTS: [RegExp, string][] = [
  [/₹|rs\.?|inr|rupees?/i, "INR"],
  [/\$|usd|dollars?/i, "USD"],
  [/€|eur/i, "EUR"],
  [/£|gbp/i, "GBP"],
];

/**
 * Parse messy money strings: "Rs 10,000-15,000/month", "$50,000 in prizes",
 * "₹2 Lakh", "Unpaid". Returns min/max + detected currency.
 */
export function parseMoney(text: string | undefined): MoneyParse | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  if (/unpaid|no stipend|not disclosed|performance based/.test(lower)) {
    return { min: 0, max: 0, currency: "INR" };
  }

  let currency = "INR";
  for (const [re, cur] of CURRENCY_HINTS) {
    if (re.test(text)) {
      currency = cur;
      break;
    }
  }

  // Normalise lakh/crore/k multipliers attached to numbers.
  const nums: number[] = [];
  const re = /([\d,]+(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr|k|thousand|million|m)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let n = parseFloat(m[1].replace(/,/g, ""));
    if (isNaN(n)) continue;
    const unit = (m[2] || "").toLowerCase();
    if (/lakh|lac/.test(unit)) n *= 100000;
    else if (/crore|cr/.test(unit)) n *= 10000000;
    else if (unit === "k" || unit === "thousand") n *= 1000;
    else if (unit === "m" || unit === "million") n *= 1000000;
    if (n > 0) nums.push(n);
  }
  if (!nums.length) return undefined;
  nums.sort((a, b) => a - b);
  return { min: nums[0], max: nums[nums.length - 1], currency };
}

export type StipendPeriod = "month" | "year" | "one-time" | "week";

export function detectPeriod(text: string | undefined): StipendPeriod {
  if (!text) return "month";
  const l = text.toLowerCase();
  if (/year|annum|p\.?a\.?|annual/.test(l)) return "year";
  if (/week/.test(l)) return "week";
  if (/month|p\.?m\.?|\/mo|monthly/.test(l)) return "month";
  return "one-time";
}
