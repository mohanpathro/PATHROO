import type { Opportunity, SourceAdapter } from "../types";
import { buildTags } from "../normalize";
import { parseMoney, toDeadlineISO } from "../parse";
import { buildOpportunity, fetchJson, snippet } from "./_shared";

// Kaggle competitions API — free token from kaggle.com → Account → "Create New API Token"
// (the kaggle.json gives `username` + `key`). HTTP Basic auth. Env-gated.
// GET https://www.kaggle.com/api/v1/competitions/list?page=N
interface KaggleComp {
  ref?: string;
  title?: string;
  url?: string;
  description?: string;
  deadline?: string;
  category?: string;
  reward?: string;
  organizationName?: string;
  teamCount?: number;
}

export const kaggleAdapter: SourceAdapter = {
  meta: {
    id: "kaggle",
    label: "Kaggle",
    category: "competition",
    homepage: "https://www.kaggle.com",
    tier: "green",
  },
  async fetch(): Promise<Opportunity[]> {
    const user = process.env.KAGGLE_USERNAME;
    const key = process.env.KAGGLE_KEY;
    if (!user || !key) throw new Error("Not configured — set KAGGLE_USERNAME & KAGGLE_KEY in .env.local");

    const auth = Buffer.from(`${user}:${key}`).toString("base64");
    const out: Opportunity[] = [];
    for (let page = 1; page <= 2; page++) {
      const data = await fetchJson<KaggleComp[]>(`https://www.kaggle.com/api/v1/competitions/list?page=${page}`, {
        headers: { Authorization: `Basic ${auth}` },
        timeoutMs: 12_000,
      });
      if (!Array.isArray(data) || data.length === 0) break;
      for (const c of data) {
        if (!c.title) continue;
        const url = c.url
          ? c.url.startsWith("http")
            ? c.url
            : `https://www.kaggle.com${c.url}`
          : `https://www.kaggle.com/competitions/${c.ref ?? ""}`;
        const money = c.reward ? parseMoney(c.reward) : undefined;
        out.push(
          buildOpportunity("kaggle", "Kaggle", {
            category: "competition",
            title: c.title.trim(),
            organization: c.organizationName || "Kaggle",
            sourceUrl: url,
            summary: snippet(c.description),
            isRemote: true,
            location: "Online",
            deadline: toDeadlineISO(c.deadline),
            tags: buildTags({ explicit: ["machine-learning", "data-science", "python"], text: c.title, limit: 8 }),
            prizeAmount: money?.max && money.max > 0 ? money.max : undefined,
            currency: money?.currency ?? "USD",
            popularity: c.teamCount,
          }),
        );
      }
    }
    return out;
  },
};
