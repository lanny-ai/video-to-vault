import { NextResponse } from "next/server";
import { AUTH_COOKIE, AUTH_COOKIE_MAX_AGE, gateEnabled, tokenFor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const password = process.env.NIGHTMAGIC_PASSWORD;
  if (!gateEnabled(password)) {
    return NextResponse.json({ ok: true }); // no gate configured; nothing to do
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.password !== "string" || body.password !== password) {
    return NextResponse.json({ error: "That password is not right." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, await tokenFor(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: AUTH_COOKIE_MAX_AGE,
    path: "/",
  });
  return response;
}
