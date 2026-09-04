export function createRequestTimeoutSignal(timeoutMs: number) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Request timeout must be a positive number of milliseconds.");
  }
  return AbortSignal.timeout(timeoutMs);
}
