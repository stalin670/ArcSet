import { getBasketMarketData } from "@/lib/basket-market-data-server";
import { getBasket } from "@/lib/baskets";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const basket = getBasket(slug);
  if (!basket) return Response.json({ error: "Basket not found." }, { status: 404 });
  if (basket.strategyType !== "asset") {
    return Response.json(
      { error: "Historical on-chain performance is unavailable for this reference basket." },
      { status: 422 },
    );
  }

  try {
    const data = await getBasketMarketData(basket);
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
    });
  } catch {
    return Response.json(
      { error: "Historical market data is temporarily unavailable." },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }
}
