import { NextResponse } from "next/server";
import { generateJSON, logAIError } from "@/lib/ai/groq";
import { aiRateLimit } from "@/lib/server/ai-guard";
import { resumeAnalysisPrompt } from "@/lib/ai/prompts";
import { peekCorpus } from "@/lib/store";
import { seedAdapter } from "@/lib/sources/seed";
import type { ResumeAnalysis } from "@/lib/types";

export const dynamic = "force-dynamic";
// Backoff retry on rate limit can add a few seconds — give it headroom.
export const maxDuration = 30;

// Reject oversized uploads before parsing — PDF parsers are a classic DoS/
// malformed-file target, and real resumes are small.
const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: Request) {
  const limited = aiRateLimit(req);
  if (limited) return limited;
  try {
    const formData = await req.formData();
    const file = formData.get("resume") as File | null;
    const opportunityId = formData.get("opportunityId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Resume file required" }, { status: 400 });
    }

    if (file.size > MAX_RESUME_BYTES) {
      return NextResponse.json({ error: "Resume is too large (max 5 MB)." }, { status: 413 });
    }

    // Extract text from file
    const buffer = await file.arrayBuffer();
    const text = await extractTextFromFile(buffer, file.type, file.name);

    if (!text || text.trim().length < 30) {
      return NextResponse.json({ error: "Could not extract readable text from this document. Please ensure it is a text-selectable PDF or TXT file." }, { status: 400 });
    }

    // On Vercel serverless, peek disk cache first. If cold boot, use seed fallback instead of blocking on live scrapes!
    const cached = await peekCorpus();
    const opportunities = (cached && cached.opportunities.length > 0)
      ? cached.opportunities
      : await seedAdapter.fetch();

    const opp = opportunityId
      ? opportunities.find((o) => o.id === opportunityId) || opportunities[0]
      : opportunities[0];
    if (!opp) {
      return NextResponse.json({ error: "No opportunities available for analysis" }, { status: 404 });
    }

    const { system, user } = resumeAnalysisPrompt(text, opp);
    // Output is capped to ~8 short array items per field — 1200 tokens is
    // generous headroom without reserving 4096 tokens of TPM budget per call.
    const analysis = await generateJSON<ResumeAnalysis>(system, user, 1200);

    // Clamp score to 0-100
    analysis.matchScore = Math.max(0, Math.min(100, Math.round(analysis.matchScore)));

    return NextResponse.json({ analysis });
  } catch (err: unknown) {
    logAIError("AI Resume", err);
    return NextResponse.json({ error: "Failed to analyze resume" }, { status: 500 });
  }
}

/**
 * Extracts text from a file. Uses pdf-parse for compressed PDFs,
 * with pure JS fallback.
 */
async function extractTextFromFile(
  buffer: ArrayBuffer,
  mimeType: string,
  fileName: string,
): Promise<string> {
  // Plain text files
  if (mimeType === "text/plain" || fileName.endsWith(".txt")) {
    return new TextDecoder().decode(buffer);
  }

  // PDF: use pdf-parse to uncompress FlateDecode streams
  if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
    try {
 
      const pdfParseModule = await import("pdf-parse/lib/pdf-parse.js");
      const pdfParse = pdfParseModule.default || pdfParseModule;
      const data = await pdfParse(Buffer.from(buffer));
      if (data && data.text && data.text.trim().length >= 30) {
        return data.text.trim();
      }
    } catch (e) {
      console.warn("[PDF Parse Error]", e);
    }
    const bytes = new Uint8Array(buffer);
    return extractTextFromPDFBytes(bytes);
  }

  // Fallback: try to decode as text
  return new TextDecoder().decode(buffer);
}

/** Extract readable text runs from raw PDF bytes (fallback). */
function extractTextFromPDFBytes(bytes: Uint8Array): string {
  const text: string[] = [];
  const str = new TextDecoder("latin1").decode(bytes);

  const parenRegex = /\(([^)]{2,})\)/g;
  let m: RegExpExecArray | null;
  while ((m = parenRegex.exec(str)) !== null) {
    const s = m[1]
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\\\/g, "\\")
      .replace(/\\([()])/g, "$1");
    if (/[a-zA-Z]/.test(s) && s.length > 1) {
      text.push(s);
    }
  }

  return text.join(" ").replace(/\s+/g, " ").trim();
}
