import { describe, expect, it } from "vitest";
import {
  decodeCircleSessionCredential,
  encodeCircleSessionCredential,
  isCircleSessionCredential,
} from "./circle-wallet-session";

const credential = {
  id: "passkey-id",
  publicKey: "0x1234" as const,
  rpId: "localhost",
};

describe("Circle wallet session", () => {
  it("round-trips the public passkey credential", () => {
    expect(decodeCircleSessionCredential(encodeCircleSessionCredential(credential))).toEqual(credential);
  });

  it("rejects malformed credentials", () => {
    expect(isCircleSessionCredential({ id: "passkey-id", publicKey: "not-hex" })).toBe(false);
    expect(decodeCircleSessionCredential("invalid")).toBeNull();
  });
});
