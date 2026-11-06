import { promises as fs } from "node:fs";
import path from "node:path";
import type { Opportunity, SourceRun } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Server-side corpus cache. The frontend NEVER scrapes per request — it reads
// this cache. A background refresh (triggered on staleness or via /api/ingest)
// runs the adapters and writes here. If every live source fails we keep serving
// the last good snapshot (graceful degradation).
// ─────────────────────────────────────────────────────────────────────────────

export interface Corpus {
  opportunities: Opportunity[];
  runs: SourceRun[];
  updatedAt: string;
}

const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "corpus.json");

/** Time-to-live before the corpus is considered stale and a refresh is wanted. */
export const CORPUS_TTL_MS = 30 * 60 * 1000; // 30 min

// Module-level in-memory cache survives across requests in a warm server.
let memory: Corpus | null = null;
let inflight: Promise<Corpus> | null = null;

async function readDisk(): Promise<Corpus | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Corpus;
    if (parsed && Array.isArray(parsed.opportunities)) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function writeDisk(corpus: Corpus): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(corpus), "utf-8");
  } catch {
    // Non-fatal: memory cache still serves the request.
  }
}

export function corpusAgeMs(corpus: Corpus | null): number {
  if (!corpus) return Infinity;
  const t = new Date(corpus.updatedAt).getTime();
  return isNaN(t) ? Infinity : Date.now() - t;
}

export function isFresh(corpus: Corpus | null): boolean {
  return corpusAgeMs(corpus) < CORPUS_TTL_MS;
}

/** Read the best available corpus without forcing a refresh. */
export async function peekCorpus(): Promise<Corpus | null> {
  if (memory) return memory;
  const disk = await readDisk();
  if (disk) memory = disk;
  return memory;
}

export async function setCorpus(corpus: Corpus): Promise<Corpus> {
  memory = corpus;
  await writeDisk(corpus);
  return corpus;
}

/**
 * Run an aggregation, de-duping a refresh stampede. `producer` returns the
 * freshly aggregated corpus (the aggregator wires this up). On failure we fall
 * back to whatever snapshot we already have.
 */
export async function refreshCorpus(
  producer: () => Promise<Corpus>,
): Promise<Corpus> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const fresh = await producer();
      // Never let a transient empty run wipe a good snapshot.
      if (fresh.opportunities.length === 0) {
        const prev = await peekCorpus();
        if (prev && prev.opportunities.length > 0) {
          return setCorpus({ ...prev, runs: fresh.runs });
        }
      }
      return setCorpus(fresh);
    } catch {
      const prev = await peekCorpus();
      if (prev) return prev;
      const empty: Corpus = { opportunities: [], runs: [], updatedAt: new Date().toISOString() };
      return empty;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
