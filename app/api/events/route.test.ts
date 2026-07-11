import { describe, it, expect, beforeEach, vi } from "vitest";

const mockLog = vi.fn();
vi.mock("@/lib/log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/log")>()),
  logEvent: (...args: unknown[]) => mockLog(...args),
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://t/api/events", { method: "POST", body: JSON.stringify(body) }));

// Block body - an expression arrow would return the mock, which vitest would
// call as a per-test cleanup callback (same trap as in assistants route.test).
beforeEach(() => {
  mockLog.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/events", () => {
  it("201 + logEvent for a vocabulary type", async () => {
    const res = await post({ type: "builder.persona_picked", sessionId: "s1", data: { personaId: "ellie" } });
    expect(res.status).toBe(201);
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ type: "builder.persona_picked", sessionId: "s1" }));
  });

  it("400 on unknown or missing type - nothing logged", async () => {
    expect((await post({ type: "made.up" })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect(mockLog).not.toHaveBeenCalled();
  });
});
