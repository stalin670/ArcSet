import { arcTestnet } from "viem/chains";

export const ARC_TESTNET = arcTestnet;
export const ARC_EXPLORER_URL = "https://testnet.arcscan.app";

export const ARC_CONTRACTS = {
  usdc: "0x3600000000000000000000000000000000000000",
  eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  cirbtc: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
  morphoUsdcVault: "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88",
  xyloUsdcVault: "0x240Eb85458CD41361bd8C3773253a1D78054f747",
} as const;

export const ARC_ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const;

export const arcRpcUrl =
  process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.testnet.arc.network";

export const ARC_RPC_FALLBACK_URLS = [
  "https://rpc.drpc.testnet.arc.io",
  "https://rpc.blockdaemon.testnet.arc.io",
] as const;
