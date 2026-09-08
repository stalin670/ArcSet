import { readArcExecutionStatus } from "@/lib/arc-execution-server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hash: string }> },
) {
  const { hash } = await params;
  try {
    return Response.json(await readArcExecutionStatus(hash), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof TypeError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json(
      { error: "Couldn’t check this Arc transaction." },
      { status: 503, headers: { "Retry-After": "2" } },
    );
  }
}
