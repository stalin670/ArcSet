import {
  EIP1193Provider as CircleEip1193Provider,
  WebAuthnMode,
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
  type WebAuthnCredential,
} from "@circle-fin/modular-wallets-core";
import {
  createPublicClient,
  http,
  numberToHex,
  type Chain,
  type EIP1193Provider,
  type Hex,
} from "viem";
import {
  createBundlerClient,
  toWebAuthnAccount,
  type SmartAccount,
} from "viem/account-abstraction";
import { ARC_TESTNET, arcRpcUrl } from "./arc";
import { BASE_SEPOLIA, baseSepoliaRpcUrl } from "./base";

export const CIRCLE_CLIENT_URL =
  process.env.NEXT_PUBLIC_CLIENT_URL ??
  "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";
export const CIRCLE_PASSKEY_USERNAME = "ArcSet_wallet";

export type CircleSessionCredential = Pick<
  WebAuthnCredential,
  "id" | "publicKey" | "rpId"
>;

export type CircleWalletNetwork = "arc" | "base";

type CircleChainConfig = {
  chain: Chain;
  path: "/arcTestnet" | "/baseSepolia";
  rpcUrl: string;
};

const CIRCLE_CHAINS: Record<CircleWalletNetwork, CircleChainConfig> = {
  arc: {
    chain: ARC_TESTNET,
    path: "/arcTestnet",
    rpcUrl: arcRpcUrl,
  },
  base: {
    chain: BASE_SEPOLIA,
    path: "/baseSepolia",
    rpcUrl: baseSepoliaRpcUrl,
  },
};

type WalletCall = {
  to: Hex;
  data?: Hex;
  value?: bigint | number | string;
};

type PendingBatch =
  | { state: "pending" }
  | { state: "success"; transactionHash: Hex }
  | { state: "failed"; error: unknown };

function toValue(value: WalletCall["value"]) {
  if (value === undefined) return 0n;
  return BigInt(value);
}

function asCalls(value: unknown): WalletCall[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("Circle wallet calls must be a non-empty array.");
  }
  return value.map((call) => {
    if (!call || typeof call !== "object") {
      throw new TypeError("Circle wallet call data is invalid.");
    }
    const candidate = call as Record<string, unknown>;
    if (typeof candidate.to !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(candidate.to)) {
      throw new TypeError("Circle wallet call destination is invalid.");
    }
    if (candidate.data !== undefined && typeof candidate.data !== "string") {
      throw new TypeError("Circle wallet calldata is invalid.");
    }
    return {
      to: candidate.to as Hex,
      data: (candidate.data as Hex | undefined) ?? "0x",
      value: candidate.value as WalletCall["value"],
    };
  });
}

function requestParams(payload: { params?: unknown }) {
  return Array.isArray(payload.params) ? payload.params : [];
}

