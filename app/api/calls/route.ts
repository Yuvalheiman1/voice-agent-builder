import { startOutboundCall } from "@/lib/vapi";
import { logEvent } from "@/lib/log";
import { getAvailability } from "@/lib/booking";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { vapiId, agentId, leads } = await req.json();
    if (!vapiId || !Array.isArray(leads) || leads.length === 0) {
      return Response.json({ error: "Missing agent or leads" }, { status: 400 });
    }
    // One availability snapshot per batch (fail-closed for booking: on error the
    // agent gets "No open times" and won't book - but the calls still go out).
    let slotsText = "No open times this week.";
    try {
      const { data } = await db().from("agents").select("config").eq("id", agentId).maybeSingle();
      const language = data?.config?.language === "he" ? "he" : "en";
      slotsText = (await getAvailability(language)).text;
    } catch (e) {
      await logEvent({ type: "error.api", actor: "system", agentId, ok: false, error: `availability: ${(e as Error).message}` });
    }
    const results = await Promise.all(
      leads.map(async (l: { id: string; phone: string; email?: string }) => {
        try {
          const callId = await startOutboundCall(vapiId, l.phone, l.id, l.email, slotsText);
          await logEvent({
            type: "call.started", actor: "system", agentId, leadId: l.id, callId,
            data: { type: "phone", hasEmail: !!l.email },
          });
          return { id: l.id, callId, ok: true };
        } catch (e) {
          await logEvent({
            type: "call.started", actor: "system", agentId, leadId: l.id,
            ok: false, error: (e as Error).message, data: { type: "phone" },
          });
          return { id: l.id, ok: false, error: (e as Error).message };
        }
      }),
    );
    const firstError = results.find((r) => !r.ok);
    if (firstError && results.every((r) => !r.ok)) {
      return Response.json({ error: firstError.error || "All calls failed" }, { status: 500 });
    }
    return Response.json({ results });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
