import { NextResponse } from "next/server";
import { generateJSON, logAIError } from "@/lib/ai/groq";
import { aiRateLimit } from "@/lib/server/ai-guard";
import { smartTagsPrompt } from "@/lib/ai/prompts";
import { getCachedAI, setCachedAI, contentHash } from "@/lib/ai/cache";
import { getCorpus } from "@/lib/corpus";
import type { AISmartTags } from "@/lib/types";

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
    const cached = await getCachedAI<AISmartTags>("ai-tags", opportunityId, hash);
    if (cached) {
      return NextResponse.json({ tags: cached.tags, cached: true });
    }

    // Generate
    const { system, user } = smartTagsPrompt(opp);
    const result = await generateJSON<AISmartTags>(system, user);
    const tags = Array.isArray(result.tags) ? result.tags.slice(0, 6) : [];

    // Cache for 7 days
    await setCachedAI("ai-tags", opportunityId, { tags }, hash);

    return NextResponse.json({ tags, cached: false });
  } catch (err: unknown) {
    logAIError("AI Tags", err);
    return NextResponse.json({ error: "Failed to generate tags" }, { status: 500 });
  }
}
