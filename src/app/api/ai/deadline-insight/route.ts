import { NextResponse } from "next/server";
import { generateText, logAIError } from "@/lib/ai/groq";
import { aiRateLimit } from "@/lib/server/ai-guard";
import { deadlineInsightPrompt } from "@/lib/ai/prompts";
import { getCachedAI, setCachedAI, contentHash } from "@/lib/ai/cache";
import { getCorpus } from "@/lib/corpus";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = aiRateLimit(req);
  if (limited) return limited;
  try {
    const { opportunityId, profile } = (await req.json()) as {
      opportunityId: string;
      profile: Profile;
    };
    if (!opportunityId) {
      return NextResponse.json({ error: "opportunityId required" }, { status: 400 });
    }

    const corpus = await getCorpus();
    const opp = corpus.opportunities.find((o) => o.id === opportunityId);
    if (!opp) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }

    if (!opp.deadline) {
      return NextResponse.json({ insight: "This opportunity has a rolling deadline — apply at your own pace." });
    }

    // Check cache (1 day TTL — deadline context changes daily)
    const hash = contentHash(opp.id + opp.deadline + new Date().toISOString().split("T")[0]);
    const cached = await getCachedAI<{ insight: string }>("ai-deadline-insights", opp.id, hash);
    if (cached) {
      return NextResponse.json({ insight: cached.insight, cached: true });
    }

    const prof: Profile = profile ?? { interests: [], skills: [] };
    const { system, user } = deadlineInsightPrompt(opp, prof);
    const insight = await generateText(system, user);

    await setCachedAI("ai-deadline-insights", opp.id, { insight }, hash, 24 * 60 * 60 * 1000);

    return NextResponse.json({ insight, cached: false });
  } catch (err: unknown) {
    logAIError("AI Deadline", err);
    return NextResponse.json({ error: "Failed to generate deadline insight" }, { status: 500 });
  }
}
