import { startOutboundCall } from "@/lib/vapi";
import { logEvent } from "@/lib/log";

export async function POST(req: Request) {
  try {
    const { vapiId, agentId, leads } = await req.json();
    if (!vapiId || !Array.isArray(leads) || leads.length === 0) {
      return Response.json({ error: "Missing agent or leads" }, { status: 400 });
    }
    const results = await Promise.all(
      leads.map(async (l: { id: string; phone: string; email?: string }) => {
        try {
          const callId = await startOutboundCall(vapiId, l.phone, l.id, l.email);
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
