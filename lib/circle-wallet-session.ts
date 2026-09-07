import type { CircleSessionCredential } from "@/lib/circle-wallet";

export const CIRCLE_WALLET_SESSION_COOKIE = "arcset_circle_wallet";

export function isCircleSessionCredential(
  value: unknown,
): value is CircleSessionCredential {
  if (!value || typeof value !== "object") return false;
  const credential = value as Record<string, unknown>;
  return (
    typeof credential.id === "string" &&
    credential.id.length > 0 &&
    typeof credential.publicKey === "string" &&
    /^0x[0-9a-fA-F]+$/.test(credential.publicKey) &&
    (credential.rpId === undefined || typeof credential.rpId === "string")
  );
}

export function encodeCircleSessionCredential(
  credential: CircleSessionCredential,
) {
  return Buffer.from(JSON.stringify(credential), "utf8").toString("base64url");
}

export function decodeCircleSessionCredential(value: string | undefined) {
  if (!value) return null;
  try {
    const credential: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    return isCircleSessionCredential(credential) ? credential : null;
  } catch {
    return null;
  }
}
