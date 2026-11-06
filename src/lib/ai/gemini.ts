import "server-only";
import { GoogleGenAI } from "@google/genai";

// ─────────────────────────────────────────────────────────────────────────────
// Fallback AI provider. Groq remains the primary provider; see lib/ai/groq.ts
// for fallback orchestration when its configured models or service fail.
//
// Get a free key (no credit card) at https://aistudio.google.com/apikey and
// set GEMINI_API_KEY in .env.local / your Vercel project's env vars.
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-2.5-flash";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

/** Whether a Gemini fallback is even possible (key configured). */
export function geminiAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

/** Generate a structured JSON response via Gemini. */
export async function generateGeminiJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 4096,
): Promise<T> {
  const ai = getClient();
  if (!ai) throw new Error("GEMINI_API_KEY not configured");

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      maxOutputTokens: maxTokens,
      temperature: 0.1,
    },
  });

  let raw = response.text ?? "{}";
  raw = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end >= start) {
    raw = raw.slice(start, end + 1);
  }

  return JSON.parse(raw) as T;
}

/** Generate plain text via Gemini. */
export async function generateGeminiText(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const ai = getClient();
  if (!ai) throw new Error("GEMINI_API_KEY not configured");

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 1024,
      temperature: 0.4,
    },
  });

  return (response.text ?? "").trim();
}
