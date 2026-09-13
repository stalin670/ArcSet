import { describe, expect, it, vi } from "vitest";
import { createArcExecutionState, executeArcBasketSteps } from "./arc-basket-execution";

function setup() {
  const events: string[] = [];
  const state = createArcExecutionState<string>();
  const options = {
    state,
    steps: ["swap", "earn"],
    id: (step: string) => step,
    quote: vi.fn(async (step: string) => { events.push(`quote:${step}`); return step; }),
    execute: vi.fn(async (step: string, _quote: string): Promise<{ status: "complete" | "pending"; value: string }> => { events.push(`execute:${step}`); void _quote; return { status: "complete", value: step }; }),
    record: vi.fn(async () => {}),
  };
  return { options, state, events };
}

describe("Arc basket execution lifecycle", () => {
  it("refreshes each quote immediately before its execution", async () => {
    const { options, events } = setup();
    expect((await executeArcBasketSteps(options)).status).toBe("complete");
    expect(events).toEqual(["quote:swap", "execute:swap", "quote:earn", "execute:earn"]);
  });

  it("stops at a pending submission and cannot repeat it on retry", async () => {
    const { options, state } = setup();
    options.execute.mockResolvedValueOnce({ status: "pending", value: "hash" });
    expect((await executeArcBasketSteps(options)).status).toBe("pending");
    expect((await executeArcBasketSteps(options)).status).toBe("pending");
    expect(options.execute).toHaveBeenCalledTimes(1);
    expect(state.outcomes[0].value).toBe("hash");
  });

  it("pauses an unknown submission outcome without repeating it on retry", async () => {
    const { options, state } = setup();
    options.execute.mockResolvedValueOnce({ status: "complete", value: "swap-hash" }).mockRejectedValueOnce(new Error("receipt unavailable"));
    await expect(executeArcBasketSteps(options)).rejects.toThrow("submission outcome is unknown");
    expect(state.submissionUncertain).toBe(true);
    expect(state.running).toBe(false);
    await expect(executeArcBasketSteps(options)).rejects.toThrow("submission outcome is unknown");
    expect(options.execute.mock.calls.map(([step]) => step)).toEqual(["swap", "earn"]);
    expect(state.outcomes).toHaveLength(1);
  });

  it("retries only unfinished legs after a quote failure", async () => {
    const { options, state } = setup();
    options.quote.mockResolvedValueOnce("swap").mockRejectedValueOnce(new Error("quote unavailable"));
    await expect(executeArcBasketSteps(options)).rejects.toThrow("quote unavailable");
    expect(state.submissionUncertain).not.toBe(true);
    expect((await executeArcBasketSteps(options)).status).toBe("complete");
    expect(options.execute.mock.calls.map(([step]) => step)).toEqual(["swap", "earn"]);
  });

  it("preserves a confirmed result and repairs recording before any further submission", async () => {
    const { options, state } = setup();
    options.record.mockRejectedValueOnce(new Error("quota"));
    expect((await executeArcBasketSteps(options)).status).toBe("recording-failed");
    expect(state.outcomes[0].status).toBe("complete");
    expect(options.execute).toHaveBeenCalledTimes(1);
    expect((await executeArcBasketSteps(options)).status).toBe("complete");
    expect(options.execute.mock.calls.map(([step]) => step)).toEqual(["swap", "earn"]);
    expect(options.record).toHaveBeenCalledTimes(3);
    await executeArcBasketSteps(options);
    expect(options.execute).toHaveBeenCalledTimes(2);
  });

  it("repairs the final receipt without requesting another quote or signature", async () => {
    const { options, state } = setup();
    options.record.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("quota"));
    expect((await executeArcBasketSteps(options)).status).toBe("recording-failed");
    expect(state.needsRecording).toBe(true);
    expect((await executeArcBasketSteps(options)).status).toBe("complete");
    expect(state.needsRecording).toBe(false);
    expect(options.quote).toHaveBeenCalledTimes(2);
    expect(options.execute).toHaveBeenCalledTimes(2);
    expect(options.record).toHaveBeenLastCalledWith(state.outcomes, true);
  });

  it("saves a pending receipt on retry without proceeding to another leg", async () => {
    const { options, state } = setup();
    options.execute.mockResolvedValueOnce({ status: "pending", value: "hash" });
    options.record.mockRejectedValueOnce(new Error("quota"));
    expect((await executeArcBasketSteps(options)).status).toBe("recording-failed");
    expect((await executeArcBasketSteps(options)).status).toBe("pending");
    expect(state.needsRecording).toBe(false);
    expect(options.execute).toHaveBeenCalledTimes(1);
    expect(options.record).toHaveBeenLastCalledWith(state.outcomes, false);
  });

  it("prevents concurrent execution of the same reviewed plan", async () => {
    const { options } = setup();
    let release!: () => void;
    options.quote.mockImplementationOnce(async () => { await new Promise<void>((resolve) => { release = resolve; }); return "swap"; });
    const first = executeArcBasketSteps(options);
    expect((await executeArcBasketSteps(options)).status).toBe("busy");
    release();
    await first;
    expect(options.execute).toHaveBeenCalledTimes(2);
  });
});
