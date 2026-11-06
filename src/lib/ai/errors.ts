function safeErrorDetails(error: unknown): { status?: number; code?: string } {
  if (!error || typeof error !== "object") return {};
  const outer = error as Record<string, unknown>;
  const nested = outer.error && typeof outer.error === "object"
    ? outer.error as Record<string, unknown>
    : undefined;
  const status = typeof outer.status === "number" && Number.isInteger(outer.status)
    ? outer.status
    : undefined;
  const codeValue = typeof outer.code === "string" ? outer.code : nested?.code;
  const code = typeof codeValue === "string" && /^[a-z0-9_-]{1,64}$/i.test(codeValue)
    ? codeValue
    : undefined;

  return {
    ...(status !== undefined ? { status } : {}),
    ...(code ? { code } : {}),
  };
}

export function logAIError(context: string, error: unknown): void {
  console.error(`[${context}] AI request failed`, safeErrorDetails(error));
}
