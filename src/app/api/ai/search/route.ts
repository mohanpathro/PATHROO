import { NextResponse } from "next/server";
import { generateJSON, logAIError } from "@/lib/ai/groq";
import { aiRateLimit } from "@/lib/server/ai-guard";
import { queryExpansionPrompt } from "@/lib/ai/prompts";
import { getCorpus } from "@/lib/corpus";
import { buildFeed } from "@/lib/feed";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = aiRateLimit(req);
  if (limited) return limited;
  try {
    const { query, profile } = (await req.json()) as {
      query: string;
      profile?: Profile;
    };
    if (!query || query.trim().length < 3) {
      return NextResponse.json({ error: "Query too short" }, { status: 400 });
    }

    // Step 1: Expand query using Groq
    const { system, user } = queryExpansionPrompt(query);
    const expansion = await generateJSON<{ terms: string[] }>(system, user);
    const expandedTerms = Array.isArray(expansion.terms) ? expansion.terms : [];

    // Step 2: Search corpus with expanded terms
    const corpus = await getCorpus();
    const prof: Profile = profile ?? { interests: [], skills: [] };

    // Run the expanded search: match against title, summary, tags, org
    const allOpps = corpus.opportunities;
    const scoredResults: { id: string; relevance: number }[] = [];

    for (const opp of allOpps) {
      const haystack = `${opp.title} ${opp.organization ?? ""} ${opp.summary ?? ""} ${opp.tags.join(" ")} ${opp.category}`.toLowerCase();
      let hits = 0;
      for (const term of expandedTerms) {
        if (haystack.includes(term.toLowerCase())) hits++;
      }
      if (hits > 0) {
        scoredResults.push({ id: opp.id, relevance: hits / expandedTerms.length });
      }
    }

    // Sort by relevance and take top 20
    scoredResults.sort((a, b) => b.relevance - a.relevance);
    const topIds = new Set(scoredResults.slice(0, 20).map((r) => r.id));

    // Build a feed from just the matching opportunities
    const matchingOpps = allOpps.filter((o) => topIds.has(o.id));
    const result = buildFeed(
      { ...corpus, opportunities: matchingOpps },
      prof,
      {},
      "match",
      Date.now(),
      "all",
    );

    return NextResponse.json({
      items: result.items,
      expandedTerms,
      total: result.total,
    });
  } catch (err: unknown) {
    logAIError("AI Search", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
