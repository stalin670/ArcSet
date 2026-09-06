import { CircleCheck, CircleDashed, LockKeyhole } from "lucide-react";
import type { BasketReadiness } from "@/lib/baskets";

const statusConfig = {
  testnet: { icon: CircleCheck, className: "bg-accent text-accent-foreground" },
  restricted: { icon: LockKeyhole, className: "bg-warning/15 text-warning" },
  reference: { icon: CircleDashed, className: "bg-concept/15 text-concept" },
} satisfies Record<BasketReadiness, { icon: typeof CircleCheck; className: string }>;

export function StatusPill({ readiness, label }: { readiness: BasketReadiness; label: string }) {
  const config = statusConfig[readiness];
  const Icon = config.icon;

  return (
    <span className={`inline-flex self-start items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${config.className}`}>
      <Icon aria-hidden="true" size={13} />
      {label}
    </span>
  );
}
