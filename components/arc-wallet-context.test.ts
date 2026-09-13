import { describe, expect, it } from "vitest";
import { resolveArcWalletStatus } from "../lib/arc-wallet-status";
import { readableWalletError } from "../lib/wallet-errors";

const readyState = {
  configured: true,
  sessionReady: true,
  authenticated: true,
  walletsReady: true,
  isOnArc: true,
};

describe("resolveArcWalletStatus", () => {
  it("keeps missing application configuration explicit", () => {
    expect(resolveArcWalletStatus({ ...readyState, configured: false })).toBe("unconfigured");
  });

  it("waits for the Circle passkey session", () => {
    expect(resolveArcWalletStatus({ ...readyState, sessionReady: false })).toBe("loading");
  });

  it("requires authentication before a wallet", () => {
    expect(resolveArcWalletStatus({ ...readyState, authenticated: false })).toBe("signed-out");
  });

  it("recovers missing wallets and wrong-chain sessions", () => {
    expect(resolveArcWalletStatus({ ...readyState, walletsReady: false })).toBe("wallet-missing");
    expect(resolveArcWalletStatus({ ...readyState, isOnArc: false })).toBe("wrong-chain");
  });

  it("becomes ready only with a Circle wallet on Arc", () => {
    expect(resolveArcWalletStatus(readyState)).toBe("ready");
  });

  it("does not expose raw wallet-provider errors", () => {
    expect(readableWalletError(new Error("User rejected eth_requestAccounts"), "fallback")).toBe("Wallet request cancelled. No funds moved.");
    expect(readableWalletError(new Error("RPC timeout at secret-provider.example"), "fallback")).toBe("The wallet network is temporarily unavailable. Try again.");
    expect(readableWalletError(new Error("unexpected internal payload"), "Safe fallback")).toBe("Safe fallback");
  });
});
