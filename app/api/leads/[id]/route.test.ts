import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDbMock, type DbMock } from "@/lib/test-utils/db-mock";

let mockDb: DbMock;
vi.mock("@/lib/db", () => ({ db: () => mockDb.db() }));

import { PATCH, DELETE } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const patchReq = (body: unknown) => new Request("http://t/api/leads/l1", { method: "PATCH", body: JSON.stringify(body) });

beforeEach(() => {
  mockDb = createDbMock();
});

describe("PATCH /api/leads/[id]", () => {
  it("updates only mapped columns and scopes by id", async () => {
    mockDb.setResult({ data: null, error: null });
    const res = await PATCH(patchReq({ status: "booked", liveCallId: "call-9" }), ctx("l1"));
    expect(await res.json()).toEqual({ ok: true });
    expect(mockDb.op("leads", "update")?.args[0]).toEqual({ status: "booked", live_call_id: "call-9" });
    expect(mockDb.op("leads", "eq")?.args).toEqual(["id", "l1"]);
  });

  it("no-ops (ok:true, no DB call) for an empty patch", async () => {
    const res = await PATCH(patchReq({}), ctx("l1"));
    expect(await res.json()).toEqual({ ok: true });
    expect(mockDb.from).not.toHaveBeenCalled();
  });

  it("maps a DB error to 500 { error }", async () => {
    mockDb.setResult({ data: null, error: { message: "boom" } });
    const res = await PATCH(patchReq({ status: "queued" }), ctx("l1"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});

describe("DELETE /api/leads/[id]", () => {
  it("deletes scoped by id", async () => {
    mockDb.setResult({ data: null, error: null });
    const res = await DELETE(new Request("http://t/api/leads/l1"), ctx("l1"));
    expect(await res.json()).toEqual({ ok: true });
    expect(mockDb.op("leads", "delete")).toBeDefined();
    expect(mockDb.op("leads", "eq")?.args).toEqual(["id", "l1"]);
  });
});
