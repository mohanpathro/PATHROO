import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import webpush, { type PushSubscription } from "web-push";

// ─────────────────────────────────────────────────────────────────────────────
// Web Push (VAPID). For a zero-config local demo we generate a VAPID keypair on
// first use and persist it + the subscriptions to .cache so real browser push
// notifications work on localhost with no environment setup. In production these
// would come from env vars and a real datastore.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_DIR = path.join(process.cwd(), ".cache");
const VAPID_FILE = path.join(CACHE_DIR, "vapid.json");
const SUBS_FILE = path.join(CACHE_DIR, "subscriptions.json");

const SUBJECT = "https://opportunity-radar-theta.vercel.app";

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let cachedKeys: VapidKeys | null = null;

export async function getVapidKeys(): Promise<VapidKeys> {
  if (cachedKeys) return cachedKeys;
  // Prefer env if configured.
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cachedKeys = {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    };
    return cachedKeys;
  }
  try {
    const raw = await fs.readFile(VAPID_FILE, "utf-8");
    cachedKeys = JSON.parse(raw);
    return cachedKeys!;
  } catch {
    const keys = webpush.generateVAPIDKeys();
    cachedKeys = keys;
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(VAPID_FILE, JSON.stringify(keys), "utf-8");
    return keys;
  }
}

async function configure(): Promise<void> {
  const keys = await getVapidKeys();
  webpush.setVapidDetails(SUBJECT, keys.publicKey, keys.privateKey);
}

async function readSubs(): Promise<PushSubscription[]> {
  try {
    const raw = await fs.readFile(SUBS_FILE, "utf-8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeSubs(subs: PushSubscription[]): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(SUBS_FILE, JSON.stringify(subs), "utf-8");
}

export async function saveSubscription(sub: PushSubscription): Promise<void> {
  const subs = await readSubs();
  const endpoint = sub.endpoint;
  if (!subs.find((s) => s.endpoint === endpoint)) {
    subs.push(sub);
    await writeSubs(subs);
  }
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const subs = await readSubs();
  await writeSubs(subs.filter((s) => s.endpoint !== endpoint));
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Send to all stored subscriptions; prune any that have expired (410/404). */
export async function broadcast(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  await configure();
  const subs = await readSubs();
  if (!subs.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const stale: string[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload));
        sent++;
      } catch (err: unknown) {
        failed++;
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) stale.push(sub.endpoint);
      }
    }),
  );
  if (stale.length) await writeSubs(subs.filter((s) => !stale.includes(s.endpoint)));
  return { sent, failed };
}

export async function subscriptionCount(): Promise<number> {
  return (await readSubs()).length;
}
