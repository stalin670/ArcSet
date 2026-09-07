import { cookies } from "next/headers";
import {
  CIRCLE_WALLET_SESSION_COOKIE,
  decodeCircleSessionCredential,
  encodeCircleSessionCredential,
  isCircleSessionCredential,
} from "@/lib/circle-wallet-session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function GET() {
  const cookieStore = await cookies();
  const credential = decodeCircleSessionCredential(
    cookieStore.get(CIRCLE_WALLET_SESSION_COOKIE)?.value,
  );
  return Response.json({ credential }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { error: "The Circle passkey session is invalid." },
      { status: 400 },
    );
  }
  const credential = (payload as { credential?: unknown } | null)?.credential;
  if (!isCircleSessionCredential(credential)) {
    return Response.json(
      { error: "The Circle passkey session is invalid." },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: CIRCLE_WALLET_SESSION_COOKIE,
    value: encodeCircleSessionCredential(credential),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    priority: "high",
  });
  return Response.json({ ok: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: CIRCLE_WALLET_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return Response.json({ ok: true });
}
