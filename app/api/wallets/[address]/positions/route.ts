import { ArcRpcUnavailableError, readArcWalletAssets } from "@/lib/arc-server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  try {
    return Response.json(await readArcWalletAssets(address), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ArcRpcUnavailableError) {
      return Response.json(
        { error: "Couldn’t reach Arc Testnet. Try again in a moment." },
        { status: 503, headers: { "Retry-After": "3" } },
      );
    }
    return Response.json({ error: "Couldn’t load Arc wallet assets." }, { status: 500 });
  }
}
