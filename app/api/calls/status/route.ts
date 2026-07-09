import { getCall } from "@/lib/vapi";

// Server-side proxy so the browser can read call outcomes without VAPI_API_KEY.
// GET /api/calls/status?ids=callId1,callId2 → { calls: [{ callId, status, ... }] }
export async function GET(req: Request) {
  const idsParam = new URL(req.url).searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
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
