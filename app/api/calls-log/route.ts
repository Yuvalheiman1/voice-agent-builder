import { db } from "@/lib/db";
import { rowToCall, outcomeToCallRow } from "@/lib/rows";

export async function GET() {
  try {
    const { data, error } = await db().from("calls").select("*")
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return Response.json({ calls: data.map(rowToCall) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { outcome, agentId = null, leadId = null, type } = await req.json();
    if (!outcome?.label || (type !== "phone" && type !== "web")) {
      return Response.json({ error: "Missing outcome.label or invalid type" }, { status: 400 });
    }
    const id = `call_${Math.random().toString(36).slice(2, 10)}`;
    const { error } = await db().from("calls").insert(outcomeToCallRow(outcome, { id, agentId, leadId, type }));
    if (error) throw new Error(error.message);
    return Response.json({ ok: true, id }, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
