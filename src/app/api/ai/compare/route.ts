import { NextResponse } from "next/server";
import { generateJSON, logAIError } from "@/lib/ai/groq";
import { aiRateLimit } from "@/lib/server/ai-guard";
import { comparisonPrompt } from "@/lib/ai/prompts";
import { getCorpus } from "@/lib/corpus";
import type { Profile, ComparisonResult } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = aiRateLimit(req);
  if (limited) return limited;
  try {
    const { opportunityIds, profile } = (await req.json()) as {
      opportunityIds: string[];
      profile: Profile;
    };

    if (!Array.isArray(opportunityIds) || opportunityIds.length < 2 || opportunityIds.length > 4) {
      return NextResponse.json({ error: "Select 2-4 opportunities to compare" }, { status: 400 });
    }

    const corpus = await getCorpus();
    const opps = opportunityIds
      .map((id) => corpus.opportunities.find((o) => o.id === id))
      .filter(Boolean) as NonNullable<(typeof corpus.opportunities)[0]>[];

    if (opps.length < 2) {
      return NextResponse.json({ error: "Not enough valid opportunities found" }, { status: 404 });
    }

    const prof: Profile = profile ?? { interests: [], skills: [] };
    const { system, user } = comparisonPrompt(opps, prof);
    const comparison = await generateJSON<ComparisonResult>(system, user);

    return NextResponse.json({ comparison });
  } catch (err: unknown) {
    logAIError("AI Compare", err);
    return NextResponse.json({ error: "Failed to generate comparison" }, { status: 500 });
  }
}
