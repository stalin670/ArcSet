import { describe, expect, it } from "vitest";
import { ARC_CONTRACTS } from "./arc";
import { selectLiveArcEarnVault } from "./arc-earn-client";

const baseVault = {
  vaultAddress: "0xaabbef1d3971c710276ed41ec791bbe14cdb8e88",
  chain: "Arc_Testnet",
  name: "EarnKit USDC Vault (Arc Testnet)",
  protocol: "MORPHO",
  asset: "USDC",
  assetAddress: ARC_CONTRACTS.usdc,
  currentApy: 0.042,
  status: "active",
  circleGuarded: false,
};

describe("Arc Earn vault selection", () => {
  it("selects an active non-mock vault backed by official Arc USDC", () => {
    expect(selectLiveArcEarnVault([baseVault])?.vaultAddress).toBe(baseVault.vaultAddress);
  });

  it("rejects mock, wrong-asset, inactive, and red-warning vaults", () => {
    expect(selectLiveArcEarnVault([{ ...baseVault, name: "MockMorphoVault" }])).toBeNull();
    expect(selectLiveArcEarnVault([{ ...baseVault, assetAddress: "0x1111111111111111111111111111111111111111" }])).toBeNull();
    expect(selectLiveArcEarnVault([{ ...baseVault, status: "paused" }])).toBeNull();
    expect(selectLiveArcEarnVault([{ ...baseVault, warnings: [{ type: "Unsafe", level: "RED" as const }] }])).toBeNull();
  });
});
