import { describe, it, expect, beforeEach, vi } from "vitest";

const mockUpsert = vi.fn();
vi.mock("@/lib/vapi", () => ({ upsertAssistant: (...args: unknown[]) => mockUpsert(...args) }));

import { POST } from "./route";

const config = {
  name: "Ellie", firstMessage: "hi", systemPrompt: "sp",
  voiceId: "Layla", qualificationQuestions: ["q?"], booking: true,
};

const post = (body: BodyInit) =>
  POST(new Request("http://t/api/assistants", { method: "POST", body }));
const postJson = (body: unknown) => post(JSON.stringify(body));

// Block body on purpose: an expression arrow would RETURN the mock, and vitest
// treats a function returned from a hook as a cleanup callback - it then CALLS
// the mock after each test (unhandled throw when a test installed a throwing impl).
beforeEach(() => {
  mockUpsert.mockReset().mockResolvedValue("vapi_new");
});

describe("POST /api/assistants", () => {
  it("create: no vapiId → upsertAssistant(config, undefined) → { id }", async () => {
    const res = await postJson({ config });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "vapi_new" });
    expect(mockUpsert).toHaveBeenCalledWith(config, undefined);
  });

  it("update: vapiId passed through → { id: existing }", async () => {
    mockUpsert.mockResolvedValue("v1");
    const res = await postJson({ config, vapiId: "v1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "v1" });
    expect(mockUpsert).toHaveBeenCalledWith(config, "v1");
  });

  it("500 with { error } when the Vapi push throws", async () => {
    mockUpsert.mockRejectedValue(new Error("vapi down"));
    const res = await postJson({ config });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "vapi down" });
  });
});

describe("POST /api/assistants - shape guards (nothing malformed reaches Vapi)", () => {
  it("400 when config is missing or name empty/whitespace", async () => {
    expect((await postJson({})).status).toBe(400);
    expect((await postJson({ config: { ...config, name: "" } })).status).toBe(400);
    expect((await postJson({ config: { ...config, name: "   " } })).status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("400 when config is not an object or questions is not an array", async () => {
    expect((await postJson({ config: "hi" })).status).toBe(400);
    expect((await postJson({ config: { ...config, qualificationQuestions: "budget?" } })).status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("malformed JSON body → 500 { error }, no crash", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBeTruthy();
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
