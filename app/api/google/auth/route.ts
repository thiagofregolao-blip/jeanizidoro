import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getAuthUrl } from "@/lib/google";

export async function GET() {
  try {
    await requireSession();
    const url = getAuthUrl();
    return NextResponse.redirect(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
