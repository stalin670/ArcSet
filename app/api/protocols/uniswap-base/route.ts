import { readBaseUniswapHealth } from "@/lib/base-protocol-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await readBaseUniswapHealth(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "The verified Base Sepolia Uniswap route is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "15" } });
  }
}
