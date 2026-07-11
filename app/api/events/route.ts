import { logEvent, isEventType, type AppEvent } from "@/lib/log";

// Write-only sink for CLIENT-side analytics events (chip taps, funnel steps).
// Server-side events call logEvent() directly. No GET - analysis is SQL-side.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!isEventType(body?.type)) {
      return Response.json({ error: "Unknown event type." }, { status: 400 });
    }
    await logEvent(body as AppEvent); // never throws
    return Response.json({ ok: true }, { status: 201 });
  } catch {
    // Malformed JSON etc. - logging must stay silent-cheap; still report 400.
    return Response.json({ error: "Invalid body." }, { status: 400 });
  }
}
