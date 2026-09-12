"use client";

import { AlertCircle, RotateCcw } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="max-w-md rounded-[var(--radius-card)] border border-destructive/25 bg-card p-8 text-center">
        <AlertCircle className="mx-auto text-destructive" aria-hidden="true" size={34} />
        <h1 className="mt-4 text-2xl font-extrabold">Couldn’t load ArcSet</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">The catalog hit an unexpected error. Your wallet has not signed or submitted anything.</p>
        <button type="button" onClick={reset} className="focus-ring mt-6 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-secondary px-4 text-sm font-bold">
          <RotateCcw aria-hidden="true" size={16} /> Try again
        </button>
      </div>
    </main>
  );
}
