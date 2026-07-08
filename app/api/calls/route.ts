import { startOutboundCall } from "@/lib/vapi";

export async function POST(req: Request) {
  try {
    const { vapiId, leads } = await req.json();
    if (!vapiId || !Array.isArray(leads) || leads.length === 0) {
      return Response.json({ error: "Missing agent or leads" }, { status: 400 });
    }
    const results = await Promise.all(
      leads.map(async (l: { id: string; phone: string }) => {
        try {
          const callId = await startOutboundCall(vapiId, l.phone);
          return { id: l.id, callId, ok: true };
        } catch (e) {
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
