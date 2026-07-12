import { db } from "@/lib/db";
import { rowToMeeting } from "@/lib/rows";

// Week view data: upcoming meetings (plus the last day, so a just-finished
// meeting doesn't vanish mid-demo), ascending.
export async function GET() {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db().from("meetings").select("*").gte("start_ts", since).order("start_ts", { ascending: true });
    if (error) throw new Error(error.message);
    return Response.json({ meetings: (data ?? []).map(rowToMeeting) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
