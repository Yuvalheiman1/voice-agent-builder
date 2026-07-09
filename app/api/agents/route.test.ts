import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDbMock, type DbMock } from "@/lib/test-utils/db-mock";

// Lazy read of `mockDb` (name must start with "mock" for vitest's hoist guard).
let mockDb: DbMock;
vi.mock("@/lib/db", () => ({ db: () => mockDb.db() }));

import { GET, POST } from "./route";

const config = {
  name: "Vera", firstMessage: "hi", systemPrompt: "sp",
  voiceId: "Savannah", qualificationQuestions: ["budget?"],
};

const post = (body: unknown) => POST(new Request("http://t/api/agents", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  mockDb = createDbMock();
});

describe("GET /api/agents", () => {
  it("returns mapped agents with lastOutcome attached", async () => {
    mockDb.setResolver((rec) =>
      rec.table === "agents"
        ? { data: [{ id: "a1", config, persona_id: "vera", vapi_id: "v1", active: true, max_parallel: 2, created_at: "2026-07-09T00:00:00Z" }], error: null }
        : { data: [], error: null },
    );
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.agents).toHaveLength(1);
    expect(json.agents[0]).toMatchObject({ id: "a1", personaId: "vera", vapiId: "v1", active: true, maxParallel: 2 });
    expect(mockDb.chain("agents")?.ops[0]).toMatchObject({ method: "select", args: ["*"] });
    expect(mockDb.op("calls", "eq")?.args).toEqual(["type", "web"]);
  });

  it("maps a DB error to 500 { error }", async () => {
    mockDb.setResolver((rec) =>
      rec.table === "agents" ? { data: null, error: { message: "boom" } } : { data: [], error: null },
    );
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});

describe("POST /api/agents", () => {
  it("inserts snake_case row and returns 201", async () => {
    mockDb.setResult({ data: null, error: null });
    const res = await post({ id: "a1", config, personaId: "vera", vapiId: "v1", active: true, maxParallel: 2, createdAt: 1750000000000 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    const insert = mockDb.op("agents", "insert");
    expect(insert?.args[0]).toMatchObject({ id: "a1", persona_id: "vera", vapi_id: "v1", active: true, max_parallel: 2 });
    expect(insert?.args[0]).not.toHaveProperty("personaId");
  });

  it("returns 400 when id/config missing", async () => {
    const res = await post({ id: "a1" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing agent id/config" });
    expect(mockDb.op("agents", "insert")).toBeUndefined();
  });

  it("maps a DB error to 500 { error }", async () => {
    mockDb.setResult({ data: null, error: { message: "boom" } });
    const res = await post({ id: "a1", config });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});
