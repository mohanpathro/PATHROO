import { NextResponse } from "next/server";
import { getCorpus } from "@/lib/corpus";
import { sanitizeSourceRuns } from "@/lib/sources/diagnostics";

export const dynamic = "force-dynamic";

export async function GET() {
  // Read-only public endpoint: always serves the cached corpus (stale-while-
  // revalidate handled internally). A forced blocking re-aggregation is NOT
  // exposed here — that is an expensive, abuse-prone operation and lives behind
  // the INGEST_SECRET-gated /api/ingest route only.
  const corpus = await getCorpus();
  return NextResponse.json({
    count: corpus.opportunities.length,
    updatedAt: corpus.updatedAt,
    runs: sanitizeSourceRuns(corpus.runs),
    opportunities: corpus.opportunities,
  });
}
