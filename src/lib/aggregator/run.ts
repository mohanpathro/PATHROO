import { CATEGORIES, type Opportunity, type SourceAdapter, type SourceRun } from "../types";
import type { Corpus } from "../store";
import { ADAPTERS } from "../sources";
import { sanitizeSourceError } from "../sources/diagnostics";
import { dedupeOpportunities } from "../dedupe";

interface AdapterOutcome {
  run: SourceRun;
  opportunities: Opportunity[];
}

function validOpportunity(value: Opportunity, sourceId: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (value.source !== sourceId || !CATEGORIES.includes(value.category)) return false;
  if (typeof value.title !== "string" || !value.title.trim()) return false;
  if (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== "string")) return false;
  try {
    const url = new URL(value.sourceUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  } catch {
    return false;
  }
  for (const date of [value.deadline, value.startDate, value.postedAt, value.lastVerified]) {
    if (date !== undefined && !Number.isFinite(Date.parse(date))) return false;
  }
  return true;
}

function isExpired(opportunity: Opportunity, now: number): boolean {
  return !!opportunity.deadline && Date.parse(opportunity.deadline) < now;
}

async function runAdapter(adapter: SourceAdapter): Promise<AdapterOutcome> {
  const started = Date.now();
  try {
    const fetched = await adapter.fetch();
    const now = Date.now();
    const valid = fetched.filter((item) => validOpportunity(item, adapter.meta.id));
    const opportunities = valid.filter((item) => !isExpired(item, now));
    return {
      opportunities,
      run: {
        id: adapter.meta.id,
        label: adapter.meta.label,
        ok: true,
        count: opportunities.length,
        expiredCount: valid.length - opportunities.length,
        invalidCount: fetched.length - valid.length,
        durationMs: Date.now() - started,
        ranAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      opportunities: [],
      run: {
        id: adapter.meta.id,
        label: adapter.meta.label,
        ok: false,
        count: 0,
        durationMs: Date.now() - started,
        error: sanitizeSourceError(err),
        ranAt: new Date().toISOString(),
      },
    };
  }
}

/**
 * Run every adapter concurrently (isolated — one failure never sinks the run),
 * merge + dedupe, and return a fresh corpus snapshot.
 */
export async function aggregate(adapters: SourceAdapter[] = ADAPTERS): Promise<Corpus> {
  const settled = await Promise.allSettled(adapters.map(runAdapter));

  const runs: SourceRun[] = [];
  const all: Opportunity[] = [];
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status === "fulfilled") {
      runs.push(s.value.run);
      all.push(...s.value.opportunities);
    } else {
      const a = adapters[i];
      runs.push({
        id: a.meta.id,
        label: a.meta.label,
        ok: false,
        count: 0,
        durationMs: 0,
        error: sanitizeSourceError(s.reason),
        ranAt: new Date().toISOString(),
      });
    }
  }

  const deduped = dedupeOpportunities(all);
  const duplicateCount = all.length - deduped.length;
  if (duplicateCount > 0) {
    console.info(`[Ingestion] Removed ${duplicateCount} duplicate opportunities.`);
  }
  return { opportunities: deduped, runs, updatedAt: new Date().toISOString() };
}
