export function sanitizeSourceError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status = /\bHTTP\s+(\d{3})\b/i.exec(message);
  if (status) return `Source returned HTTP ${status[1]}.`;
  if (/timeout|timed out|abort/i.test(message)) return "Source request timed out.";
  return "Source request failed.";
}

export function sanitizeSourceRuns<T extends { error?: string }>(runs: T[]): T[] {
  return runs.map((run) => (run.error ? { ...run, error: sanitizeSourceError(run.error) } : run));
}
