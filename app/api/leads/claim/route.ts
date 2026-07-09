import { db } from "@/lib/db";
import { rowToLead } from "@/lib/rows";

// Atomic claim: the conditional UPDATE (`eq status queued`) is the arbiter - // if two claimers race for the same lead, exactly one update matches; the
// loser retries with the next-oldest lead.
const MAX_ATTEMPTS = 3;

export async function POST(req: Request) {
  try {
    const { agentId } = await req.json();
    if (!agentId) return Response.json({ error: "Missing agentId" }, { status: 400 });

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const oldest = await db()
        .from("leads").select("*")
        .eq("status", "queued")
        .order("queued_at", { ascending: true })
        .limit(1);
      if (oldest.error) throw new Error(oldest.error.message);
      const row = oldest.data?.[0];
      if (!row) return Response.json({ error: "No queued leads" }, { status: 404 });

      const claimed = await db()
        .from("leads")
        .update({ status: "calling", claimed_by: agentId, queued_at: null })
        .eq("id", row.id)
        .eq("status", "queued")
        .select();
      if (claimed.error) throw new Error(claimed.error.message);
      if (claimed.data && claimed.data.length > 0) {
        return Response.json({ lead: rowToLead(claimed.data[0]) });
      }
      // lost the race - loop to the next-oldest
    }
    return Response.json({ error: "No queued leads" }, { status: 404 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
