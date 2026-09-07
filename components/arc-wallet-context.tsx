"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import type { EIP1193Provider } from "viem";
import {
  WebAuthnMode,
  CIRCLE_PASSKEY_USERNAME,
  createCircleChainWallet,
  createCirclePasskey,
  type CircleChainWallet,
  type CircleSessionCredential,
  type CircleWalletNetwork,
} from "@/lib/circle-wallet";
import { isCircleSessionCredential } from "@/lib/circle-wallet-session";
import { resolveArcWalletStatus, type ArcWalletStatus } from "@/lib/arc-wallet-status";
import { readableWalletError } from "@/lib/wallet-errors";

type ArcWalletContextValue = {
  status: ArcWalletStatus;
  address: `0x${string}` | null;
  baseAddress: `0x${string}` | null;
  balance: number | null;
  balanceUpdatedAt: number | null;
  balanceLoading: boolean;
  atomicBatchSupported: boolean | null;
  atomicBatchLoading: boolean;
  actionPending: boolean;
  error: string;
  login: () => void;
  logout: () => Promise<void>;
  createWallet: () => Promise<void>;
  switchToArc: () => Promise<void>;
  switchToBase: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  clearError: () => void;
  getEthereumProvider: (() => Promise<EIP1193Provider>) | null;
};

type CircleWalletPair = {
  arc: CircleChainWallet;
  base: CircleChainWallet;
};

const noopAsync = async () => undefined;

const ArcWalletContext = createContext<ArcWalletContextValue>({
  status: "unconfigured",
  address: null,
  baseAddress: null,
  balance: null,
  balanceUpdatedAt: null,
  balanceLoading: false,
  atomicBatchSupported: null,
  atomicBatchLoading: false,
  actionPending: false,
  error: "Circle Modular Wallets are not configured.",
  login: () => undefined,
  logout: noopAsync,
  createWallet: noopAsync,
  switchToArc: noopAsync,
  switchToBase: noopAsync,
  refreshBalance: noopAsync,
  clearError: () => undefined,
  getEthereumProvider: null,
});

export function UnconfiguredArcWalletProvider({ children }: { children: React.ReactNode }) {
  return <ArcWalletContext.Provider value={{
    status: "unconfigured",
    address: null,
    baseAddress: null,
    balance: null,
    balanceUpdatedAt: null,
    balanceLoading: false,
    atomicBatchSupported: null,
    atomicBatchLoading: false,
    actionPending: false,
    error: "Add NEXT_PUBLIC_CLIENT_KEY to enable Circle passkey wallets.",
    login: () => undefined,
    logout: noopAsync,
    createWallet: noopAsync,
    switchToArc: noopAsync,
    switchToBase: noopAsync,
    refreshBalance: noopAsync,
    clearError: () => undefined,
    getEthereumProvider: null,
  }}>{children}</ArcWalletContext.Provider>;
}

