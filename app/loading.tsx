export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl px-5 py-12 md:px-8" aria-label="Loading page" aria-busy="true">
      <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      <div className="mt-6 h-96 animate-pulse rounded-[var(--radius-card)] bg-muted" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_23rem]">
        <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-muted" />
        <div className="h-80 animate-pulse rounded-[var(--radius-card)] bg-muted" />
      </div>
    </main>
  );
}
