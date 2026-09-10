import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { ArcOnboardingGuide } from "@/components/arc-onboarding-guide";
import { BasketGrid } from "@/components/basket-grid";

export const metadata: Metadata = {
  title: "Explore",
  description: "Explore transparent DeFi investment baskets on Arc Testnet.",
};

export default function ExplorePage() {
  return (
    <AppShell>
      <section className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-16">
        <p className="mb-3 font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">Arc Testnet</p>
        <h1 className="max-w-3xl text-4xl font-extrabold tracking-[-0.045em] md:text-6xl">Explore baskets</h1>
        <ArcOnboardingGuide />
        <Suspense fallback={<CatalogSkeleton />}>
          <BasketGrid />
        </Suspense>
      </section>
    </AppShell>
  );
}

function CatalogSkeleton() {
  return (
    <div className="mt-8" aria-label="Loading basket catalog" aria-busy="true">
      <div className="h-11 w-4/5 animate-pulse rounded-lg bg-muted md:w-1/2" />
      <div className="mt-8 flex gap-2">
        {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-11 w-24 animate-pulse rounded-full bg-muted" />)}
      </div>
      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-96 animate-pulse rounded-[var(--radius-card)] bg-muted" />)}
      </div>
    </div>
  );
}
