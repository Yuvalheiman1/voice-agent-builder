import { db } from "@/lib/db";
import { rowToLead, leadToRow, attachOutcomes } from "@/lib/rows";

export async function GET() {
  try {
    const [leadsRes, callsRes] = await Promise.all([
      db().from("leads").select("*").order("created_at", { ascending: false }),
      db().from("calls").select("*").not("lead_id", "is", null),
    ]);
    if (leadsRes.error) throw new Error(leadsRes.error.message);
    if (callsRes.error) throw new Error(callsRes.error.message);
    const leads = attachOutcomes(leadsRes.data.map(rowToLead), callsRes.data);
    return Response.json({ leads });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [body];
    if (items.length === 0 || items.some((l: any) => !l?.id || !l?.phone)) {
      return Response.json({ error: "Each lead needs id and phone" }, { status: 400 });
    }
    // Upsert: the browser-test pseudo-lead reuses a fixed id.
    const { error } = await db().from("leads").upsert(items.map(leadToRow), { onConflict: "id" });
    if (error) throw new Error(error.message);
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
