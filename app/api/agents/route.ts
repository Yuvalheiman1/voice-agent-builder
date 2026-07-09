import { db } from "@/lib/db";
import { rowToAgent, agentToRow, attachLastTest } from "@/lib/rows";

export async function GET() {
  try {
    const [agentsRes, callsRes] = await Promise.all([
      db().from("agents").select("*").order("created_at", { ascending: false }),
      db().from("calls").select("*").eq("type", "web"),
    ]);
    if (agentsRes.error) throw new Error(agentsRes.error.message);
    if (callsRes.error) throw new Error(callsRes.error.message);
    const agents = attachLastTest(agentsRes.data.map(rowToAgent), callsRes.data);
    return Response.json({ agents });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const agent = await req.json();
    if (!agent?.id || !agent?.config) {
      return Response.json({ error: "Missing agent id/config" }, { status: 400 });
    }
    const { error } = await db().from("agents").insert(agentToRow(agent));
    if (error) throw new Error(error.message);
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
