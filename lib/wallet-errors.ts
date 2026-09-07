export function readableWalletError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("username is invalid")) return "Circle rejected the passkey wallet name. Reload the updated app and try again.";
  if (message.includes("invalid credentials")) return "The Circle Client Key is invalid for this domain.";
  if (message.includes("reject") || message.includes("denied") || message.includes("cancel")) return "Wallet request cancelled. No funds moved.";
  if (message.includes("notallowederror") || message.includes("not allowed")) return "Passkey request cancelled or timed out. Try again.";
  if (message.includes("securityerror") || message.includes("relying party")) return "This passkey belongs to a different site. Check the Circle passkey domain.";
  if (message.includes("chain") || message.includes("network")) return "The wallet could not switch to the required test network.";
  if (message.includes("timeout") || message.includes("rpc") || message.includes("fetch")) return "The wallet network is temporarily unavailable. Try again.";
  if (message.includes("already") && (message.includes("credential") || message.includes("wallet"))) return "A Circle passkey wallet already exists. Sign in instead.";
  return fallback;
}
