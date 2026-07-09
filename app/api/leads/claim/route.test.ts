import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDbMock } from "@/lib/test-utils/db-mock";

let mockDb: ReturnType<typeof createDbMock>;
vi.mock("@/lib/db", () => ({ db: () => mockDb.db() }));

// The claim route issues TWO queries per attempt:
//   1) select oldest queued:  from("leads").select("*").eq("status","queued").order("queued_at",{ascending:true}).limit(1)
//   2) conditional update:    from("leads").update({...}).eq("id",<id>).eq("status","queued").select()
// createDbMock's resolver receives (rec, n) where n is the 0-based query index,
// so we return per-call results in sequence; mockDb.calls() records every op.

import { POST } from "./route";

const req = (body: unknown) =>
  new Request("http://x/api/leads/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const queuedRow = {
  id: "lead_1", name: "Dana", phone: "+972501111111", email: null, status: "queued",
  queued_at: "2026-07-09T10:00:00Z", claimed_by: null, live_call_id: null,
  created_at: "2026-07-09T09:00:00Z",
};
const claimedRow = { ...queuedRow, status: "calling", queued_at: null, claimed_by: "agent_1" };

beforeEach(() => { mockDb = createDbMock(); });

describe("POST /api/leads/claim", () => {
  it("claims the oldest queued lead", async () => {
    mockDb.setResolver((_rec, n) =>
      n === 0 ? { data: [queuedRow], error: null } : { data: [claimedRow], error: null });
    const res = await POST(req({ agentId: "agent_1" }));
    expect(res.status).toBe(200);
    const { lead } = await res.json();
    expect(lead).toMatchObject({ id: "lead_1", status: "calling", claimedBy: "agent_1" });
    // update payload was the claim patch
    const update = mockDb.calls().find((c) => c.method === "update");
    expect(update?.args[0]).toMatchObject({ status: "calling", claimed_by: "agent_1", queued_at: null });
  });
  it("404s when the queue is empty", async () => {
    mockDb.setResolver(() => ({ data: [], error: null }));
    const res = await POST(req({ agentId: "agent_1" }));
    expect(res.status).toBe(404);
  });
  it("retries once when the conditional update loses the race, then claims", async () => {
    // seq: select→row, update→[] (lost race), select→row, update→[claimed]
    const seq = [
      { data: [queuedRow], error: null },
      { data: [], error: null },
      { data: [queuedRow], error: null },
      { data: [claimedRow], error: null },
    ];
    mockDb.setResolver((_rec, n) => seq[Math.min(n, seq.length - 1)]);
    const res = await POST(req({ agentId: "agent_1" }));
    expect(res.status).toBe(200);
  });
  it("400s without agentId", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
  it("500s on DB error", async () => {
    mockDb.setResolver(() => ({ data: null, error: { message: "boom" } }));
    const res = await POST(req({ agentId: "agent_1" }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("boom");
  });
});
