import type { Opportunity, SourceAdapter } from "../types";
import { buildOpportunity, fetchJson } from "./_shared";

// Codeforces official API — documented, zero-auth, rate limit 1 req / 2s.
// GET https://codeforces.com/api/contest.list?gym=false
interface CFContest {
  id: number;
  name: string;
  type: string; // CF | ICPC
  phase: string; // BEFORE = upcoming
  durationSeconds: number;
  startTimeSeconds?: number;
}
interface CFResponse {
  status: string; // "OK"
  result: CFContest[];
}

function normalize(c: CFContest): Opportunity | null {
  if (c.phase !== "BEFORE" || !c.startTimeSeconds) return null;
  const startMs = c.startTimeSeconds * 1000;
  const start = new Date(startMs).toISOString();
  const url = `https://codeforces.com/contests/${c.id}`;
  const hours = Math.round(c.durationSeconds / 3600);

  return buildOpportunity("codeforces", "Codeforces", {
    category: "competition",
    title: c.name.trim(),
    organization: "Codeforces",
    sourceUrl: url,
    summary: `Competitive programming round · ${hours ? `${hours}h` : "timed"} · register before it begins`,
    isRemote: true,
    location: "Online",
    // For a contest you must register before it starts, so the start time IS the deadline.
    deadline: start,
    startDate: start,
    tags: ["competitive-programming", "c-cpp"],
  });
}

export const codeforcesAdapter: SourceAdapter = {
  meta: {
    id: "codeforces",
    label: "Codeforces",
    category: "competition",
    homepage: "https://codeforces.com",
    tier: "green",
  },
  async fetch(): Promise<Opportunity[]> {
    const data = await fetchJson<CFResponse>("https://codeforces.com/api/contest.list?gym=false", {
      timeoutMs: 12_000,
    });
    if (data.status !== "OK" || !Array.isArray(data.result)) {
      throw new Error("Codeforces API returned an unsuccessful or malformed response.");
    }
    const out: Opportunity[] = [];
    for (const c of data.result) {
      const o = normalize(c);
      if (o) out.push(o);
    }
    return out;
  },
};
