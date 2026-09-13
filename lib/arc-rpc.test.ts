import { describe, expect, it, vi } from "vitest";
import { firstSuccessful } from "./arc-rpc";

describe("Arc RPC fallback", () => {
  it("tries endpoints in order and returns the first success", async () => {
    const action = vi.fn(async (endpoint: string) => {
      if (endpoint !== "fallback") throw new Error("unavailable");
      return "ok";
    });
    await expect(firstSuccessful(["primary", "fallback", "unused"], action)).resolves.toBe("ok");
    expect(action.mock.calls.map(([endpoint]) => endpoint)).toEqual(["primary", "fallback"]);
  });

  it("surfaces the final provider error", async () => {
    await expect(firstSuccessful(["primary", "fallback"], async (endpoint) => {
      throw new Error(`${endpoint} unavailable`);
    })).rejects.toThrow("fallback unavailable");
  });
});
