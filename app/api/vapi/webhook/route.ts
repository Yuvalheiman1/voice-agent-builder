import { parseToolCall, parseEndOfCall } from "@/lib/webhook";
import { sendBookingEmail } from "@/lib/email";

// Vapi server webhook. Handles `tool-calls` (book_meeting → email the operator
// via Resend) and `end-of-call-report` (log the outcome). Always returns HTTP 200
// with Vapi's { results: [{ toolCallId, result | error }] } shape - never 500 on a
// tool error, or the live call breaks.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const type = body?.message?.type;

  if (type === "tool-calls") {
    const results = [];
    for (const c of parseToolCall(body)) {
      if (c.name === "book_meeting") {
        const r = await sendBookingEmail(c.args);
        results.push(r.ok ? { toolCallId: c.id, result: r.detail } : { toolCallId: c.id, error: r.detail });
      } else {
        results.push({ toolCallId: c.id, result: "ok" });
      }
    }
    return Response.json({ results });
  }

  if (type === "end-of-call-report") {
    const r = parseEndOfCall(body);
    const booked = /book/i.test(r.summary);
    const qualified = /qualif|interested|book/i.test(r.summary);
    console.log("end-of-call", { vapiCallId: r.vapiCallId, qualified, booked, summary: r.summary });
    return Response.json({ ok: true });
  }

  return Response.json({ ok: true });
}
