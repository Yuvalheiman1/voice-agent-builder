import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDbMock, type DbMock } from "@/lib/test-utils/db-mock";

let mockDb: DbMock;
vi.mock("@/lib/db", () => ({ db: () => mockDb.db() }));

import { GET, POST } from "./route";

const outcome = { label: "booked", booked: true, qualified: true, at: 1750000000000 };
const post = (body: unknown) => POST(new Request("http://t/api/calls-log", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  mockDb = createDbMock();
});

describe("GET /api/calls-log", () => {
  it("returns mapped calls (latest 200)", async () => {
    mockDb.setResult({ data: [{ id: "call_1", agent_id: "a1", lead_id: null, type: "web", label: "booked", booked: true, qualified: true, created_at: "2026-07-09T00:00:00Z" }], error: null });
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.calls[0]).toMatchObject({ id: "call_1", agentId: "a1", type: "web", label: "booked" });
    expect(mockDb.op("calls", "limit")?.args).toEqual([200]);
  });

  it("maps a DB error to 500 { error }", async () => {
    mockDb.setResult({ data: null, error: { message: "boom" } });
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});

describe("POST /api/calls-log", () => {
  it("inserts a snake_case call row and returns 201 with a generated id", async () => {
    mockDb.setResult({ data: null, error: null });
    const res = await post({ outcome, agentId: "a1", leadId: "l1", type: "web" });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.id).toMatch(/^call_/);
    const insert = mockDb.op("calls", "insert");
    expect(insert?.args[0]).toMatchObject({ id: json.id, agent_id: "a1", lead_id: "l1", type: "web", label: "booked", booked: true });
  });

  it("returns 400 when outcome.label is missing", async () => {
    const res = await post({ outcome: { booked: true, qualified: true, at: 1 }, type: "web" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing outcome.label or invalid type" });
    expect(mockDb.op("calls", "insert")).toBeUndefined();
  });

  it("returns 400 for an invalid type", async () => {
    const res = await post({ outcome, type: "sms" });
    expect(res.status).toBe(400);
    expect(mockDb.op("calls", "insert")).toBeUndefined();
  });

  it("maps a DB error to 500 { error }", async () => {
    mockDb.setResult({ data: null, error: { message: "boom" } });
    const res = await post({ outcome, type: "web" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});
