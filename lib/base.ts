import { baseSepolia } from "viem/chains";

export const BASE_SEPOLIA = baseSepolia;
export const BASE_SEPOLIA_EXPLORER_URL = "https://sepolia.basescan.org";

// Official Circle and Uniswap deployments. Keep every network-specific value
// centralized so the Arc mainnet route can replace this testnet preview cleanly.
export const BASE_CONTRACTS = {
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  weth: "0x4200000000000000000000000000000000000006",
  uniswapV3Factory: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
  uniswapV3Quoter: "0xC5290058841028F1614F3A6F0F5816cAd0df5E27",
  uniswapV3SwapRouter: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
  uniswapV3PositionManager: "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2",
  uniswapUsdcWethPool: "0x46880b404CD35c165EDdefF7421019F8dD25F4Ad",
} as const;

export const BASE_UNISWAP_FEE = 3_000;
export const BASE_UNISWAP_TICK_LOWER = -887_220;
export const BASE_UNISWAP_TICK_UPPER = 887_220;
export const BASE_UNISWAP_SLIPPAGE_BPS = 100n;

export const baseSepoliaRpcUrl =
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
