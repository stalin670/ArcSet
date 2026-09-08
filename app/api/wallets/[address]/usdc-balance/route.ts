import { ArcRpcUnavailableError, readArcUsdcBalance } from "@/lib/arc-server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;

  try {
    const result = await readArcUsdcBalance(address);
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ArcRpcUnavailableError) {
      return Response.json(
        { error: "Couldn’t reach Arc Testnet. Try refreshing in a moment." },
        { status: 503, headers: { "Retry-After": "3" } },
      );
    }
    return Response.json({ error: "Couldn’t load the USDC balance." }, { status: 500 });
  }
}
