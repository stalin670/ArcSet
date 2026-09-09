import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  maxUint128,
  numberToHex,
  parseUnits,
  type EIP1193Provider,
  type Hash,
} from "viem";
import {
  BASE_CONTRACTS,
  BASE_SEPOLIA,
  BASE_SEPOLIA_EXPLORER_URL,
  BASE_UNISWAP_FEE,
  BASE_UNISWAP_SLIPPAGE_BPS,
  BASE_UNISWAP_TICK_LOWER,
  BASE_UNISWAP_TICK_UPPER,
  baseSepoliaRpcUrl,
} from "./base";

const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

const QUOTER_ABI = [{
  type: "function",
  name: "quoteExactInputSingle",
  stateMutability: "nonpayable",
  inputs: [{ type: "tuple", components: [
    { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" },
    { name: "amountIn", type: "uint256" }, { name: "fee", type: "uint24" },
    { name: "sqrtPriceLimitX96", type: "uint160" },
  ] }],
  outputs: [{ type: "uint256" }, { type: "uint160" }, { type: "uint32" }, { type: "uint256" }],
}] as const;

const SWAP_ROUTER_ABI = [{
  type: "function",
  name: "exactInputSingle",
  stateMutability: "payable",
  inputs: [{ type: "tuple", components: [
    { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" },
    { name: "fee", type: "uint24" }, { name: "recipient", type: "address" },
    { name: "amountIn", type: "uint256" }, { name: "amountOutMinimum", type: "uint256" },
    { name: "sqrtPriceLimitX96", type: "uint160" },
  ] }],
  outputs: [{ type: "uint256" }],
}] as const;

const POSITION_MANAGER_ABI = [
  {
    type: "function", name: "mint", stateMutability: "payable",
    inputs: [{ type: "tuple", components: [
      { name: "token0", type: "address" }, { name: "token1", type: "address" },
      { name: "fee", type: "uint24" }, { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" }, { name: "amount0Desired", type: "uint256" },
      { name: "amount1Desired", type: "uint256" }, { name: "amount0Min", type: "uint256" },
      { name: "amount1Min", type: "uint256" }, { name: "recipient", type: "address" },
      { name: "deadline", type: "uint256" },
    ] }],
    outputs: [{ name: "tokenId", type: "uint256" }, { name: "liquidity", type: "uint128" }, { name: "amount0", type: "uint256" }, { name: "amount1", type: "uint256" }],
  },
  {
    type: "function", name: "positions", stateMutability: "view", inputs: [{ type: "uint256" }],
    outputs: [
      { type: "uint96" }, { type: "address" }, { type: "address" }, { type: "address" },
      { type: "uint24" }, { type: "int24" }, { type: "int24" }, { type: "uint128" },
      { type: "uint256" }, { type: "uint256" }, { type: "uint128" }, { type: "uint128" },
    ],
  },
  {
    type: "function", name: "decreaseLiquidity", stateMutability: "payable",
    inputs: [{ type: "tuple", components: [
      { name: "tokenId", type: "uint256" }, { name: "liquidity", type: "uint128" },
      { name: "amount0Min", type: "uint256" }, { name: "amount1Min", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ] }], outputs: [{ type: "uint256" }, { type: "uint256" }],
  },
  {
    type: "function", name: "collect", stateMutability: "payable",
    inputs: [{ type: "tuple", components: [
      { name: "tokenId", type: "uint256" }, { name: "recipient", type: "address" },
      { name: "amount0Max", type: "uint128" }, { name: "amount1Max", type: "uint128" },
    ] }], outputs: [{ type: "uint256" }, { type: "uint256" }],
  },
] as const;

const POSITION_EVENTS_ABI = [
  { type: "event", name: "Transfer", inputs: [{ indexed: true, name: "from", type: "address" }, { indexed: true, name: "to", type: "address" }, { indexed: true, name: "tokenId", type: "uint256" }] },
] as const;

const publicClient = createPublicClient({ chain: BASE_SEPOLIA, transport: http(baseSepoliaRpcUrl) });

export type BaseSwapQuote = {
  tokenIn: "USDC" | "WETH";
  tokenOut: "USDC" | "WETH";
  amountIn: string;
  expectedOutput: string;
  minimumOutput: string;
  feeTier: number;
  impliedEthPriceUsdc: number;
  quotedAt: number;
};

export function isTestnetEthPriceSane(price: number) {
  return Number.isFinite(price) && price >= 500 && price <= 10_000;
}

export type BaseSwapExecution = {
  approvalHash: Hash | null;
  swapHash: Hash;
  amountOut: string;
  explorerUrl: string;
};

export type BaseLpExecution = {
  approvalHashes: Hash[];
  mintHash: Hash;
  tokenId: string;
  liquidity: string;
  amountUsdc: string;
  amountWeth: string;
  explorerUrl: string;
};

export async function readBaseWalletPreflight(walletAddress: `0x${string}`) {
  const usdc = await publicClient.readContract({
    address: BASE_CONTRACTS.usdc,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [walletAddress],
  });
  return { usdc: formatUnits(usdc, 6) };
}

function token(address: "USDC" | "WETH") {
  return address === "USDC" ? BASE_CONTRACTS.usdc : BASE_CONTRACTS.weth;
}

function decimals(address: "USDC" | "WETH") {
  return address === "USDC" ? 6 : 18;
}

function subtractSlippage(value: bigint) {
  return value * (10_000n - BASE_UNISWAP_SLIPPAGE_BPS) / 10_000n;
}

async function account(provider: EIP1193Provider) {
  const walletClient = createWalletClient({ chain: BASE_SEPOLIA, transport: custom(provider) });
  const [walletAddress] = await walletClient.getAddresses();
  if (!walletAddress) throw new Error("The Circle wallet address is unavailable on Base Sepolia.");
  return { walletClient, walletAddress: getAddress(walletAddress) };
}

type AtomicCall = { to: `0x${string}`; data: `0x${string}`; value?: bigint };

async function executeBaseAtomicCalls(provider: EIP1193Provider, calls: AtomicCall[]) {
  if (!calls.length) throw new Error("The Base operation has no calls to execute.");
  const { walletAddress } = await account(provider);
  const response = await provider.request({
    method: "wallet_sendCalls",
    params: [{
      version: "2.0.0",
      chainId: numberToHex(BASE_SEPOLIA.id),
      from: walletAddress,
      calls,
      capabilities: { atomic: { required: true } },
    }],
  } as never) as { id?: unknown };
  if (typeof response?.id !== "string") throw new Error("Circle did not return a Base batch identifier.");

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await provider.request({
      method: "wallet_getCallsStatus",
      params: [response.id],
    } as never) as {
      status?: string;
      statusCode?: number;
      receipts?: { transactionHash?: unknown; status?: unknown }[];
    };
    if (result.status === "success" || result.statusCode === 200) {
      const hash = result.receipts?.[0]?.transactionHash;
      if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
        throw new Error("The confirmed Circle batch is missing its transaction hash.");
      }
      const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as Hash });
      if (receipt.status !== "success") throw new Error("The Base atomic transaction reverted.");
      return hash as Hash;
    }
    if (result.status === "failure" || result.status === "error" || [400, 500, 600].includes(result.statusCode ?? 0)) {
      throw new Error("The Base atomic transaction failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("The Base atomic transaction is still pending. Check the Circle wallet activity before retrying.");
}

export async function quoteBaseUniswapSwap(
  amountIn: string,
  tokenIn: "USDC" | "WETH" = "USDC",
): Promise<BaseSwapQuote> {
  const tokenOut = tokenIn === "USDC" ? "WETH" : "USDC";
  const rawAmount = parseUnits(amountIn, decimals(tokenIn));
  if (rawAmount <= 0n) throw new Error("Enter a positive amount for the Uniswap swap.");
  const simulation = await publicClient.simulateContract({
    address: BASE_CONTRACTS.uniswapV3Quoter,
    abi: QUOTER_ABI,
    functionName: "quoteExactInputSingle",
    args: [{ tokenIn: token(tokenIn), tokenOut: token(tokenOut), amountIn: rawAmount, fee: BASE_UNISWAP_FEE, sqrtPriceLimitX96: 0n }],
  });
  const [amountOut] = simulation.result;
  const expectedOutput = formatUnits(amountOut, decimals(tokenOut));
  const impliedEthPriceUsdc = tokenIn === "USDC"
    ? Number(amountIn) / Number(expectedOutput)
    : Number(expectedOutput) / Number(amountIn);
  if (!isTestnetEthPriceSane(impliedEthPriceUsdc)) throw new Error("The Base Sepolia pool price is outside the Testnet safety band.");
  return {
    tokenIn,
    tokenOut,
    amountIn,
    expectedOutput,
    minimumOutput: formatUnits(subtractSlippage(amountOut), decimals(tokenOut)),
    feeTier: BASE_UNISWAP_FEE,
    impliedEthPriceUsdc,
    quotedAt: Date.now(),
  };
}

async function exactApprovalCall(
  walletAddress: `0x${string}`,
  tokenAddress: `0x${string}`,
  spender: `0x${string}`,
  amount: bigint,
) {
  const allowance = await publicClient.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "allowance", args: [walletAddress, spender] });
  if (allowance >= amount) return null;
  return {
    to: tokenAddress,
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [spender, amount] }),
  } satisfies AtomicCall;
}

