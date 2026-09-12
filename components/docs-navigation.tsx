"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type DocsNavGroup = {
  label: string;
  links: readonly { href: string; label: string }[];
};

const groups: readonly DocsNavGroup[] = [
  {
    label: "Start here",
    links: [
      { href: "/docs", label: "Overview" },
      { href: "/docs#user-journey", label: "User journey" },
      { href: "/docs#product-boundaries", label: "Product boundaries" },
      { href: "/docs#mainnet-vision", label: "Mainnet vision" },
    ],
  },
  {
    label: "System",
    links: [
      { href: "/docs/architecture", label: "Architecture" },
      { href: "/docs/execution", label: "Execution model" },
      { href: "/docs/arc", label: "Arc fundamentals" },
    ],
  },
];

function routePart(href: string) {
  return href.split("#")[0];
}

function hashPart(href: string) {
  return href.includes("#") ? `#${href.split("#")[1]}` : "";
}

function useActiveSection(hrefs: readonly string[]) {
  const hrefKey = hrefs.join("|");
  const [activeHash, setActiveHash] = useState("");

  useEffect(() => {
    const sectionHrefs = hrefKey ? hrefKey.split("|") : [];
    let animationFrame = 0;

    function updateActiveSection() {
      animationFrame = 0;
      const activationLine = 144;
      let nextHash = "";

      for (const href of sectionHrefs) {
        const element = document.getElementById(href.slice(1));
        if (element && element.getBoundingClientRect().top <= activationLine) nextHash = href;
      }

      const atPageEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      if (atPageEnd && sectionHrefs.length) nextHash = sectionHrefs.at(-1) ?? nextHash;
      setActiveHash((current) => current === nextHash ? current : nextHash);
    }

    function scheduleUpdate() {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(updateActiveSection);
    }

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("hashchange", scheduleUpdate);
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("hashchange", scheduleUpdate);
    };
  }, [hrefKey]);

  return activeHash;
}

export function DocsNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const sectionHrefs = useMemo(
    () => groups.flatMap((group) => group.links)
      .filter((link) => routePart(link.href) === pathname && link.href.includes("#"))
      .map((link) => hashPart(link.href)),
    [pathname],
  );
  const activeHash = useActiveSection(sectionHrefs);

  return (
    <nav aria-label="Documentation" className={mobile ? "grid gap-5" : "space-y-7"}>
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-2 font-mono text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">{group.label}</p>
          <div className="grid gap-0.5">
            {group.links.map((link) => {
              const sameRoute = pathname === routePart(link.href);
              const linkHash = hashPart(link.href);
              const active = sameRoute && (linkHash ? activeHash === linkHash : activeHash === "");
              return (
                <Link key={link.href} href={link.href} aria-current={active ? linkHash ? "location" : "page" : undefined} className={`focus-ring min-h-10 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors duration-100 ease-out ${active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

const tocByPath: Record<string, Array<{ href: string; label: string }>> = {
  "/docs": [
    { href: "#what-arcset-is", label: "What ArcSet is" },
    { href: "#user-journey", label: "User journey" },
    { href: "#product-boundaries", label: "Product boundaries" },
    { href: "#mainnet-vision", label: "Mainnet vision" },
  ],
  "/docs/architecture": [
    { href: "#architecture-flow", label: "Architecture flow" },
  ],
  "/docs/execution": [
    { href: "#shared-transaction-lifecycle", label: "Transaction lifecycle" },
    { href: "#app-kit-swaps", label: "App Kit swaps" },
    { href: "#earnkit-vaults", label: "EarnKit vaults" },
    { href: "#composite-baskets", label: "Composite baskets" },
    { href: "#positions-and-receipts", label: "Positions and receipts" },
  ],
  "/docs/arc": [
    { href: "#network-profile", label: "Network profile" },
    { href: "#one-usdc-balance-two-interfaces", label: "USDC balance model" },
    { href: "#evm-differences", label: "EVM differences" },
    { href: "#contract-addresses", label: "Contract addresses" },
  ],
};

export function DocsOnThisPage() {
  const pathname = usePathname();
  const items = tocByPath[pathname] ?? [];
  const activeHash = useActiveSection(items.map((item) => item.href));
  return (
    <nav aria-label="On this page">
      <p className="mb-3 font-mono text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">On this page</p>
      <div className="grid gap-2.5">
        {items.map((item) => {
          const active = activeHash === item.href;
          return <a key={item.href} href={item.href} aria-current={active ? "location" : undefined} className={`focus-ring relative rounded-sm pl-3 text-xs font-semibold leading-5 transition-colors duration-100 ease-out before:absolute before:left-0 before:top-1 before:h-3 before:w-0.5 before:rounded-full ${active ? "text-foreground before:bg-primary" : "text-muted-foreground before:bg-transparent hover:text-foreground"}`}>{item.label}</a>;
        })}
      </div>
    </nav>
  );
}
