import { NextResponse } from "next/server";
import { getCorpus } from "@/lib/corpus";
import { sanitizeSourceRuns } from "@/lib/sources/diagnostics";
import { buildFeed, type FilterState, type SortKey } from "@/lib/feed";
import type { Profile } from "@/lib/types";

// Reads the live corpus and personalises per request — never statically cached.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const profile: Profile = body.profile ?? { interests: [], skills: [] };
  const filter: FilterState = body.filter ?? {};
  const sort: SortKey = body.sort ?? "closing";
  const scope: "all" | "eligible" = body.scope === "all" ? "all" : "eligible";

  const corpus = await getCorpus();
  const result = buildFeed(corpus, profile, filter, sort, Date.now(), scope);

  return NextResponse.json({
    ...result,
    updatedAt: corpus.updatedAt,
    runs: sanitizeSourceRuns(corpus.runs),
  });
}
