// Vapi server webhook. Handles tool-calls (e.g. book_meeting) and end-of-call
// reports. Booking → Cal.com and call persistence land in a later task; for now
// this acknowledges tool calls so live calls don't error.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const type = body?.message?.type;

  if (type === "tool-calls") {
    const calls = body?.message?.toolCallList ?? [];
    const results = calls.map((c: { id: string }) => ({
      toolCallId: c.id,
      result: "Received. Booking will be confirmed by email.",
    }));
    return Response.json({ results });
  }

  // end-of-call-report and others: acknowledge.
  return Response.json({ ok: true });
}
