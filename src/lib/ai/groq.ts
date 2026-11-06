import "server-only";
import Groq from "groq-sdk";
import { geminiAvailable, generateGeminiJSON, generateGeminiText } from "./gemini";
import { logAIError } from "./errors";

export { logAIError } from "./errors";

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Groq client with automatic model fallback.
// ─────────────────────────────────────────────────────────────────────────────

let groq: Groq | null = null;

const PRIMARY_MODEL = "openai/gpt-oss-20b";
const FALLBACK_MODEL = "qwen/qwen3.8-27b";

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  if (!groq) groq = new Groq({ apiKey });
  return groq;
}

function isRateLimit(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const error = err as Record<string, unknown>;
  const nested = error.error && typeof error.error === "object"
    ? error.error as Record<string, unknown>
    : undefined;
  const message = typeof error.message === "string" ? error.message : "";
  return (
    error.status === 429 ||
    nested?.code === "rate_limit_exceeded" ||
    message.includes("429") ||
    message.toLowerCase().includes("rate limit")
  );
}

/**
 * Groq's TPM rate limiter tells you exactly how long to wait
 * (e.g. "Please try again in 40.6s"). Parse that instead of guessing, capped
 * so a single request can never stall a serverless function for too long.
 */
function retryAfterMs(err: unknown, capMs = 4000): number {
  if (!err || typeof err !== "object") return Math.min(1500, capMs);
  const error = err as Record<string, unknown>;
  const nested = error.error && typeof error.error === "object"
    ? error.error as Record<string, unknown>
    : undefined;
  const msg = typeof error.message === "string"
    ? error.message
    : typeof nested?.message === "string" ? nested.message : "";
  const match = /try again in ([\d.]+)s/i.exec(msg);
  if (match) return Math.min(Math.ceil(parseFloat(match[1]) * 1000), capMs);
  return Math.min(1500, capMs);
}

/**
 * Try the primary, then the fallback for provider/model failures. Rate limits
 * get one bounded backoff retry on the fallback model.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createCompletion(params: any): Promise<any> {
  const client = getGroqClient();
  try {
    return await client.chat.completions.create({ ...params, model: PRIMARY_MODEL });
  } catch (primaryError) {
    logAIError("Groq primary model", primaryError);
    if (isRateLimit(primaryError)) {
      const waitMs = retryAfterMs(primaryError);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    try {
      return await client.chat.completions.create({ ...params, model: FALLBACK_MODEL });
    } catch (fallbackError) {
      logAIError("Groq fallback model", fallbackError);
      if (!isRateLimit(fallbackError)) throw fallbackError;
      const waitMs = retryAfterMs(fallbackError);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return await client.chat.completions.create({ ...params, model: FALLBACK_MODEL });
    }
  }
}

async function completeJSONViaGroq<T>(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<T> {
  const completion = await createCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.1,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
  });

  let raw = completion.choices[0]?.message?.content ?? "{}";

  // Clean markdown formatting if present
  raw = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

  // Extract JSON object safely
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end >= start) {
    raw = raw.slice(start, end + 1);
  }

  return JSON.parse(raw) as T;
}

async function completeTextViaGroq(systemPrompt: string, userPrompt: string): Promise<string> {
  const completion = await createCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.4,
    max_tokens: 1024,
  });
  return completion.choices[0]?.message?.content?.trim() ?? "";
}

/**
 * Generate a structured JSON response. Tries Groq (primary → fallback model →
 * fallback attempt) first; if Groq fails and GEMINI_API_KEY is configured,
 * falls through to Gemini as an independent provider.
 */
export async function generateJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 4096,
): Promise<T> {
  try {
    return await completeJSONViaGroq<T>(systemPrompt, userPrompt, maxTokens);
  } catch (groqError) {
    if (geminiAvailable()) {
      logAIError("Groq providers", groqError);
      try {
        return await generateGeminiJSON<T>(systemPrompt, userPrompt, maxTokens);
      } catch (geminiErr) {
        logAIError("Gemini fallback", geminiErr);
        throw new Error("AI providers failed");
      }
    }
    throw groqError;
  }
}

/** Generate plain text. Same Groq → Gemini fallback chain as generateJSON. */
export async function generateText(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  try {
    return await completeTextViaGroq(systemPrompt, userPrompt);
  } catch (groqError) {
    if (geminiAvailable()) {
      logAIError("Groq providers", groqError);
      try {
        return await generateGeminiText(systemPrompt, userPrompt);
      } catch (geminiErr) {
        logAIError("Gemini fallback", geminiErr);
        throw new Error("AI providers failed");
      }
    }
    throw groqError;
  }
}

/** Generate a streaming response. */
export async function generateStream(
  systemPrompt: string,
  userPrompt: string,
) {
  try {
    return await getGroqClient().chat.completions.create({
      model: PRIMARY_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 1024,
      stream: true,
    });
  } catch (err: unknown) {
    logAIError("Groq stream primary model", err);
    return await getGroqClient().chat.completions.create({
      model: FALLBACK_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 1024,
      stream: true,
    });
  }
}
