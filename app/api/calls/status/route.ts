import { getCall } from "@/lib/vapi";

// Server-side proxy so the browser can read call outcomes without VAPI_API_KEY.
// GET /api/calls/status?ids=callId1,callId2 → { calls: [{ callId, status, ... }] }
//
// SECURITY NOTE: single-tenant demo - no auth/DB, so there is no per-user
// ownership to verify (all calls belong to the one demo Vapi account). Call ids
// are unguessable Vapi UUIDs. Hardening here is proportionate: accept only
// UUID-shaped ids (don't proxy arbitrary strings to Vapi) and cap the batch.
// When auth + a DB land, add a callId→owner check before proxying. See docs/backlog.md.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 25;

export async function GET(req: Request) {
  const idsParam = new URL(req.url).searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s))
    .slice(0, MAX_IDS);
  if (ids.length === 0) return Response.json({ calls: [] });
  try {
    const calls = await Promise.all(
      ids.map(async (id) => {
        try {
          const c = await getCall(id);
          return {
            callId: id,
            status: c.status,
            endedReason: c.endedReason,
            startedAt: c.startedAt,
            endedAt: c.endedAt,
            transcript: c.transcript ?? c.artifact?.transcript,
            analysis: c.analysis,
          };
        } catch (e) {
          return { callId: id, error: (e as Error).message };
        }
      }),
    );
    return Response.json({ calls });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
