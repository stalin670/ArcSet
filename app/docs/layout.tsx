import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { DocsNavigation, DocsOnThisPage } from "@/components/docs-navigation";

export const metadata: Metadata = {
  title: { default: "Documentation", template: "%s — ArcSet Docs" },
  description: "Product, architecture, execution, and Arc documentation for ArcSet.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-18 max-w-[90rem] items-center justify-between gap-4 px-5 md:px-8">
          <Link href="/" className="focus-ring -ml-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2">
            <span className="text-xl font-extrabold tracking-[-0.04em]">arc<span className="text-primary">.</span>set</span>
            <span className="rounded-md bg-secondary px-2 py-1 font-mono text-[0.68rem] font-bold uppercase tracking-[0.1em] text-secondary-foreground">Docs</span>
          </Link>
          <Link href="/explore" className="focus-ring pressable inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-secondary px-4 text-sm font-bold text-secondary-foreground transition-colors duration-100 ease-out hover:bg-muted">
            Open app <ArrowUpRight aria-hidden="true" size={15} />
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-[90rem] lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_12rem]">
        <aside className="hidden border-r border-border px-5 py-10 lg:block">
          <div className="sticky top-28"><DocsNavigation /></div>
        </aside>

        <main className="min-w-0 px-5 py-10 md:px-10 md:py-14 xl:px-14">
          <details className="mb-10 rounded-xl border border-border bg-card p-4 lg:hidden">
            <summary className="focus-ring flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg font-bold text-foreground">
              <BookOpen aria-hidden="true" size={17} className="text-primary" /> Documentation menu
            </summary>
            <div className="mt-4 border-t border-border pt-4"><DocsNavigation mobile /></div>
          </details>
          <article className="docs-prose mx-auto max-w-3xl">{children}</article>
        </main>

        <aside className="hidden border-l border-border px-5 py-10 xl:block">
          <div className="sticky top-28"><DocsOnThisPage /></div>
        </aside>
      </div>
    </div>
  );
}
