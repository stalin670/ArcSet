import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { ConnectWallet } from "@/components/connect-wallet";
import { LandingGetStarted } from "@/components/landing-get-started";
import { LandingStrategyShowcase, type LandingPreviewBasket } from "@/components/landing-strategy-showcase";
import { baskets, getBasket } from "@/lib/baskets";

export const metadata: Metadata = {
  title: { absolute: "ArcSet — programmable money strategies" },
  description: "Turn a market view into a transparent, user-controlled strategy on Arc.",
};

export default function LandingPage() {
  const featured = getLandingBasket("bitcoin-income", 0);
  const earn = getLandingBasket("arc-dollar-yield", 1);
  const balanced = getLandingBasket("arc-balanced", 2);
  const previewBaskets: LandingPreviewBasket[] = [featured, earn, balanced].map((basket, index) => ({
    name: basket.name,
    eyebrow: ["Growth + income", "Stable yield", "Balanced DeFi"][index] ?? "Strategy",
    status: "LIVE ON ARC",
    artwork: basket.artwork,
    metricLabel: basket.metricLabel,
    metricValue: basket.metricValue,
    metricType: basket.metricType,
    legs: basket.legs.map((leg) => ({ symbol: leg.symbol, weight: leg.weight })),
  }));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-5 px-5 md:px-8">
          <Link href="/" className="focus-ring -ml-2 inline-flex min-h-11 items-center px-2 text-2xl font-extrabold tracking-[-0.04em]">
            arc<span className="text-primary">.</span>set
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/docs" className="focus-ring pressable inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-extrabold tracking-[0.08em] text-muted-foreground transition-colors duration-100 ease-out hover:text-foreground sm:px-3">DOCS</Link>
            <ConnectWallet />
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero relative overflow-hidden">
          <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-5 py-12 md:px-8 md:py-20 lg:min-h-[calc(100vh-5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(27rem,0.86fr)] lg:gap-16 lg:py-16">
          <div className="max-w-3xl">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">Programmable portfolios on Arc</p>
            <h1 className="mt-5 text-5xl font-extrabold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              Your view.<br />Built into a basket.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground md:text-lg md:leading-8">
              Combine liquid assets and verified DeFi positions in one transparent strategy. See every route before you sign.
            </p>
            <div className="mt-8">
              <LandingGetStarted />
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-muted-foreground" aria-label="Product benefits">
              {["Clear allocations", "Review before signing", "Built for Arc Testnet"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="grid size-5 place-items-center rounded-full bg-accent text-accent-foreground">
                    <Check aria-hidden="true" size={12} strokeWidth={2.5} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <LandingStrategyShowcase baskets={previewBaskets} />
          </div>
        </section>

        <section id="strategies" className="scroll-mt-24 border-t border-border/70 px-5 py-20 md:px-8 md:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">Strategy types</p>
                <h2 className="mt-4 text-4xl font-extrabold tracking-[-0.045em] md:text-5xl">More than a token list.</h2>
              </div>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground lg:justify-self-end">Each basket turns a specific investment thesis into visible target weights, protocol risks, and exit paths.</p>
            </div>

            <div className="mt-12 grid gap-4 lg:grid-cols-12 lg:grid-rows-2">
              <article className="artwork artwork-bitcoin min-h-96 overflow-hidden rounded-[var(--radius-card)] border border-border lg:col-span-7 lg:row-span-2">
                <div className="absolute inset-x-5 bottom-5 z-10 rounded-xl bg-background/85 p-5 backdrop-blur-md md:inset-x-6 md:bottom-6 md:p-6">
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-primary">Assets</p>
                  <h3 className="mt-2 text-2xl font-extrabold tracking-[-0.03em] md:text-3xl">Build a deliberate allocation.</h3>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Balance cirBTC, productive USDC, EURC, and liquid reserves with weights you can inspect.</p>
                </div>
              </article>
              <article className="artwork artwork-treasury min-h-56 overflow-hidden rounded-[var(--radius-card)] border border-border lg:col-span-5">
                <div className="absolute inset-x-4 bottom-4 z-10 rounded-xl bg-background/85 p-4 backdrop-blur-md">
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-primary">Yield</p>
                  <h3 className="mt-1 text-xl font-extrabold tracking-[-0.025em]">Put idle USDC to work.</h3>
                  <p className="mt-2 text-sm text-muted-foreground">Review the live vault before depositing.</p>
                </div>
              </article>
              <article className="artwork artwork-index min-h-56 overflow-hidden rounded-[var(--radius-card)] border border-border lg:col-span-5">
                <div className="absolute inset-x-4 bottom-4 z-10 rounded-xl bg-background/85 p-4 backdrop-blur-md">
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-primary">Balanced DeFi</p>
                  <h3 className="mt-1 text-xl font-extrabold tracking-[-0.025em]">Diversify the return drivers.</h3>
                  <p className="mt-2 text-sm text-muted-foreground">Combine growth, income, FX exposure, and a liquid reserve.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 border-y border-border/70 bg-card/35 px-5 py-20 md:px-8 md:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div className="lg:sticky lg:top-32 lg:self-start">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">How it works</p>
              <h2 className="mt-4 max-w-lg text-4xl font-extrabold tracking-[-0.045em] md:text-5xl">From conviction to position.</h2>
              <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">Nothing moves until you have reviewed the basket and approved the transaction.</p>
            </div>
            <ol className="border-t border-border">
              <ProcessStep number="01" title="Choose the thesis" description="Start with stable income, Bitcoin plus yield, currency diversification, or a balanced allocation." />
              <ProcessStep number="02" title="Inspect every protocol" description="See target weights, live adapters, liquidity, time horizon, and risk notes." />
              <ProcessStep number="03" title="Review and approve" description="Verify every live quote, confirm the plan, and approve each required passkey operation. ArcSet shows every submitted step and receipt." />
            </ol>
          </div>
        </section>

        <section className="px-5 py-20 md:px-8 md:py-28">
          <div className="mx-auto grid max-w-7xl overflow-hidden rounded-[var(--radius-card)] border border-border bg-card lg:grid-cols-[0.9fr_1.1fr]">
            <div className="landing-usdc-panel relative min-h-72 overflow-hidden border-b border-border p-7 md:p-10 lg:min-h-96 lg:border-b-0 lg:border-r">
              <span className="relative z-10 font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">Why Arc</span>
              <p className="relative z-10 mt-8 max-w-sm text-5xl font-extrabold leading-none tracking-[-0.06em] md:text-7xl">USDC<br />all the way down.</p>
            </div>
            <div className="flex flex-col justify-center p-7 md:p-10 lg:p-14">
              <h2 className="max-w-xl text-3xl font-extrabold tracking-[-0.04em] md:text-4xl">The money in your basket also powers the network.</h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">Arc uses USDC for gas. The same dollars can fund a basket, remain liquid, or enter a verified vault without requiring a separate volatile gas token.</p>
              <ul className="mt-7 space-y-3 text-sm font-semibold">
                {["No separate gas token", "One visible USDC balance", "Arc Testnet execution"].map((item) => (
                  <li key={item} className="flex items-center gap-3"><Check aria-hidden="true" className="text-primary" size={16} />{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="px-5 pb-20 md:px-8 md:pb-28">
          <div className="landing-final relative mx-auto max-w-7xl overflow-hidden rounded-[var(--radius-card)] border border-border bg-card p-7 md:p-12 lg:p-16">
            <div className="relative z-10 max-w-2xl">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">Start on Arc</p>
              <h2 className="mt-4 text-4xl font-extrabold tracking-[-0.045em] md:text-6xl">Bring the view.<br />See the whole basket.</h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">Create a Circle passkey wallet, then choose the strategy that fits.</p>
              <div className="mt-8"><LandingGetStarted /></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-xs font-semibold text-muted-foreground md:px-8">
        <span>ArcSet</span>
        <span>Arc Testnet</span>
      </footer>
    </div>
  );
}

function ProcessStep({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <li className="grid gap-4 border-b border-border py-7 sm:grid-cols-[3rem_1fr] md:py-9">
      <span className="font-mono text-xs font-bold text-primary">{number}</span>
      <div>
        <h3 className="text-xl font-extrabold tracking-[-0.025em]">{title}</h3>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </li>
  );
}

function getLandingBasket(slug: string, fallbackIndex: number) {
  const basket = getBasket(slug) ?? baskets[fallbackIndex] ?? baskets[0];
  if (!basket) throw new Error("ArcSet requires at least one strategy.");
  return basket;
}
