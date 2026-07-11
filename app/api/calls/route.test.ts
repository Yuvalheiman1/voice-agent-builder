import { describe, it, expect, beforeEach, vi } from "vitest";

const mockStart = vi.fn();
const mockLog = vi.fn();
vi.mock("@/lib/vapi", () => ({ startOutboundCall: (...args: unknown[]) => mockStart(...args) }));
vi.mock("@/lib/log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/log")>()),
  logEvent: (...args: unknown[]) => mockLog(...args),
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://t/api/calls", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  mockStart.mockReset().mockResolvedValue("call_1");
  mockLog.mockReset().mockResolvedValue(undefined);
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
    expect(mockStart).toHaveBeenCalledWith("v1", "+972501234567", "l1", "dana@x.com");
  });

  it("email is optional - undefined still placed", async () => {
    await post({ vapiId: "v1", leads: [{ id: "l1", phone: "+972501234567" }] });
    expect(mockStart).toHaveBeenCalledWith("v1", "+972501234567", "l1", undefined);
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
