"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowUpRight, Check, LoaderCircle } from "lucide-react";
import { formatUnits, parseUnits, type EIP1193Provider } from "viem";
import { useArcWallet } from "@/components/arc-wallet-context";
import { FormattedNumber } from "@/components/formatted-number";
import { quoteBasePositionExit, quoteBaseUniswapSwap } from "@/lib/base-uniswap-client";
import { quoteCctpBridge } from "@/lib/cctp-client";
import { CROSS_CHAIN_POSITION_UPDATED_EVENT, crossChainPositionsForWallet, readCrossChainPositions, type CrossChainBasketPosition } from "@/lib/cross-chain-positions";

import { createRoute, readRoute, type RouteRecord } from "@/lib/cross-chain-route";
import { executeExitRoute, subtractReturnFee, type ExitPlan, type ExitQuote } from "@/lib/cross-chain-route-execution";

export function CrossChainPositionManager() {
  const wallet = useArcWallet();
  const [positions, setPositions] = useState<CrossChainBasketPosition[]>([]);
  const [selected, setSelected] = useState<CrossChainBasketPosition | null>(null);
  const [quote, setQuote] = useState<ExitQuote | null>(null);
  const [phase, setPhase] = useState<"idle" | "quoting" | "review" | "executing" | "partial" | "success">("idle");
  const [error, setError] = useState("");
  const route = useRef<RouteRecord<ExitPlan> | null>(null);
  const [submissionUnknown, setSubmissionUnknown] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    function refresh() {
      if (!wallet.address || !wallet.baseAddress) {
        setPositions([]); setSelected(null); setQuote(null); setPhase("idle"); route.current = null;
        return;
      }
      try {
        const owned = crossChainPositionsForWallet(readCrossChainPositions(), wallet.address);
        const routes = owned.map((position) => ({ position, saved: readRoute<ExitPlan>(wallet.address!, wallet.baseAddress!, "exit:" + position.id) }));
        setPositions(routes.filter(({ position, saved }) => position.status !== "exited" || (saved && !saved.complete)).map(({ position }) => position));
        if (!lock.current) {
          const unfinished = routes.find(({ saved }) => saved && !saved.complete)?.saved;
          if (unfinished) {
            route.current = unfinished; setSelected(unfinished.plan.position); setQuote(unfinished.plan.quote);
            setSubmissionUnknown(Boolean(unfinished.pending)); setPhase("partial");
            setError(unfinished.pending ? "An exit submission was interrupted. Check its outcome in wallet history before continuing; it will not be repeated automatically." : "Recovered your saved exit. Resume the next unfinished step.");
          }
        }
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Saved cross-chain position metadata could not be read."); }
    }
    const frame = requestAnimationFrame(() => {
      setSelected(null); setQuote(null); setPhase("idle"); route.current = null; setError(""); setSubmissionUnknown(false);
      refresh();
    });
    window.addEventListener(CROSS_CHAIN_POSITION_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => { cancelAnimationFrame(frame); window.removeEventListener(CROSS_CHAIN_POSITION_UPDATED_EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, [wallet.address, wallet.baseAddress]);

  async function provider() {
    if (!wallet.getEthereumProvider) throw new Error("The Circle wallet provider is unavailable.");
    return await wallet.getEthereumProvider() as EIP1193Provider;
  }

  async function reviewExit(position: CrossChainBasketPosition) {
    if (!wallet.address || !wallet.baseAddress) return;
    setSelected(position);
    setError("");
    setPhase("quoting");
    try {
      const saved = readRoute<ExitPlan>(wallet.address, wallet.baseAddress, "exit:" + position.id);
      if (saved && !saved.complete) {
        route.current = saved; setSelected(saved.plan.position); setQuote(saved.plan.quote);
        setSubmissionUnknown(Boolean(saved.pending)); setPhase("partial");
        setError(saved.pending ? "An exit submission has an unknown outcome. Check wallet history before continuing." : "Recovered your saved exit.");
        return;
      }
      if (position.status === "partial" || position.status === "exiting") throw new Error("This older exit has no recovery journal. Check its transactions in wallet history before starting another exit.");
      route.current = null; setSubmissionUnknown(false);
      await wallet.switchToBase();
      const walletProvider = await provider();
      const removal = await quoteBasePositionExit(position.tokenId, wallet.baseAddress);
      if (removal.liquidity === "0") throw new Error("This Uniswap position no longer has active liquidity.");
      const attributedWeth = formatUnits(parseUnits(removal.expectedWeth, 18) + parseUnits(position.residualWeth, 18), 18);
      const attributedUsdc = formatUnits(parseUnits(removal.expectedUsdc, 6) + parseUnits(position.residualUsdc, 6), 6);
      const swap = parseUnits(attributedWeth, 18) === 0n ? { expectedOutput: "0", minimumOutput: "0" } : await quoteBaseUniswapSwap(attributedWeth, "WETH");
      const total = formatUnits(parseUnits(attributedUsdc, 6) + parseUnits(swap.expectedOutput, 6), 6);
      const initialBridge = await quoteCctpBridge(walletProvider, "base-to-arc", wallet.address, total);
      const estimatedReturn = subtractReturnFee(total, initialBridge.feeTotal);
      const bridge = await quoteCctpBridge(walletProvider, "base-to-arc", wallet.address, estimatedReturn);
      setQuote({ expectedUsdc: attributedUsdc, expectedWeth: attributedWeth, swapMinimum: swap.minimumOutput, estimatedReturn, bridgeFee: bridge.feeTotal });
      setPhase("review");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The exit could not be quoted.");
      setPhase("idle");
    }
  }

  async function executeExit() {
    if (!selected || !quote || !wallet.address || !wallet.baseAddress || lock.current) return;
    lock.current = true;
    setError(""); setPhase("executing");
    try {
      const saved = route.current ?? createRoute(wallet.address, wallet.baseAddress, "exit:" + selected.id, { position: selected, quote });
      route.current = saved;
      await executeExitRoute(saved, { provider, switchToArc: wallet.switchToArc, switchToBase: wallet.switchToBase });
      setPhase("success");
      void wallet.switchToArc().then(() => wallet.refreshBalance()).catch(() => {});
    } catch (cause) {
      setSubmissionUnknown(Boolean(route.current?.pending));
      setError(cause instanceof Error ? cause.message : "The exit paused before completion.");
      setPhase(route.current ? "partial" : "review");
    } finally { lock.current = false; }
  }

  if (!positions.length && phase !== "success" && !error) return null;

  if (phase === "success") return <section className="rounded-[var(--radius-card)] border border-border bg-card p-5"><div className="flex gap-3"><Check className="text-primary" aria-hidden="true" size={20} /><div><h3 className="font-extrabold">Cross-chain exit complete</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">The LP was removed, WETH was converted to USDC, and CCTP returned the proceeds to Arc.</p></div></div></section>;

  if ((phase === "review" || phase === "executing" || phase === "partial") && selected && quote) return <section className="rounded-[var(--radius-card)] border border-border bg-card p-5" aria-live="polite"><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-xs font-bold text-warning">UNISWAP NFT #{selected.tokenId}</p><h3 className="mt-1 font-extrabold">{phase === "partial" ? "Exit paused" : phase === "executing" ? "Executing return to Arc" : "Return position to Arc"}</h3></div>{phase === "executing" ? <LoaderCircle className="animate-spin text-warning" aria-hidden="true" size={18} /> : null}</div><dl className="mt-4 divide-y divide-border rounded-xl bg-muted px-4"><ExitRow label="Expected USDC from LP" value={quote.expectedUsdc} token="USDC" /><ExitRow label="Expected WETH from LP" value={quote.expectedWeth} token="WETH" /><ExitRow label="Minimum swap output" value={quote.swapMinimum} token="USDC" /><ExitRow label="Estimated CCTP fee" value={quote.bridgeFee} token="USDC" /><ExitRow label="Estimated return to Arc" value={quote.estimatedReturn} token="USDC" /></dl>{error ? <p className="mt-4 text-xs font-semibold leading-5 text-destructive" role="alert">{error}</p> : null}{phase !== "executing" ? <><p className="mt-4 text-xs leading-5 text-muted-foreground">Approve each sponsored passkey operation across Base and CCTP. Completed stages will not be repeated.</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => void executeExit()} disabled={submissionUnknown} className="focus-ring min-h-11 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground">{submissionUnknown ? "Check wallet history" : phase === "partial" ? "Resume exit" : "Confirm full exit"}</button>{phase === "review" ? <button type="button" onClick={() => { setPhase("idle"); setSelected(null); setQuote(null); setError(""); route.current = null; }} className="focus-ring min-h-11 rounded-[var(--radius-control)] px-4 text-sm font-bold text-muted-foreground">Cancel</button> : null}</div></> : <p className="mt-4 text-xs font-bold text-muted-foreground">Submitting Base and CCTP exit steps. Completed transactions will not be repeated.</p>}</section>;

  return <section className="rounded-[var(--radius-card)] border border-border bg-card p-5"><h3 className="font-extrabold">Manage Base liquidity</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Remove the full LP position and return canonical USDC to Arc through CCTP.</p>{error ? <div className="mt-4 flex gap-2 rounded-xl bg-destructive/5 p-3 text-xs text-destructive"><AlertCircle aria-hidden="true" size={16} />{error}</div> : null}<div className="mt-4 space-y-2">{positions.map((position) => <div key={position.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted p-3"><div><p className="text-sm font-bold">Uniswap V3 NFT #{position.tokenId}</p><p className="mt-1 text-xs text-muted-foreground"><FormattedNumber value={Number(position.baseUsdc)} type="token_amount" context="detailed" tokenPriceUsd={1} /> USDC originally routed</p></div><div className="flex gap-2"><a href={`https://sepolia.basescan.org/token/0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2?a=${position.tokenId}`} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-bold">NFT <ArrowUpRight aria-hidden="true" size={13} /></a><button type="button" onClick={() => void reviewExit(position)} disabled={phase === "quoting"} aria-busy={phase === "quoting"} className="focus-ring min-h-10 rounded-[var(--radius-control)] bg-secondary px-3 text-xs font-bold disabled:opacity-60">{phase === "quoting" && selected?.id === position.id ? "Quoting…" : "Review full exit"}</button></div></div>)}</div></section>;
}

function ExitRow({ label, value, token }: { label: string; value: string; token: string }) {
  return <div className="flex items-baseline justify-between gap-4 py-2.5"><dt className="text-xs font-semibold text-muted-foreground">{label}</dt><dd><FormattedNumber value={Number(value)} type="token_amount" context="detailed" tokenPriceUsd={token === "USDC" ? 1 : undefined} className="font-bold" /><span className="ml-1.5 text-xs text-muted-foreground">{token}</span></dd></div>;
}
