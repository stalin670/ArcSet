import { ArrowDown, CircleAlert, CircleCheck, CircleDollarSign, Database, Info, Landmark, Layers3, Route, ShieldCheck, WalletCards } from "lucide-react";
import { ARC_CONTRACTS, ARC_EXPLORER_URL, ARC_TESTNET } from "@/lib/arc";

type CalloutKind = "info" | "warning" | "success";

const calloutConfig = {
  info: { icon: Info, className: "border-concept/25 bg-concept/10 text-concept" },
  warning: { icon: CircleAlert, className: "border-warning/25 bg-warning/10 text-warning" },
  success: { icon: CircleCheck, className: "border-primary/25 bg-primary/8 text-primary" },
} as const;

export function DocsCallout({ kind = "info", title, children }: { kind?: CalloutKind; title: string; children: React.ReactNode }) {
  const config = calloutConfig[kind];
  const Icon = config.icon;
  return (
    <aside className={`rounded-xl border p-4 ${config.className}`}>
      <div className="flex gap-3">
        <Icon aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
        <div className="min-w-0 text-sm leading-6"><p className="font-extrabold text-foreground">{title}</p><div className="mt-1 text-muted-foreground">{children}</div></div>
      </div>
    </aside>
  );
}

export function SystemFlow() {
  const steps = [
    ["01", "Circle wallet", "A passkey controls the Arc and Base modular smart accounts."],
    ["02", "Route builder", "Turns basket weights and the selected amount into explicit calls."],
    ["03", "Protocol adapters", "Verify swaps, the active Morpho vault, fees, and exit support."],
    ["04", "Arc receipt", "Finalizes the transaction and updates the visible position state."],
  ];
  return (
    <ol className="grid overflow-hidden rounded-xl border border-border bg-card md:grid-cols-4">
      {steps.map(([number, title, description]) => (
        <li key={number} className="border-b border-border p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
          <span className="font-mono text-xs font-bold text-primary">{number}</span>
          <p className="mt-3 text-sm font-extrabold text-foreground">{title}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
        </li>
      ))}
    </ol>
  );
}

const diagramNodes = {
  execution: [
    { icon: CircleDollarSign, title: "App Kit swaps", detail: "USDC to EURC or cirBTC on Arc" },
    { icon: Landmark, title: "Morpho EarnKit", detail: "Verified ERC-4626 USDC vault" },
    { icon: Route, title: "CCTP + Uniswap", detail: "Capped Base liquidity preview" },
  ],
  reads: [
    { icon: Layers3, title: "Arc RPC", detail: "Live balances and receipts" },
    { icon: Database, title: "The Graph", detail: "Standardized vault metrics and activity" },
    { icon: ShieldCheck, title: "Recovery state", detail: "Only unfinished execution steps" },
  ],
} as const;

export function ArchitectureDiagram() {
  return (
    <figure aria-labelledby="architecture-diagram-title" className="not-prose overflow-hidden rounded-[var(--radius-card)] border border-border bg-card p-4 md:p-6">
      <figcaption id="architecture-diagram-title" className="sr-only">ArcSet architecture from wallet approval through protocol execution and portfolio reads.</figcaption>
      <DiagramNode icon={WalletCards} eyebrow="User control" title="Circle modular wallet" detail="Passkey signing, sponsored gas and atomic calls" emphasized />
      <DiagramArrow label="signs a reviewed plan" />
      <DiagramNode icon={Layers3} eyebrow="Application" title="ArcSet route builder" detail="Allocates USDC, refreshes quotes, and sequences verified steps" />
      <DiagramArrow label="executes through adapters" />
      <DiagramGroup label="Protocol execution" nodes={diagramNodes.execution} />
      <DiagramArrow label="produces receipts and positions" />
      <DiagramGroup label="Verified data" nodes={diagramNodes.reads} />
      <DiagramArrow label="reconciles the portfolio" />
      <DiagramNode icon={Database} eyebrow="User view" title="Portfolio" detail="Balances, basket attribution, indexed activity, drift, and exits" emphasized />
    </figure>
  );
}

