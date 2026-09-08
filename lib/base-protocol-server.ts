import "server-only";
import { createPublicClient, formatUnits, http } from "viem";
import { BASE_CONTRACTS, BASE_SEPOLIA, BASE_UNISWAP_FEE, baseSepoliaRpcUrl } from "./base";

const POOL_ABI = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] },
  { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
  { type: "function", name: "slot0", stateMutability: "view", inputs: [], outputs: [{ type: "uint160" }, { type: "int24" }, { type: "uint16" }, { type: "uint16" }, { type: "uint16" }, { type: "uint8" }, { type: "bool" }] },
] as const;
const ERC20_ABI = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;
const QUOTER_ABI = [{
  type: "function", name: "quoteExactInputSingle", stateMutability: "nonpayable",
  inputs: [{ type: "tuple", components: [{ name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "fee", type: "uint24" }, { name: "sqrtPriceLimitX96", type: "uint160" }] }],
  outputs: [{ type: "uint256" }, { type: "uint160" }, { type: "uint32" }, { type: "uint256" }],
}] as const;

export async function readBaseUniswapHealth() {
  const client = createPublicClient({ chain: BASE_SEPOLIA, transport: http(baseSepoliaRpcUrl) });
  const pool = BASE_CONTRACTS.uniswapUsdcWethPool;
  const [chainId, blockNumber, poolCode, managerCode, token0, token1, fee, liquidity, slot0, usdcBalance, wethBalance] = await Promise.all([
    client.getChainId(), client.getBlockNumber(), client.getCode({ address: pool }),
    client.getCode({ address: BASE_CONTRACTS.uniswapV3PositionManager }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "token0" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "token1" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "fee" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "liquidity" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "slot0" }),
    client.readContract({ address: BASE_CONTRACTS.usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [pool] }),
    client.readContract({ address: BASE_CONTRACTS.weth, abi: ERC20_ABI, functionName: "balanceOf", args: [pool] }),
  ]);
  if (!poolCode || poolCode === "0x" || !managerCode || managerCode === "0x") throw new Error("The configured Uniswap deployment is unavailable.");
  if (token0.toLowerCase() !== BASE_CONTRACTS.usdc.toLowerCase() || token1.toLowerCase() !== BASE_CONTRACTS.weth.toLowerCase() || fee !== BASE_UNISWAP_FEE) throw new Error("The configured Uniswap pool does not match canonical Base USDC/WETH.");
  const quote = await client.simulateContract({ address: BASE_CONTRACTS.uniswapV3Quoter, abi: QUOTER_ABI, functionName: "quoteExactInputSingle", args: [{ tokenIn: BASE_CONTRACTS.usdc, tokenOut: BASE_CONTRACTS.weth, amountIn: 1_000_000n, fee, sqrtPriceLimitX96: 0n }] });
  const oneUsdcWeth = quote.result[0];
  return {
    status: "ready" as const,
    chainId,
    blockNumber: blockNumber.toString(),
    checkedAt: Date.now(),
    poolAddress: pool,
    positionManagerAddress: BASE_CONTRACTS.uniswapV3PositionManager,
    token0,
    token1,
    fee,
    liquidity: liquidity.toString(),
    currentTick: slot0[1],
    usdcBalance: formatUnits(usdcBalance, 6),
    wethBalance: formatUnits(wethBalance, 18),
    oneUsdcWeth: formatUnits(oneUsdcWeth, 18),
    impliedEthPriceUsdc: oneUsdcWeth > 0n ? 1 / Number(formatUnits(oneUsdcWeth, 18)) : null,
  };
}
