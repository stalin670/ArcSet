import { describe, expect, it } from "vitest";
import { createRequestTimeoutSignal } from "./request-timeout";

describe("external request timeout", () => {
  it("aborts a bounded request signal", async () => {
    const signal = createRequestTimeoutSignal(5);
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(Error);
  });

  it("rejects invalid timeout values", () => {
    expect(() => createRequestTimeoutSignal(0)).toThrow(/positive/);
  });
});
