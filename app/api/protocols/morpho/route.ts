import { readArcProtocolHealth } from "@/lib/arc-protocol-server";
import { readArcYieldIndexerSnapshot } from "@/lib/graph-yield-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const health = await readArcProtocolHealth();
    const indexer = await readArcYieldIndexerSnapshot().catch(() => ({
      configured: true,
      source: "the-graph" as const,
      unavailable: true,
      indexedBlock: null,
      indexedTimestamp: null,
      hasIndexingErrors: false,
      protocols: [],
      vaults: [],
      activity: { deposits: [], withdraws: [] },
    }));
    return Response.json({ protocol: "Morpho", network: "Arc Testnet", health, indexer }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "Couldn’t verify the Arc Testnet Morpho vault." },
      { status: 503, headers: { "Retry-After": "3" } },
    );
  }
}
