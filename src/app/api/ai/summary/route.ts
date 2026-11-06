import { NextResponse } from "next/server";
import { generateJSON, logAIError } from "@/lib/ai/groq";
import { aiRateLimit } from "@/lib/server/ai-guard";
import { opportunitySummaryPrompt } from "@/lib/ai/prompts";
import { getCachedAI, setCachedAI, contentHash } from "@/lib/ai/cache";
import { getCorpus } from "@/lib/corpus";
import type { AISummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = aiRateLimit(req);
  if (limited) return limited;
  try {
    const { opportunityId } = await req.json();
    if (!opportunityId) {
      return NextResponse.json({ error: "opportunityId required" }, { status: 400 });
    }

    const corpus = await getCorpus();
    const opp = corpus.opportunities.find((o) => o.id === opportunityId);
    if (!opp) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }

    // Check cache
    const hash = contentHash(JSON.stringify({ title: opp.title, summary: opp.summary, tags: opp.tags }));
    const cached = await getCachedAI<AISummary>("ai-summaries", opportunityId, hash);
    if (cached) {
      return NextResponse.json({ summary: cached, cached: true });
    }

    // Generate
    const { system, user } = opportunitySummaryPrompt(opp);
    const summary = await generateJSON<AISummary>(system, user);

    // Cache for 7 days
    await setCachedAI("ai-summaries", opportunityId, summary, hash);

    return NextResponse.json({ summary, cached: false });
  } catch (err: unknown) {
    logAIError("AI Summary", err);
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
  }
}
