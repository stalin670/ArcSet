import "server-only";
import { createPublicClient, http } from "viem";
import { ARC_RPC_FALLBACK_URLS, ARC_TESTNET, arcRpcUrl } from "./arc";
import { firstSuccessful } from "./arc-rpc";

const DEFAULT_RPC_TIMEOUT_MS = 7_000;
const DEFAULT_RPC_RETRY_COUNT = 1;

export function configuredArcRpcUrls() {
  return Array.from(new Set([
    process.env.ARC_RPC_URL,
    arcRpcUrl,
    ...ARC_RPC_FALLBACK_URLS,
  ].filter((url): url is string => Boolean(url))));
}

export function createArcServerClient(
  rpcUrl: string,
  options: { timeoutMs?: number; retryCount?: number } = {},
) {
  return createPublicClient({
    chain: ARC_TESTNET,
    transport: http(rpcUrl, {
      retryCount: options.retryCount ?? DEFAULT_RPC_RETRY_COUNT,
      retryDelay: 200,
      timeout: options.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
    }),
  });
}

export type ArcServerClient = ReturnType<typeof createArcServerClient>;

export function readArcWithFallback<TResult>(
  reader: (client: ArcServerClient, rpcUrl: string) => Promise<TResult>,
  options: { timeoutMs?: number; retryCount?: number } = {},
) {
  return firstSuccessful(configuredArcRpcUrls(), (rpcUrl) => (
    reader(createArcServerClient(rpcUrl, options), rpcUrl)
  ));
}
