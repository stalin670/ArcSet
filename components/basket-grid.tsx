"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchX } from "lucide-react";
import { BasketCard } from "@/components/basket-card";
import { baskets, basketCategories, type BasketCategory } from "@/lib/baskets";

const categoryLabels: Record<BasketCategory, string> = {
  all: "All",
  income: "Income",
  balanced: "Balanced",
  bitcoin: "Bitcoin",
  fx: "FX",
  "cross-chain": "Cross-chain",
};

export function BasketGrid() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCategory = searchParams.get("category") as BasketCategory | null;
  const category = basketCategories.includes(requestedCategory ?? "all") ? (requestedCategory ?? "all") : "all";
  const filtered = useMemo(
    () => category === "all" ? baskets : baskets.filter((basket) => basket.categories.includes(category)),
    [category],
  );

  function selectCategory(next: BasketCategory) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("category");
    else params.set("category", next);
    router.replace(params.size ? `/explore?${params.toString()}` : "/explore", { scroll: false });
  }

  return (
    <>
      <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">Choose a thesis, inspect every protocol leg, and invest from your Arc wallet.</p>

      <div className="mt-8 flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Filter baskets by category">
        {basketCategories.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={category === item}
            onClick={() => selectCategory(item)}
            className={`focus-ring min-h-11 shrink-0 rounded-full px-4 text-sm font-bold transition-colors duration-100 ease-out ${category === item ? "bg-primary text-primary-foreground" : "border border-border bg-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {categoryLabels[item]}
          </button>
        ))}
      </div>

      {filtered.length ? (
        <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-live="polite">
          {filtered.map((basket) => <BasketCard key={basket.slug} basket={basket} />)}
        </div>
      ) : (
        <div className="mt-8 flex min-h-72 flex-col items-center justify-center rounded-[var(--radius-card)] border border-border bg-card p-8 text-center">
          <SearchX className="text-muted-foreground" aria-hidden="true" size={34} />
          <h2 className="mt-4 text-lg font-bold">No baskets here yet</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Try another category.</p>
          <button type="button" onClick={() => selectCategory("all")} className="focus-ring pressable mt-5 min-h-11 rounded-[var(--radius-control)] bg-secondary px-4 text-sm font-bold">Show all baskets</button>
        </div>
      )}
    </>
  );
}
