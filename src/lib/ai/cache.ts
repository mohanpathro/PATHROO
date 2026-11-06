import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// File-based AI response cache. Follows the same pattern as the corpus cache
// (.cache/corpus.json) — no extra dependencies, no Firebase Admin SDK needed.
//
// Cache is keyed by collection + docId, stored as individual JSON files under
// .cache/ai/<collection>/<docId>.json
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_ROOT = path.join(process.cwd(), ".cache", "ai");

/** Simple SHA-256 content hash for cache invalidation. */
export function contentHash(data: string): string {
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

export interface CachedEntry<T> {
  data: T;
  generatedAt: string;
  contentHash: string;
  expiresAt: number; // epoch ms
}

function filePath(collection: string, docId: string): string {
  const safe = docId.replace(/[/:]/g, "_").slice(0, 200);
  return path.join(CACHE_ROOT, collection, `${safe}.json`);
}

/**
 * Read a cached AI response. Returns null if not found, expired,
 * or if the content hash doesn't match (the opportunity changed).
 */
export async function getCachedAI<T>(
  collection: string,
  docId: string,
  expectedHash?: string,
): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath(collection, docId), "utf-8");
    const entry = JSON.parse(raw) as CachedEntry<T>;

    // Check expiry
    if (entry.expiresAt < Date.now()) return null;

    // Check content hash — regenerate if the opportunity changed
    if (expectedHash && entry.contentHash !== expectedHash) return null;

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Write an AI response to the file cache.
 * @param ttlMs Time-to-live in milliseconds (default: 7 days)
 */
export async function setCachedAI<T>(
  collection: string,
  docId: string,
  data: T,
  hash: string,
  ttlMs = 7 * 24 * 60 * 60 * 1000,
): Promise<void> {
  try {
    const fp = filePath(collection, docId);
    await fs.mkdir(path.dirname(fp), { recursive: true });
    const entry: CachedEntry<T> = {
      data,
      generatedAt: new Date().toISOString(),
      contentHash: hash,
      expiresAt: Date.now() + ttlMs,
    };
    await fs.writeFile(fp, JSON.stringify(entry), "utf-8");
  } catch {
    console.warn("[AI Cache] Write failed");
  }
}
