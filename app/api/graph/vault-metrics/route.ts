import { readArcYieldIndexerSnapshot } from "@/lib/graph-yield-server";

export async function GET(request: Request) {
  const account = new URL(request.url).searchParams.get("account") ?? undefined;
  try {
    return Response.json(await readArcYieldIndexerSnapshot(account), { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } });
  } catch (error) {
    if (error instanceof TypeError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json(
      { configured: true, source: "the-graph", unavailable: true, errorMessage: "The live Graph indexer is temporarily unavailable.", indexedBlock: null, indexedTimestamp: null, hasIndexingErrors: false, protocols: [], vaults: [], activity: { deposits: [], withdraws: [] } },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
