import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDbMock } from "@/lib/test-utils/db-mock";

const mockStart = vi.fn();
const mockLog = vi.fn();
const getAvailabilityMock = vi.fn();
vi.mock("@/lib/vapi", () => ({ startOutboundCall: (...args: unknown[]) => mockStart(...args) }));
vi.mock("@/lib/log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/log")>()),
  logEvent: (...args: unknown[]) => mockLog(...args),
}));
vi.mock("@/lib/booking", () => ({ getAvailability: (...a: unknown[]) => getAvailabilityMock(...a) }));

let mockDb: ReturnType<typeof createDbMock>;
vi.mock("@/lib/db", () => ({ db: () => mockDb.db() }));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://t/api/calls", { method: "POST", body: JSON.stringify(body) }));

// Default happy path: agent's language is "en" and availability resolves to a
// fixed placeholder text - distinct from the fail-closed sentinel so tests
// can tell "computed successfully" apart from "errored".
beforeEach(() => {
  mockStart.mockReset().mockResolvedValue("call_1");
  mockLog.mockReset().mockResolvedValue(undefined);
  mockDb = createDbMock();
  mockDb.setResult({ data: { config: { language: "en" } }, error: null });
  getAvailabilityMock.mockReset().mockResolvedValue({ text: "SLOTS_TEXT" });
});

describe("POST /api/calls", () => {
  it("400 when vapiId or leads are missing/empty", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ vapiId: "v1", leads: [] })).status).toBe(400);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("passes id, phone AND email through to startOutboundCall", async () => {
    const res = await post({ vapiId: "v1", leads: [{ id: "l1", phone: "+972501234567", email: "dana@x.com" }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [{ id: "l1", callId: "call_1", ok: true }] });
    expect(mockStart).toHaveBeenCalledWith("v1", "+972501234567", "l1", "dana@x.com", "SLOTS_TEXT");
  });

  it("email is optional - undefined still placed", async () => {
    await post({ vapiId: "v1", leads: [{ id: "l1", phone: "+972501234567" }] });
    expect(mockStart).toHaveBeenCalledWith("v1", "+972501234567", "l1", undefined, "SLOTS_TEXT");
  });

  it("passes the availability text as the 5th arg to startOutboundCall", async () => {
    getAvailabilityMock.mockResolvedValue({ text: "- Monday 09:00 (startTime: \"2026-07-13T06:00:00.000Z\")" });
    await post({ vapiId: "v1", agentId: "a1", leads: [{ id: "l1", phone: "+972501234567" }] });
    expect(mockStart).toHaveBeenCalledWith("v1", "+972501234567", "l1", undefined, expect.stringContaining("Monday 09:00"));
  });

  it("still dials with the fail-closed sentinel when availability errors", async () => {
    getAvailabilityMock.mockRejectedValue(new Error("db down"));
    const res = await post({ vapiId: "v1", agentId: "a1", leads: [{ id: "l1", phone: "+972501234567" }] });
    expect(res.status).toBe(200);
    expect(mockStart).toHaveBeenCalledWith("v1", "+972501234567", "l1", undefined, "No open times this week.");
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
      type: "error.api", actor: "system", agentId: "a1", ok: false, error: expect.stringContaining("db down"),
    }));
  });

  it("computes availability once per batch, not per lead", async () => {
    await post({ vapiId: "v1", agentId: "a1", leads: [{ id: "l1", phone: "+1" }, { id: "l2", phone: "+2" }] });
    expect(getAvailabilityMock).toHaveBeenCalledTimes(1);
  });

  it("looks up the agent's language and passes 'he' to getAvailability only when the agent is Hebrew", async () => {
    mockDb.setResult({ data: { config: { language: "he" } }, error: null });
    await post({ vapiId: "v1", agentId: "a1", leads: [{ id: "l1", phone: "+1" }] });
    expect(getAvailabilityMock).toHaveBeenCalledWith("he");
  });

  it("defaults to English when the agent has no Hebrew language set", async () => {
    await post({ vapiId: "v1", agentId: "a1", leads: [{ id: "l1", phone: "+1" }] });
    expect(getAvailabilityMock).toHaveBeenCalledWith("en");
  });

  it("logs call.started per lead - success and failure", async () => {
    mockStart.mockResolvedValueOnce("call_1").mockRejectedValueOnce(new Error("no credit"));
    await post({ vapiId: "v1", agentId: "a1", leads: [{ id: "l1", phone: "+1" }, { id: "l2", phone: "+2" }] });
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
      type: "call.started", agentId: "a1", leadId: "l1", callId: "call_1",
    }));
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
      type: "call.started", agentId: "a1", leadId: "l2", ok: false, error: "no credit",
    }));
  });

  it("partial failure: per-lead ok/error, HTTP 200", async () => {
    mockStart.mockResolvedValueOnce("call_1").mockRejectedValueOnce(new Error("no credit"));
    const res = await post({ vapiId: "v1", leads: [{ id: "l1", phone: "+1" }, { id: "l2", phone: "+2" }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [{ id: "l1", callId: "call_1", ok: true }, { id: "l2", ok: false, error: "no credit" }],
    });
  });

  it("all calls fail → 500 with the first error", async () => {
    mockStart.mockRejectedValue(new Error("no credit"));
    const res = await post({ vapiId: "v1", leads: [{ id: "l1", phone: "+1" }] });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "no credit" });
  });
});
