import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { listUpcomingEvents, getFreeBusy, createCalendarEvent } from "@/lib/google";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const [events, freebusy] = await Promise.all([listUpcomingEvents(90), getFreeBusy(90)]);
    return NextResponse.json({ events, busy: freebusy.busy });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg, events: [], busy: [] }, { status: 200 });
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
