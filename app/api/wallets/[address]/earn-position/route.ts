import { readArcEarnPosition } from "@/lib/arc-earn-server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  try {
    return Response.json(await readArcEarnPosition(address), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: "Couldn’t load the Arc earn position." },
      { status: 503, headers: { "Retry-After": "3" } },
    );
  }
}
