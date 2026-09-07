"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Database, WalletCards } from "lucide-react";
import { ConnectWallet } from "@/components/connect-wallet";

const navItems = [
  { label: "Explore", href: "/explore", icon: Compass },
  { label: "Portfolio", href: "/positions", icon: WalletCards },
  { label: "Data", href: "/data", icon: Database },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => href === "/explore"
    ? pathname === "/explore" || pathname.startsWith("/basket/")
    : pathname.startsWith(href);

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-5 px-5 md:px-8">
          <Link href="/" className="focus-ring -ml-2 inline-flex min-h-11 items-center px-2 text-2xl font-extrabold tracking-[-0.04em]">
            arc<span className="text-primary">.</span>set
          </Link>
          <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex">
            {navItems.map(({ label, href }) => (
              <Link key={label} href={href} aria-current={isActive(href) ? "page" : undefined} className={`focus-ring pressable inline-flex min-h-11 items-center rounded-lg px-4 text-xs font-extrabold tracking-[0.09em] transition-colors duration-100 ease-out ${isActive(href) ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {label.toUpperCase()}
              </Link>
            ))}
          </nav>
          <ConnectWallet />
        </div>
      </header>

      <main>{children}</main>

      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit items-center gap-1 rounded-2xl border border-border bg-popover/95 p-1.5 shadow-2xl shadow-black/20 backdrop-blur-xl md:hidden">
        {navItems.map(({ label, href, icon: Icon }) => (
          <Link key={label} href={href} aria-current={isActive(href) ? "page" : undefined} className={`focus-ring pressable flex min-h-12 min-w-24 flex-col items-center justify-center gap-1 rounded-xl px-4 text-[0.65rem] font-extrabold tracking-[0.08em] transition-colors duration-100 ease-out ${isActive(href) ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}>
            <Icon aria-hidden="true" size={17} />
            {label.toUpperCase()}
          </Link>
        ))}
      </nav>
    </div>
  );
}