export function createSponsoredCircleProvider(
  chain: Chain,
  account: SmartAccount,
  bundlerClient: ReturnType<typeof createBundlerClient>,
  publicClient: ReturnType<typeof createPublicClient>,
): EIP1193Provider {
  const circleProvider = new CircleEip1193Provider(
    bundlerClient as ConstructorParameters<typeof CircleEip1193Provider>[0],
    publicClient as ConstructorParameters<typeof CircleEip1193Provider>[1],
  );
  const batches = new Map<string, PendingBatch>();
  const chainHex = numberToHex(chain.id);

  async function submit(calls: WalletCall[]) {
    const hash = await bundlerClient.sendUserOperation({
      account,
      calls: calls.map((call) => ({
        to: call.to,
        data: call.data ?? "0x",
        value: toValue(call.value),
      })),
      paymaster: true,
    });
    batches.set(hash, { state: "pending" });
    void bundlerClient.waitForUserOperationReceipt({ hash }).then(
      ({ receipt }) => {
        batches.set(hash, {
          state: receipt.status === "success" ? "success" : "failed",
          ...(receipt.status === "success"
            ? { transactionHash: receipt.transactionHash }
            : { error: new Error("The Circle user operation reverted.") }),
        } as PendingBatch);
      },
      (error) => batches.set(hash, { state: "failed", error }),
    );
    return hash;
  }

  return {
    request: async (payload) => {
      const params = requestParams(payload);
      if (payload.method === "eth_chainId") return chainHex;
      if (payload.method === "eth_accounts" || payload.method === "eth_requestAccounts") {
        return [await account.getAddress()];
      }

      if (payload.method === "wallet_switchEthereumChain") {
        const requested = (params[0] as { chainId?: unknown } | undefined)?.chainId;
        if (typeof requested === "string" && requested.toLowerCase() === chainHex.toLowerCase()) return null;
        throw new Error("Select the requested Circle wallet network in ArcSet first.");
      }

      if (payload.method === "wallet_getCapabilities") {
        return {
          [chainHex]: {
            atomic: { status: "supported" },
            paymasterService: { supported: true },
          },
        };
      }

      if (payload.method === "wallet_sendCalls") {
        const request = params[0] as { calls?: unknown; chainId?: unknown } | undefined;
        if (request?.chainId && String(request.chainId).toLowerCase() !== chainHex.toLowerCase()) {
          throw new Error("The requested atomic batch targets a different network.");
        }
        const id = await submit(asCalls(request?.calls));
        return { id };
      }

      if (payload.method === "wallet_getCallsStatus") {
        const input = params[0];
        const id = typeof input === "string"
          ? input
          : (input as { id?: unknown } | undefined)?.id;
        if (typeof id !== "string") throw new TypeError("The Circle batch identifier is missing.");
        const batch = batches.get(id);
        if (!batch || batch.state === "pending") {
          return { atomic: true, chainId: chainHex, version: "2.0.0", status: 100, receipts: [] };
        }
        if (batch.state === "failed") {
          return { atomic: true, chainId: chainHex, version: "2.0.0", status: 500, receipts: [] };
        }
        const receipt = await publicClient.request({
          method: "eth_getTransactionReceipt",
          params: [batch.transactionHash],
        } as never);
        if (!receipt) {
          return { atomic: true, chainId: chainHex, version: "2.0.0", status: 100, receipts: [] };
        }
        return {
          atomic: true,
          chainId: chainHex,
          version: "2.0.0",
          status: 200,
          receipts: [receipt],
        };
      }

      if (payload.method === "eth_sendTransaction") {
        const calls = asCalls(params.slice(0, 1));
        const userOperationHash = await submit(calls);
        const { receipt } = await bundlerClient.waitForUserOperationReceipt({ hash: userOperationHash });
        return receipt.transactionHash;
      }

      const signingMethod = payload.method === "personal_sign" || payload.method === "eth_signTypedData_v4";
      if (!signingMethod) return publicClient.request(payload as never);

      const response = await circleProvider.request(payload as never) as unknown;
      if (response && typeof response === "object" && "result" in response) {
        return (response as { result: unknown }).result;
      }
      return response;
    },
  } as EIP1193Provider;
}

export type CircleChainWallet = {
  address: Hex;
  provider: EIP1193Provider;
};

export function circlePasskeyTransport(clientKey: string) {
  return toPasskeyTransport(CIRCLE_CLIENT_URL, clientKey);
}

export async function createCirclePasskey(
  clientKey: string,
  mode: WebAuthnMode,
  username?: string,
): Promise<CircleSessionCredential> {
  const credential = await toWebAuthnCredential({
    transport: circlePasskeyTransport(clientKey),
    mode,
    ...(username ? { username } : {}),
  });
  return {
    id: credential.id,
    publicKey: credential.publicKey,
    rpId: credential.rpId,
  };
}

export async function createCircleChainWallet(
  clientKey: string,
  credential: CircleSessionCredential,
  network: CircleWalletNetwork,
): Promise<CircleChainWallet> {
  const config = CIRCLE_CHAINS[network];
  const modularTransport = toModularTransport(
    `${CIRCLE_CLIENT_URL}${config.path}`,
    clientKey,
  );
  const modularClient = createPublicClient({
    chain: config.chain,
    transport: modularTransport,
  });
  const owner = toWebAuthnAccount({
    credential: { id: credential.id, publicKey: credential.publicKey },
    rpId: credential.rpId,
  });
  const account = await toCircleSmartAccount({
    client: modularClient as Parameters<typeof toCircleSmartAccount>[0]["client"],
    owner,
    name: "ArcSet",
  });
  const bundlerClient = createBundlerClient({
    account,
    chain: config.chain,
    transport: modularTransport,
  });
  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });
  return {
    address: account.address,
    provider: createSponsoredCircleProvider(
      config.chain,
      account,
      bundlerClient,
      publicClient,
    ),
  };
}

export { WebAuthnMode };
