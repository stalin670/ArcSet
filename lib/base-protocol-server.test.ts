import { describe, expect, it } from "vitest";
import { BASE_CONTRACTS, BASE_UNISWAP_FEE } from "./base";
import { isTestnetEthPriceSane } from "./base-uniswap-client";

describe("Base Uniswap configuration", () => {
  it("uses canonical Circle USDC and the reviewed 0.3% pool", () => {
    expect(BASE_CONTRACTS.usdc).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    expect(BASE_CONTRACTS.uniswapUsdcWethPool).toBe("0x46880b404CD35c165EDdefF7421019F8dD25F4Ad");
    expect(BASE_UNISWAP_FEE).toBe(3_000);
  });

  it("rejects obviously distorted Testnet pool prices", () => {
    expect(isTestnetEthPriceSane(2_500)).toBe(true);
    expect(isTestnetEthPriceSane(27_600)).toBe(false);
  });
});