export async function executeBaseUniswapSwap(
  provider: EIP1193Provider,
  quote: BaseSwapQuote,
): Promise<BaseSwapExecution> {
  const { walletAddress } = await account(provider);
  const amountIn = parseUnits(quote.amountIn, decimals(quote.tokenIn));
  const minimumOutput = parseUnits(quote.minimumOutput, decimals(quote.tokenOut));
  const tokenOutAddress = token(quote.tokenOut);
  const before = await publicClient.readContract({ address: tokenOutAddress, abi: ERC20_ABI, functionName: "balanceOf", args: [walletAddress] });
  const approval = await exactApprovalCall(walletAddress, token(quote.tokenIn), BASE_CONTRACTS.uniswapV3SwapRouter, amountIn);
  const swapCall = {
    to: BASE_CONTRACTS.uniswapV3SwapRouter,
    data: encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [{ tokenIn: token(quote.tokenIn), tokenOut: tokenOutAddress, fee: quote.feeTier, recipient: walletAddress, amountIn, amountOutMinimum: minimumOutput, sqrtPriceLimitX96: 0n }],
    }),
  } satisfies AtomicCall;
  const hash = await executeBaseAtomicCalls(provider, approval ? [approval, swapCall] : [swapCall]);
  const after = await publicClient.readContract({ address: tokenOutAddress, abi: ERC20_ABI, functionName: "balanceOf", args: [walletAddress] });
  const amountOut = after - before;
  if (amountOut < minimumOutput) throw new Error("The Uniswap swap returned less than the protected minimum.");
  return { approvalHash: approval ? hash : null, swapHash: hash, amountOut: formatUnits(amountOut, decimals(quote.tokenOut)), explorerUrl: `${BASE_SEPOLIA_EXPLORER_URL}/tx/${hash}` };
}

