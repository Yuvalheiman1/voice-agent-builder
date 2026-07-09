import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDbMock, type DbMock } from "@/lib/test-utils/db-mock";

let mockDb: DbMock;
vi.mock("@/lib/db", () => ({ db: () => mockDb.db() }));

import { GET, POST } from "./route";

const lead = (over: Record<string, unknown> = {}) => ({ id: "l1", name: "Dana", phone: "+972501234567", status: "new", createdAt: 1750000000000, ...over });
const post = (body: unknown) => POST(new Request("http://t/api/leads", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  mockDb = createDbMock();
});

describe("GET /api/leads", () => {
  it("returns mapped leads with outcomes", async () => {
    mockDb.setResolver((rec) =>
      rec.table === "leads"
        ? { data: [{ id: "l1", name: "Dana", phone: "1", status: "new", created_at: "2026-07-09T00:00:00Z" }], error: null }
        : { data: [], error: null },
    );
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.leads[0]).toMatchObject({ id: "l1", name: "Dana", phone: "1" });
    expect(mockDb.op("calls", "not")?.args).toEqual(["lead_id", "is", null]);
  });

  it("maps a DB error to 500 { error }", async () => {
    mockDb.setResolver((rec) =>
      rec.table === "leads" ? { data: null, error: { message: "boom" } } : { data: [], error: null },
    );
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});

describe("POST /api/leads", () => {
  it("upserts a single lead (onConflict id) as snake_case and returns 201", async () => {
    mockDb.setResult({ data: null, error: null });
    const res = await post(lead({ email: "d@x.com" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    const upsert = mockDb.op("leads", "upsert");
    expect(upsert?.args[0]).toEqual([expect.objectContaining({ id: "l1", phone: "+972501234567", email: "d@x.com" })]);
    expect(upsert?.args[1]).toEqual({ onConflict: "id" });
  });

  it("upserts a batch from { items: [...] }", async () => {
    mockDb.setResult({ data: null, error: null });
    await post({ items: [lead({ id: "l1" }), lead({ id: "l2" })] });
    expect((mockDb.op("leads", "upsert")?.args[0] as unknown[]).length).toBe(2);
  });

  it("returns 400 for empty items", async () => {
    const res = await post({ items: [] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Each lead needs id and phone" });
    expect(mockDb.op("leads", "upsert")).toBeUndefined();
  });

  it("returns 400 when an item is missing phone", async () => {
    const res = await post({ items: [lead({ phone: undefined })] });
    expect(res.status).toBe(400);
    expect(mockDb.op("leads", "upsert")).toBeUndefined();
  });

  it("maps a DB error to 500 { error }", async () => {
    mockDb.setResult({ data: null, error: { message: "boom" } });
    const res = await post(lead());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});
