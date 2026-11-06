import type { Opportunity } from "../types";
import { stableHash } from "../utils";

/** Honest, contactable bot identity (per the compliance/legality research). */
export const BOT_UA =
  "PATHROOBot/1.0 (+https://opportunity-radar-theta.vercel.app; student opportunity aggregator; contact: hello@Argus.app)";

/** A browser-ish UA for the handful of endpoints that 403 a bot UA (e.g. Unstop). */
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface FetchOpts {
  timeoutMs?: number;
  headers?: Record<string, string>;
  ua?: string;
  method?: string;
  body?: string;
}

async function doFetch(url: string, opts: FetchOpts = {}): Promise<Response> {
  const { timeoutMs = 12_000, headers = {}, ua = BOT_UA, method = "GET", body } = opts;
  const res = await fetch(url, {
    method,
    headers: {
      "User-Agent": ua,
      Accept: "application/json, text/plain, */*",
      ...headers,
    },
    body,
    signal: AbortSignal.timeout(timeoutMs),
    // We are a server-side aggregator; never send cookies.
    cache: "no-store",
  });
  if (!res.ok) {
    const hostname = new URL(url).hostname;
    throw new Error(`HTTP ${res.status} from ${hostname}`);
  }
  return res;
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await doFetch(url, opts);
  return (await res.json()) as T;
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const res = await doFetch(url, { ...opts, headers: { Accept: "text/html,*/*", ...opts.headers } });
  return await res.text();
}

/** Stable id from source + canonical URL (the dedupe key as well). */
export function makeId(source: string, url: string): string {
  return `${source}:${stableHash(url || Math.random().toString())}`;
}

/**
 * Only allow http(s) absolute URLs from third-party sources. Scraped/API data
 * is untrusted — a `javascript:`/`data:` value would otherwise become a live
 * clickable link (or image src) rendered in the app. Returns a clean URL or
 * undefined.
 */
export function safeExternalUrl(url: string | undefined | null): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Construct a fully-formed Opportunity, filling the bookkeeping fields and
 * normalising arrays so adapters only supply the meaningful bits.
 */
export function buildOpportunity(
  source: string,
  sourceLabel: string,
  partial: Omit<Opportunity, "id" | "source" | "sourceLabel" | "lastVerified" | "tags"> & {
    tags?: string[];
  },
): Opportunity {
  const sourceUrl = partial.sourceUrl;
  return {
    ...partial,
    // Scrub untrusted third-party URLs down to safe http(s) values so they can
    // never render as a javascript:/data: link or image source in the UI.
    sourceUrl: safeExternalUrl(sourceUrl) ?? "",
    imageUrl: safeExternalUrl(partial.imageUrl),
    logoUrl: safeExternalUrl(partial.logoUrl),
    id: makeId(source, sourceUrl),
    source,
    sourceLabel,
    tags: partial.tags ?? [],
    lastVerified: new Date().toISOString(),
  };
}

/** Clean and clamp a free-text summary to a tidy snippet (facts, not republication). */
export function snippet(text: string | undefined | null, max = 220): string | undefined {
  if (!text) return undefined;
  const clean = text
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return undefined;
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
}
