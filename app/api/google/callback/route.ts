import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { exchangeCodeForTokens } from "@/lib/google";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.redirect(new URL("/auth", req.url));
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/app/agenda?error=no_code", req.url));
  }
  try {
    await exchangeCodeForTokens(code);
    return NextResponse.redirect(new URL("/app/agenda?connected=1", req.url));
  } catch (e) {
    const msg = e instanceof Error ? encodeURIComponent(e.message) : "error";
    return NextResponse.redirect(new URL(`/app/agenda?error=${msg}`, req.url));
  }
}