function DiagramGroup({ label, nodes }: { label: string; nodes: typeof diagramNodes.execution | typeof diagramNodes.reads }) {
  return (
    <section aria-label={label}>
      <p className="mb-2 font-mono text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className="grid gap-2 md:grid-cols-3">
        {nodes.map((node) => <DiagramNode key={node.title} {...node} />)}
      </div>
    </section>
  );
}

function DiagramNode({ icon: Icon, eyebrow, title, detail, emphasized = false }: { icon: typeof WalletCards; eyebrow?: string; title: string; detail: string; emphasized?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${emphasized ? "border-primary/30 bg-primary/8" : "border-border bg-background"}`}>
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${emphasized ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}><Icon aria-hidden="true" size={17} /></span>
        <div className="min-w-0">
          {eyebrow ? <p className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.1em] text-primary">{eyebrow}</p> : null}
          <p className={`${eyebrow ? "mt-1" : ""} text-sm font-extrabold text-foreground`}>{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function DiagramArrow({ label }: { label: string }) {
  return <div className="flex flex-col items-center py-2 text-muted-foreground"><ArrowDown aria-hidden="true" size={18} /><span className="mt-1 text-[0.68rem] font-semibold">{label}</span></div>;
}

const coreContracts = [
  ["USDC", ARC_CONTRACTS.usdc, "6-decimal application balance and approvals"],
  ["EURC", ARC_CONTRACTS.eurc, "Euro-denominated swap output"],
  ["cirBTC", ARC_CONTRACTS.cirbtc, "Bitcoin exposure used by asset baskets"],
] as const;

export function ArcContractTables() {
  return (
    <div className="space-y-6">
      <ContractTable title="Arc application contracts" rows={coreContracts} />
      <p className="text-xs leading-5 text-muted-foreground">Configured for chain ID <span className="font-mono text-foreground">{ARC_TESTNET.id}</span>. Verify environment-specific addresses against the official Arc source before changing configuration.</p>
    </div>
  );
}

function ContractTable({ title, rows }: { title: string; rows: readonly (readonly [string, `0x${string}`, string])[] }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-3 text-sm font-extrabold text-foreground">{title}</h3>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[44rem] border-collapse text-left text-xs">
          <thead className="bg-muted"><tr><th className="px-4 py-3">Contract</th><th className="px-4 py-3">Address</th><th className="px-4 py-3">Role</th></tr></thead>
          <tbody className="divide-y divide-border bg-card">
            {rows.map(([name, address, role]) => (
              <tr key={address}>
                <td className="px-4 py-3 font-bold text-foreground">{name}</td>
                <td className="px-4 py-3"><a href={`${ARC_EXPLORER_URL}/address/${address}`} target="_blank" rel="noreferrer" className="focus-ring rounded-sm font-mono text-foreground underline decoration-border underline-offset-4 hover:decoration-primary">{address}</a></td>
                <td className="px-4 py-3 text-muted-foreground">{role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SecurityChecklist() {
  const items = [
    "No private keys, seed phrases, or Circle server API keys in browser code.",
    "Every transaction requires a fresh quote or verified onchain snapshot.",
    "Mock, restricted, and announced-only protocols stay out of the public catalog.",
    "Every swap has an enforceable minimum output and every vault has a tested withdrawal path.",
    "Recorded browser metadata never replaces live Arc balance reads.",
  ];
  return <ul className="grid gap-3 rounded-xl border border-border bg-card p-5">{items.map((item) => <li key={item} className="flex gap-3 text-sm leading-6 text-muted-foreground"><ShieldCheck aria-hidden="true" className="mt-1 shrink-0 text-primary" size={16} />{item}</li>)}</ul>;
}
