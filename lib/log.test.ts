import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDbMock, type DbMock } from "@/lib/test-utils/db-mock";

let mockDb: DbMock;
vi.mock("@/lib/db", () => ({ db: () => mockDb.db() }));

import { eventToRow, logEvent, isEventType } from "./log";

beforeEach(() => {
  mockDb = createDbMock();
  mockDb.setResult({ data: null, error: null });
});

describe("isEventType", () => {
  it("accepts vocabulary types, rejects everything else", () => {
    expect(isEventType("builder.turn")).toBe(true);
    expect(isEventType("call.settled")).toBe(true);
    expect(isEventType("agent.edited")).toBe(true);
    expect(isEventType("builder.turns")).toBe(false); // typo
    expect(isEventType("")).toBe(false);
    expect(isEventType(42)).toBe(false);
  });
});

describe("eventToRow", () => {
  it("maps camelCase to snake_case with defaults", () => {
    expect(eventToRow({ type: "builder.turn", sessionId: "s1", durationMs: 1800, data: { turnIndex: 0 } })).toEqual({
      type: "builder.turn",
      session_id: "s1",
      actor: "operator",
      agent_id: null,
      lead_id: null,
      call_id: null,
      duration_ms: 1800,
      ok: true,
      error: null,
      prompt_version: null,
      data: { turnIndex: 0 },
    });
  });

  it("carries error/ok/correlation ids", () => {
    const row = eventToRow({ type: "call.started", ok: false, error: "no credit", leadId: "l1", agentId: "a1", callId: "c1", actor: "system" });
    expect(row).toMatchObject({ ok: false, error: "no credit", lead_id: "l1", agent_id: "a1", call_id: "c1", actor: "system" });
  });
});

describe("logEvent", () => {
  it("inserts the mapped row into events", async () => {
    await logEvent({ type: "builder.created", sessionId: "s1", data: { turns: 6 } });
    const insert = mockDb.op("events", "insert");
    expect(insert?.args[0]).toMatchObject({ type: "builder.created", session_id: "s1", data: { turns: 6 } });
  });

  it("never throws - DB error is swallowed", async () => {
    mockDb.setResult({ data: null, error: { message: "boom" } });
    await expect(logEvent({ type: "builder.turn" })).resolves.toBeUndefined();
  });

  it("never throws - even when db() itself explodes", async () => {
    mockDb.setResolver(() => { throw new Error("connection dead"); });
    await expect(logEvent({ type: "builder.turn" })).resolves.toBeUndefined();
  });
});
