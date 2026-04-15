import { NextResponse, type NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";

const PROTECTED = ["/app"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const token = req.cookies.get("ji_session")?.value;
  if (!token || !verifyToken(token)) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
  runtime: "nodejs",
};