export async function mintBaseWideRangePosition(
  provider: EIP1193Provider,
  usdcAmount: string,
  wethAmount: string,
): Promise<BaseLpExecution> {
  const { walletAddress } = await account(provider);
  const amount0Desired = parseUnits(usdcAmount, 6);
  const amount1Desired = parseUnits(wethAmount, 18);
  if (amount0Desired <= 0n || amount1Desired <= 0n) throw new Error("Both USDC and WETH are required for the Uniswap position.");
  const approvalHashes: Hash[] = [];
  const [usdcApproval, wethApproval] = await Promise.all([
    exactApprovalCall(walletAddress, BASE_CONTRACTS.usdc, BASE_CONTRACTS.uniswapV3PositionManager, amount0Desired),
    exactApprovalCall(walletAddress, BASE_CONTRACTS.weth, BASE_CONTRACTS.uniswapV3PositionManager, amount1Desired),
  ]);
  const approvalCalls = [usdcApproval, wethApproval].filter((call): call is AtomicCall => Boolean(call));
  if (approvalCalls.length) approvalHashes.push(await executeBaseAtomicCalls(provider, approvalCalls));
  const deadline = BigInt(Math.floor(Date.now() / 1_000) + 1_200);
  const draft = {
    token0: BASE_CONTRACTS.usdc,
    token1: BASE_CONTRACTS.weth,
    fee: BASE_UNISWAP_FEE,
    tickLower: BASE_UNISWAP_TICK_LOWER,
    tickUpper: BASE_UNISWAP_TICK_UPPER,
    amount0Desired,
    amount1Desired,
    amount0Min: 0n,
    amount1Min: 0n,
    recipient: walletAddress,
    deadline,
  };
  const preview = await publicClient.simulateContract({ address: BASE_CONTRACTS.uniswapV3PositionManager, abi: POSITION_MANAGER_ABI, functionName: "mint", args: [draft], account: walletAddress });
  const [, expectedLiquidity, expected0, expected1] = preview.result;
  const protectedDraft = { ...draft, amount0Min: subtractSlippage(expected0), amount1Min: subtractSlippage(expected1) };
  await publicClient.simulateContract({
    address: BASE_CONTRACTS.uniswapV3PositionManager,
    abi: POSITION_MANAGER_ABI,
    functionName: "mint",
    args: [protectedDraft],
    account: walletAddress,
  });
  const hash = await executeBaseAtomicCalls(provider, [{
    to: BASE_CONTRACTS.uniswapV3PositionManager,
    data: encodeFunctionData({ abi: POSITION_MANAGER_ABI, functionName: "mint", args: [protectedDraft] }),
  }]);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The Uniswap liquidity mint reverted on Base Sepolia.");
  let tokenId: bigint | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== BASE_CONTRACTS.uniswapV3PositionManager.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: POSITION_EVENTS_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName === "Transfer" && decoded.args.from === "0x0000000000000000000000000000000000000000") tokenId = decoded.args.tokenId;
    } catch {
      // The receipt includes other position-manager events; only Transfer mints identify the NFT.
    }
  }
  if (tokenId == null) throw new Error("The Uniswap position was minted but its NFT identifier could not be decoded.");
  return {
    approvalHashes,
    mintHash: hash,
    tokenId: tokenId.toString(),
    liquidity: expectedLiquidity.toString(),
    amountUsdc: formatUnits(expected0, 6),
    amountWeth: formatUnits(expected1, 18),
    explorerUrl: `${BASE_SEPOLIA_EXPLORER_URL}/tx/${hash}`,
  };
}

