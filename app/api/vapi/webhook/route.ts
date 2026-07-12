import { parseToolCall, parseEndOfCall, extractCallMeta } from "@/lib/webhook";
import { sendBookingEmail, isEmailUnconfirmed } from "@/lib/email";
import { sendFollowUpSms } from "@/lib/sms";
import { logEvent } from "@/lib/log";
import { db } from "@/lib/db";
import { bookSlot } from "@/lib/booking";

// Vapi server webhook. Handles `tool-calls` (book_meeting → email the operator
// via Resend) and `end-of-call-report` (log the outcome). Always returns HTTP 200
// with Vapi's { results: [{ toolCallId, result | error }] } shape - never 500 on a
// tool error, or the live call breaks.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const type = body?.message?.type;

  if (type === "tool-calls") {
    const { leadId, phone } = extractCallMeta(body);
    const results = [];
    for (const c of parseToolCall(body)) {
      if (c.name === "book_meeting") {
        const callId = body?.message?.call?.id;
        // Best-effort linkage: map the Vapi assistant back to our agent row.
        let agentId: string | undefined;
        try {
          const vapiAssistantId = body?.message?.call?.assistantId;
          if (vapiAssistantId) {
            const { data } = await db().from("agents").select("id").eq("vapi_id", vapiAssistantId).maybeSingle();
            agentId = data?.id ?? undefined;
          }
        } catch { /* linkage only - booking works without it */ }

        // Slot first (atomic guard), email second: the email is a notification,
        // its failure must never un-book a secured slot.
        const booked = await bookSlot({
          name: c.args?.name, email: c.args?.email, startTime: c.args?.startTime,
          leadPhone: phone, agentId, callId,
        });
        if (!booked.ok) {
          results.push({ toolCallId: c.id, result: booked.sayToLead });
          await logEvent({
            type: "meeting.conflict", actor: "webhook", leadId, agentId, callId,
            ok: false, error: booked.kind, data: { startTime: c.args?.startTime ?? null },
          });
          continue;
        }

        const unconfirmed = isEmailUnconfirmed(c.args?.email);
        const r = await sendBookingEmail({ ...c.args, ...(unconfirmed && phone ? { phone } : {}) });
        results.push({
          toolCallId: c.id,
          result: `Booked ${booked.startISO}. ${r.ok ? r.detail : "(operator email failed - logged)"}`,
        });
        if (r.ok && unconfirmed && phone) {
          // The agent promised the lead a text - placeholder until SMS ships (backlog).
          await sendFollowUpSms(phone, `Booked without email: ${c.args?.name ?? "lead"} at ${booked.startISO}`);
        }
        await logEvent({
          type: "meeting.booked", actor: "webhook", leadId, agentId, callId,
          data: { startISO: booked.startISO, emailOk: r.ok, emailConfirmed: !unconfirmed },
        });
        await logEvent({
          type: "webhook.booking", actor: "webhook", leadId, callId,
          ok: r.ok, ...(r.ok ? {} : { error: r.detail }),
          data: { emailConfirmed: !unconfirmed, smsFallback: r.ok && unconfirmed && !!phone },
        });
        // Best-effort: remember the email the lead stated on the call ("unknown" is not an email).
        if (r.ok && leadId && !unconfirmed && typeof c.args?.email === "string") {
          try {
            await db().from("leads").update({ email: c.args.email }).eq("id", leadId);
          } catch (e) {
            console.error("lead email update failed", (e as Error).message);
          }
        }
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
