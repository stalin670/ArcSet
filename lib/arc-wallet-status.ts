export type ArcWalletStatus =
  | "unconfigured"
  | "loading"
  | "signed-out"
  | "wallet-missing"
  | "wrong-chain"
  | "ready";

export function resolveArcWalletStatus(input: {
  configured: boolean;
  sessionReady: boolean;
  authenticated: boolean;
  walletsReady: boolean;
  isOnArc: boolean;
}): ArcWalletStatus {
  if (!input.configured) return "unconfigured";
  if (!input.sessionReady) return "loading";
  if (!input.authenticated) return "signed-out";
  if (!input.walletsReady) return "wallet-missing";
  if (!input.isOnArc) return "wrong-chain";
  return "ready";
}
