import type { BasketLeg } from "@/lib/baskets";
import { FormattedNumber } from "@/components/formatted-number";

const strokeClasses = ["stroke-primary", "stroke-concept", "stroke-warning", "stroke-muted-foreground"];
const swatchClasses = ["bg-primary", "bg-concept", "bg-warning", "bg-muted-foreground"];

export function AllocationRing({ legs }: { legs: BasketLeg[] }) {
  const segments = legs.map((leg, index) => ({
    leg,
    index,
    offset: legs.slice(0, index).reduce((total, item) => total + item.weight, 0),
  }));

  return (
    <div className="grid items-center gap-8 md:grid-cols-[15rem_1fr]">
      <svg viewBox="0 0 120 120" className="mx-auto size-52 -rotate-90" role="img" aria-label={legs.map((leg) => `${leg.name} ${leg.weight}%`).join(", ")}>
        <circle cx="60" cy="60" r="43" fill="none" className="stroke-muted" strokeWidth="17" />
        {segments.map(({ leg, index, offset }) => (
            <circle
              key={`${leg.symbol}-${index}`}
              cx="60"
              cy="60"
              r="43"
              fill="none"
              pathLength="100"
              strokeWidth="17"
              strokeDasharray={`${Math.max(leg.weight - 0.8, 0)} ${100 - leg.weight + 0.8}`}
              strokeDashoffset={-offset}
              className={strokeClasses[index % strokeClasses.length]}
            />
          ))}
      </svg>
      <ul className="space-y-4">
        {legs.map((leg, index) => (
          <li key={`${leg.symbol}-${index}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
            <span aria-hidden="true" className={`size-3 rounded-sm ${swatchClasses[index % swatchClasses.length]}`} />
            <span>
              <span className="block text-sm font-bold">{leg.name}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{leg.role}</span>
            </span>
            <FormattedNumber value={leg.weight} type="percent" context="compact" className="text-sm font-bold" />
          </li>
        ))}
      </ul>
    </div>
  );
}
