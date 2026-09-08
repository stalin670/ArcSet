import { readArcProtocolHealth } from "@/lib/arc-protocol-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const health = await readArcProtocolHealth();
    return Response.json({ status: "ok", ...health }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { status: "unavailable", error: "Arc Testnet or the verified Morpho vault could not be reached." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "3" } },
    );
  }
}
