import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { listUpcomingEvents, getFreeBusy, createCalendarEvent } from "@/lib/google";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Checa se Google Calendar está conectado
  const auth = await prisma.googleAuth.findFirst();
  if (!auth) {
    return NextResponse.json({ connected: false, events: [], busy: [] });
  }

  const url = new URL(req.url);
  const daysAhead = Math.min(parseInt(url.searchParams.get("days") || "90", 10) || 90, 400);

  try {
    const [events, freebusy] = await Promise.all([
      listUpcomingEvents(daysAhead),
      getFreeBusy(daysAhead),
    ]);
    return NextResponse.json({ connected: true, events, busy: freebusy.busy });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ connected: true, error: msg, events: [], busy: [] }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  try {
    const ev = await createCalendarEvent({
      summary: body.summary,
      description: body.description,
      startDateTime: body.startDateTime,
      endDateTime: body.endDateTime,
      attendees: body.attendees,
    });
    return NextResponse.json({ event: ev });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
