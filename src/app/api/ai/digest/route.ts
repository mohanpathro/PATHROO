import { NextResponse } from "next/server";
import { generateJSON, logAIError } from "@/lib/ai/groq";
import { aiRateLimit } from "@/lib/server/ai-guard";
import { weeklyDigestPrompt } from "@/lib/ai/prompts";
import { getCorpus } from "@/lib/corpus";
import { rank } from "@/lib/rank";
import type { Profile, WeeklyDigest } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = aiRateLimit(req);
  if (limited) return limited;
  try {
    const { profile } = (await req.json()) as { profile: Profile };
    if (!profile) {
      return NextResponse.json({ error: "profile required" }, { status: 400 });
    }

    const corpus = await getCorpus();
    const { items } = rank(corpus.opportunities, profile, { now: Date.now() });

    // Build a summary list for the prompt (top 30 by match score)
    const oppSummaries = items.slice(0, 30).map((s) => ({
      title: s.opportunity.title,
      category: s.opportunity.category,
      deadline: s.opportunity.deadline,
      matchScore: s.score,
    }));

    const { system, user } = weeklyDigestPrompt(oppSummaries, profile);
    const digest = await generateJSON<WeeklyDigest>(system, user);

    return NextResponse.json({ digest });
  } catch (err: unknown) {
    logAIError("AI Digest", err);
    return NextResponse.json({ error: "Failed to generate digest" }, { status: 500 });
  }
}
