import type { Opportunity, SourceAdapter } from "../types";
import { buildTags } from "../normalize";
import { toISO } from "../parse";
import { BOT_UA, BROWSER_UA, buildOpportunity, fetchJson, snippet } from "./_shared";

// CodeChef public contest list JSON — verified live 2026-06-22, zero-auth.
// GET https://www.codechef.com/api/list/contests/all
//   → { status, present_contests:[], future_contests:[], past_contests:[], ... }
// We surface present + future (a student registers BEFORE start, so the act-by
// deadline is contest_start_date_iso). All contests are online competitions.
interface CodechefContest {
  contest_code: string;
  contest_name: string;
  contest_start_date?: string; // "24 Jun 2026  20:00:00"
  contest_end_date?: string;
  contest_start_date_iso?: string; // "2026-06-24T20:00:00+05:30"
  contest_end_date_iso?: string;
  contest_duration?: string; // minutes, e.g. "120"
  distinct_users?: number;
}
interface CodechefResponse {
  status?: string;
  present_contests?: CodechefContest[];
  future_contests?: CodechefContest[];
  past_contests?: CodechefContest[];
}

const ENDPOINT = "https://www.codechef.com/api/list/contests/all";

function durationLabel(minutesRaw: string | undefined): string | undefined {
  if (!minutesRaw) return undefined;
  const mins = parseInt(minutesRaw, 10);
  if (!Number.isFinite(mins) || mins <= 0) return undefined;
  if (mins < 60) return `${mins} min contest`;
  const hrs = mins / 60;
  // Whole hours read cleaner than "2.0 hr".
  const pretty = Number.isInteger(hrs) ? `${hrs}` : hrs.toFixed(1);
  return `${pretty} hr contest`;
}

function normalize(c: CodechefContest): Opportunity | null {
  const code = c.contest_code?.trim();
  const name = c.contest_name?.trim();
  if (!code || !name) return null;

  const sourceUrl = `https://www.codechef.com/${code}`;
  // Prefer the timezone-aware ISO field; fall back to the human string.
  const startDate = toISO(c.contest_start_date_iso ?? c.contest_start_date);
  const durLabel = durationLabel(c.contest_duration);

  const summary = snippet(
    [durLabel, "Online competitive-programming contest on CodeChef"]
      .filter(Boolean)
      .join(" · "),
  );

  return buildOpportunity("codechef", "CodeChef", {
    category: "competition",
    title: name,
    organization: "CodeChef",
    sourceUrl,
    summary,
    location: "Online",
    isRemote: true,
    // You register before it starts, so the act-by deadline is the start time.
    deadline: startDate,
    startDate,
    tags: buildTags({
      explicit: ["competitive-programming", "c-cpp"],
      text: name,
      limit: 8,
    }),
    popularity: typeof c.distinct_users === "number" ? c.distinct_users : undefined,
  });
}

export const codechefAdapter: SourceAdapter = {
  meta: {
    id: "codechef",
    label: "CodeChef",
    category: "competition",
    homepage: "https://www.codechef.com",
    tier: "green",
  },
  async fetch(): Promise<Opportunity[]> {
    // CodeChef occasionally 403s a bare bot UA; retry with a browser UA.
    let data: CodechefResponse;
    try {
      data = await fetchJson<CodechefResponse>(ENDPOINT, { ua: BOT_UA, timeoutMs: 12_000 });
    } catch {
      data = await fetchJson<CodechefResponse>(ENDPOINT, { ua: BROWSER_UA, timeoutMs: 12_000 });
    }

    if (!Array.isArray(data.present_contests) || !Array.isArray(data.future_contests)) {
      throw new Error("CodeChef API returned a malformed contest list.");
    }
    const contests = [...(data.present_contests ?? []), ...(data.future_contests ?? [])];
    const out: Opportunity[] = [];
    const seen = new Set<string>();
    for (const c of contests) {
      let o: Opportunity | null = null;
      try {
        o = normalize(c);
      } catch {
        o = null; // skip a malformed row, keep the rest
      }
      if (o && !seen.has(o.id)) {
        seen.add(o.id);
        out.push(o);
      }
    }
    return out;
  },
};
