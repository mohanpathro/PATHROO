import { NextResponse } from "next/server";
import { generateText, logAIError } from "@/lib/ai/groq";
import { aiRateLimit } from "@/lib/server/ai-guard";
import { whyMatchesYouPrompt } from "@/lib/ai/prompts";
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
    if (!opportunityId || !profile) {
      return NextResponse.json({ error: "opportunityId and profile required" }, { status: 400 });
    }

    const corpus = await getCorpus();
    const opp = corpus.opportunities.find((o) => o.id === opportunityId);
    if (!opp) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }

    // Cache key includes a hash of the profile's relevant fields + opportunity
    const profileKey = JSON.stringify({
      skills: profile.skills,
      interests: profile.interests,
      branch: profile.branch,
      year: profile.year,
    });
    const hash = contentHash(profileKey + opp.id);
    const cacheId = `${opportunityId}__${hash}`;
    const cached = await getCachedAI<{ explanation: string }>("ai-match-reasons", cacheId);
    if (cached) {
      return NextResponse.json({ match: cached, cached: true });
    }

    // Generate — plain text, not JSON
    const { system, user } = whyMatchesYouPrompt(opp, profile);
    const explanation = await generateText(system, user);

    const result = { explanation };

    // Cache for 24 hours
    await setCachedAI("ai-match-reasons", cacheId, result, hash, 24 * 60 * 60 * 1000);

    return NextResponse.json({ match: result, cached: false });
  } catch (err: unknown) {
    logAIError("AI Match", err);
    return NextResponse.json({ error: "Failed to generate match reason" }, { status: 500 });
  }
}
