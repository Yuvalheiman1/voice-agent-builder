import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDbMock, type DbMock } from "@/lib/test-utils/db-mock";

let mockDb: DbMock;
vi.mock("@/lib/db", () => ({ db: () => mockDb.db() }));

import { PATCH, DELETE } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const patchReq = (body: unknown) => new Request("http://t/api/agents/a1", { method: "PATCH", body: JSON.stringify(body) });

beforeEach(() => {
  mockDb = createDbMock();
});

describe("PATCH /api/agents/[id]", () => {
  it("updates only mapped columns and scopes by id", async () => {
    mockDb.setResult({ data: null, error: null });
    const res = await PATCH(patchReq({ vapiId: "v2", active: true }), ctx("a1"));
    expect(await res.json()).toEqual({ ok: true });
    expect(mockDb.op("agents", "update")?.args[0]).toEqual({ vapi_id: "v2", active: true });
    expect(mockDb.op("agents", "eq")?.args).toEqual(["id", "a1"]);
  });

  it("no-ops (ok:true, no DB call) for an unknown-keys-only patch", async () => {
    const res = await PATCH(patchReq({ nope: 1 }), ctx("a1"));
    expect(await res.json()).toEqual({ ok: true });
    expect(mockDb.from).not.toHaveBeenCalled();
  });

  it("maps a DB error to 500 { error }", async () => {
    mockDb.setResult({ data: null, error: { message: "boom" } });
    const res = await PATCH(patchReq({ active: false }), ctx("a1"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});

describe("DELETE /api/agents/[id]", () => {
  it("deletes scoped by id", async () => {
    mockDb.setResult({ data: null, error: null });
    const res = await DELETE(new Request("http://t/api/agents/a1"), ctx("a1"));
    expect(await res.json()).toEqual({ ok: true });
    expect(mockDb.op("agents", "delete")).toBeDefined();
    expect(mockDb.op("agents", "eq")?.args).toEqual(["id", "a1"]);
  });
});