export async function readBasePosition(tokenId: string) {
  const position = await publicClient.readContract({ address: BASE_CONTRACTS.uniswapV3PositionManager, abi: POSITION_MANAGER_ABI, functionName: "positions", args: [BigInt(tokenId)] });
  return { token0: position[2], token1: position[3], fee: position[4], tickLower: position[5], tickUpper: position[6], liquidity: position[7] };
}

export async function quoteBasePositionExit(tokenId: string, owner: `0x${string}`) {
  const position = await readBasePosition(tokenId);
  if (position.liquidity <= 0n) return { liquidity: "0", expectedUsdc: "0", expectedWeth: "0" };
  const preview = await publicClient.simulateContract({
    address: BASE_CONTRACTS.uniswapV3PositionManager,
    abi: POSITION_MANAGER_ABI,
    functionName: "decreaseLiquidity",
    args: [{ tokenId: BigInt(tokenId), liquidity: position.liquidity, amount0Min: 0n, amount1Min: 0n, deadline: BigInt(Math.floor(Date.now() / 1_000) + 1_200) }],
    account: owner,
  });
  return { liquidity: position.liquidity.toString(), expectedUsdc: formatUnits(preview.result[0], 6), expectedWeth: formatUnits(preview.result[1], 18) };
}

export async function removeBaseWideRangePosition(provider: EIP1193Provider, tokenId: string) {
  const { walletAddress } = await account(provider);
  const position = await readBasePosition(tokenId);
  if (position.token0.toLowerCase() !== BASE_CONTRACTS.usdc.toLowerCase() || position.token1.toLowerCase() !== BASE_CONTRACTS.weth.toLowerCase()) throw new Error("This NFT is not the configured Base USDC/WETH position.");
  const before0 = await publicClient.readContract({ address: BASE_CONTRACTS.usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [walletAddress] });
  const before1 = await publicClient.readContract({ address: BASE_CONTRACTS.weth, abi: ERC20_ABI, functionName: "balanceOf", args: [walletAddress] });
  const calls: AtomicCall[] = [];
  if (position.liquidity > 0n) {
    const deadline = BigInt(Math.floor(Date.now() / 1_000) + 1_200);
    const draft = { tokenId: BigInt(tokenId), liquidity: position.liquidity, amount0Min: 0n, amount1Min: 0n, deadline };
    const preview = await publicClient.simulateContract({ address: BASE_CONTRACTS.uniswapV3PositionManager, abi: POSITION_MANAGER_ABI, functionName: "decreaseLiquidity", args: [draft], account: walletAddress });
    const [expected0, expected1] = preview.result;
    const protectedDraft = { ...draft, amount0Min: subtractSlippage(expected0), amount1Min: subtractSlippage(expected1) };
    await publicClient.simulateContract({ address: BASE_CONTRACTS.uniswapV3PositionManager, abi: POSITION_MANAGER_ABI, functionName: "decreaseLiquidity", args: [protectedDraft], account: walletAddress });
    calls.push({
      to: BASE_CONTRACTS.uniswapV3PositionManager,
      data: encodeFunctionData({ abi: POSITION_MANAGER_ABI, functionName: "decreaseLiquidity", args: [protectedDraft] }),
    });
  }
  calls.push({
    to: BASE_CONTRACTS.uniswapV3PositionManager,
    data: encodeFunctionData({
      abi: POSITION_MANAGER_ABI,
      functionName: "collect",
      args: [{ tokenId: BigInt(tokenId), recipient: walletAddress, amount0Max: maxUint128, amount1Max: maxUint128 }],
    }),
  });
  const collectHash = await executeBaseAtomicCalls(provider, calls);
  const hashes = [collectHash];
  const after0 = await publicClient.readContract({ address: BASE_CONTRACTS.usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [walletAddress] });
  const after1 = await publicClient.readContract({ address: BASE_CONTRACTS.weth, abi: ERC20_ABI, functionName: "balanceOf", args: [walletAddress] });
  return { hashes, usdcAmount: formatUnits(after0 - before0, 6), wethAmount: formatUnits(after1 - before1, 18), explorerUrl: `${BASE_SEPOLIA_EXPLORER_URL}/tx/${collectHash}` };
}
