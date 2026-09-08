import { getArcAssetPrices } from "@/lib/asset-prices-server";

export async function GET() {
  try {
    return Response.json(await getArcAssetPrices(), {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" },
    });
  } catch {
    return Response.json(
      { error: "Couldn’t load current Arc asset prices." },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }
}
