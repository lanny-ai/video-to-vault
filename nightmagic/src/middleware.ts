import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, gateEnabled, isAuthed } from "@/lib/auth";

/**
 * The deployment gate. With NIGHTMAGIC_PASSWORD set, every page and API route
 * requires the auth cookie; without it (local dev), everything passes through.
 */
export async function middleware(request: NextRequest) {
  const password = process.env.NIGHTMAGIC_PASSWORD;
  if (!gateEnabled(password)) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  if (await isAuthed(password, cookie)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