async function saveSession(credential: CircleSessionCredential) {
  const response = await fetch("/api/wallet-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  if (!response.ok) throw new Error("The Circle wallet session could not be saved.");
}

export function CircleArcWalletProvider({ children }: { children: React.ReactNode }) {
  const clientKey = process.env.NEXT_PUBLIC_CLIENT_KEY ?? "";
  const [credential, setCredential] = useState<CircleSessionCredential | null>(null);
  const [wallets, setWallets] = useState<CircleWalletPair | null>(null);
  const [activeNetwork, setActiveNetwork] = useState<CircleWalletNetwork>("arc");
  const activeNetworkRef = useRef<CircleWalletNetwork>("arc");
  const [sessionReady, setSessionReady] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [initializationError, setInitializationError] = useState("");

  const initializeWallets = useCallback(async (nextCredential: CircleSessionCredential) => {
    if (!clientKey) throw new Error("Circle Modular Wallets are not configured.");
    setWalletLoading(true);
    setInitializationError("");
    try {
      const [arc, base] = await Promise.all([
        createCircleChainWallet(clientKey, nextCredential, "arc"),
        createCircleChainWallet(clientKey, nextCredential, "base"),
      ]);
      setWallets({ arc, base });
    } catch (error) {
      setWallets(null);
      setInitializationError(readableWalletError(error, "Couldn’t initialize the Circle smart wallet. Try again."));
      throw error;
    } finally {
      setWalletLoading(false);
    }
  }, [clientKey]);

  useEffect(() => {
    let active = true;
    void fetch("/api/wallet-session", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    }).then(async (response) => {
      if (!response.ok) throw new Error("The Circle wallet session could not be restored.");
      const payload: unknown = await response.json();
      const restored = (payload as { credential?: unknown } | null)?.credential;
      if (!active || !isCircleSessionCredential(restored)) return;
      setCredential(restored);
      await initializeWallets(restored).catch(() => undefined);
    }).catch((error) => {
      if (active) setInitializationError(readableWalletError(error, "Couldn’t restore the Circle wallet session. Sign in again."));
    }).finally(() => {
      if (active) setSessionReady(true);
    });
    return () => { active = false; };
  }, [initializeWallets]);

  const balanceQuery = useQuery({
    queryKey: ["arc-usdc-balance", wallets?.arc.address],
    enabled: Boolean(wallets?.arc.address),
    queryFn: async () => {
      const response = await fetch(`/api/wallets/${wallets?.arc.address}/usdc-balance`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json() as { balance?: string };
      if (!response.ok || payload.balance == null) throw new Error("Couldn’t load the USDC balance.");
      return Number(payload.balance);
    },
    retry: 2,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 2_000),
    refetchInterval: 15_000,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const runAction = useCallback(async (action: () => Promise<unknown>, fallback: string) => {
    setActionPending(true);
    setActionError("");
    try {
      await action();
      return true;
    } catch (error) {
      setActionError(readableWalletError(error, fallback));
      return false;
    } finally {
      setActionPending(false);
    }
  }, []);

  const handleLogin = useCallback(() => {
    void runAction(async () => {
      const nextCredential = await createCirclePasskey(clientKey, WebAuthnMode.Login);
      await saveSession(nextCredential);
      setInitializationError("");
      setCredential(nextCredential);
      setWallets(null);
      activeNetworkRef.current = "arc";
      setActiveNetwork("arc");
      await initializeWallets(nextCredential);
    }, "Couldn’t sign in with this passkey. Create a wallet if this is your first visit.");
  }, [clientKey, initializeWallets, runAction]);

  const handleCreateWallet = useCallback(async () => {
    await runAction(async () => {
      if (credential) {
        await initializeWallets(credential);
        return;
      }
      const nextCredential = await createCirclePasskey(
        clientKey,
        WebAuthnMode.Register,
        CIRCLE_PASSKEY_USERNAME,
      );
      await saveSession(nextCredential);
      setInitializationError("");
      setCredential(nextCredential);
      setWallets(null);
      activeNetworkRef.current = "arc";
      setActiveNetwork("arc");
      await initializeWallets(nextCredential);
    }, "Couldn’t create the Circle passkey wallet. Try again.");
  }, [clientKey, credential, initializeWallets, runAction]);

  const handleLogout = useCallback(async () => {
    await runAction(async () => {
      const response = await fetch("/api/wallet-session", { method: "DELETE" });
      if (!response.ok) throw new Error("The Circle wallet session could not be cleared.");
      setCredential(null);
      setWallets(null);
      activeNetworkRef.current = "arc";
      setActiveNetwork("arc");
      setInitializationError("");
    }, "Couldn’t sign out. Try again.");
  }, [runAction]);

  const switchToArc = useCallback(async () => {
    activeNetworkRef.current = "arc";
    setActiveNetwork("arc");
    setActionError("");
  }, []);
  const switchToBase = useCallback(async () => {
    activeNetworkRef.current = "base";
    setActiveNetwork("base");
    setActionError("");
  }, []);
  const clearError = useCallback(() => setActionError(""), []);
  const refreshBalance = useCallback(async () => {
    await balanceQuery.refetch();
  }, [balanceQuery]);
  const getEthereumProvider = useCallback(async () => {
    const wallet = wallets?.[activeNetworkRef.current];
    if (!wallet) throw new Error("The Circle smart wallet is unavailable.");
    return wallet.provider;
  }, [wallets]);

  const status = resolveArcWalletStatus({
    configured: Boolean(clientKey),
    sessionReady: sessionReady && !walletLoading,
    authenticated: Boolean(credential),
    walletsReady: Boolean(wallets),
    isOnArc: activeNetwork === "arc",
  });

  const value = useMemo<ArcWalletContextValue>(() => ({
    status,
    address: wallets?.arc.address ?? null,
    baseAddress: wallets?.base.address ?? null,
    balance: balanceQuery.data ?? null,
    balanceUpdatedAt: balanceQuery.dataUpdatedAt || null,
    balanceLoading: balanceQuery.isLoading || balanceQuery.isFetching,
    atomicBatchSupported: wallets ? true : null,
    atomicBatchLoading: walletLoading,
    actionPending,
    error: actionError || initializationError || (balanceQuery.error ? readableWalletError(balanceQuery.error, "Couldn’t load the USDC balance.") : ""),
    login: handleLogin,
    logout: handleLogout,
    createWallet: handleCreateWallet,
    switchToArc,
    switchToBase,
    refreshBalance,
    clearError,
    getEthereumProvider: wallets ? getEthereumProvider : null,
  }), [
    actionError,
    actionPending,
    balanceQuery.data,
    balanceQuery.dataUpdatedAt,
    balanceQuery.error,
    balanceQuery.isFetching,
    balanceQuery.isLoading,
    clearError,
    getEthereumProvider,
    handleCreateWallet,
    handleLogin,
    handleLogout,
    initializationError,
    refreshBalance,
    status,
    switchToArc,
    switchToBase,
    walletLoading,
    wallets,
  ]);

  return <ArcWalletContext.Provider value={value}>{children}</ArcWalletContext.Provider>;
}

export function useArcWallet() {
  return useContext(ArcWalletContext);
}
