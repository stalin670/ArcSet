import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { PositionsDashboard } from "@/components/positions-dashboard";

export const metadata: Metadata = {
  title: "Positions",
  description: "ArcSet positions and current Arc Testnet wallet assets.",
};

export default function PositionsPage() {
  return (
    <AppShell>
      <section className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">Arc Testnet</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.045em] md:text-6xl">Portfolio</h1>
        <p className="mt-3 text-sm text-muted-foreground">Balances, baskets and recent activity.</p>
        <div className="mt-8"><PositionsDashboard /></div>
      </section>
    </AppShell>
  );
}
