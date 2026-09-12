import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="max-w-md text-center">
        <SearchX className="mx-auto text-muted-foreground" aria-hidden="true" size={38} />
        <h1 className="mt-5 text-3xl font-extrabold tracking-[-0.035em]">Basket not found</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">This strategy may have moved, or it has not passed the Arc adapter check.</p>
        <Link href="/explore" className="focus-ring mt-6 inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-primary px-5 text-sm font-extrabold text-primary-foreground">Back to baskets</Link>
      </div>
    </main>
  );
}
