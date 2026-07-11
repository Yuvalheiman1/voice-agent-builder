import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { personaToConfig, getPersona } from "@/lib/agents";

// Mock the LLM layer: generateObject returns whatever the test sets.
const mockGenerate = vi.fn();
const mockLog = vi.fn();
vi.mock("ai", () => ({ generateObject: (...args: unknown[]) => mockGenerate(...args) }));
vi.mock("@ai-sdk/openai", () => ({ openai: (id: string) => ({ modelId: id }) }));
vi.mock("@/lib/log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/log")>()),
  logEvent: (...args: unknown[]) => mockLog(...args),
}));

import { POST } from "./route";

const config = personaToConfig(getPersona("ellie")!);
const post = (body: unknown) =>
  POST(new Request("http://t/api/chat", { method: "POST", body: JSON.stringify(body) }));
const validBody = { personaId: "ellie", messages: [], config };

beforeEach(() => {
  mockGenerate.mockReset();
  mockLog.mockReset().mockResolvedValue(undefined);
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/chat - validation", () => {
  it("400 when OPENAI_API_KEY is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const res = await post(validBody);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/OPENAI_API_KEY/);
  });

  it("400 on unknown personaId", async () => {
    const res = await post({ ...validBody, personaId: "nope" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/personaId/);
  });

  it("400 when config is missing or messages is not an array", async () => {
    expect((await post({ personaId: "ellie", messages: [] })).status).toBe(400);
    expect((await post({ personaId: "ellie", messages: "hi", config })).status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat - happy path", () => {
  const llmResult = {
    object: {
      reply: "Got it - I'll call SaaS leads!",
      config: { ...config, systemPrompt: "updated" },
      chips: [" Book demos ", "book demos", "Just qualify", "More playful", "Shorter calls", "extra"],
    },
  };

  it("returns reply + updated config + sanitized chips (deduped, capped at 4)", async () => {
    mockGenerate.mockResolvedValue(llmResult);
    const res = await post({ ...validBody, messages: [{ role: "user", text: "Call SaaS leads" }] });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reply).toBe("Got it - I'll call SaaS leads!");
    expect(json.config.systemPrompt).toBe("updated");
    expect(json.chips).toEqual(["Book demos", "Just qualify", "More playful", "Shorter calls"]);
  });

  it("sends persona system prompt + transcript + config, using the default model", async () => {
    mockGenerate.mockResolvedValue(llmResult);
    await post({ ...validBody, messages: [{ role: "user", text: "Call SaaS leads" }] });
    const arg = mockGenerate.mock.calls[0][0] as { model: { modelId: string }; system: string; prompt: string };
    expect(arg.model.modelId).toBe("gpt-5.4-nano");
    expect(arg.system).toContain("You are Ellie");
    expect(arg.prompt).toContain("Operator: Call SaaS leads");
    expect(arg.prompt).toContain(JSON.stringify(config, null, 2));
  });

  it("respects the OPENAI_MODEL env override", async () => {
    vi.stubEnv("OPENAI_MODEL", "some-other-model");
    mockGenerate.mockResolvedValue(llmResult);
    await post(validBody);
    const arg = mockGenerate.mock.calls[0][0] as { model: { modelId: string } };
    expect(arg.model.modelId).toBe("some-other-model");
  });
});

describe("POST /api/chat - LLM failure", () => {
  it("maps a generateObject error to 500 { error } and logs error.api", async () => {
    mockGenerate.mockRejectedValue(new Error("model exploded"));
    const res = await post(validBody);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "model exploded" });
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ type: "error.api", ok: false, error: "model exploded" }));
  });
});

describe("POST /api/chat - analytics", () => {
  it("logs builder.turn with session, source, latency and the full config snapshot", async () => {
    mockGenerate.mockResolvedValue({
      object: { reply: "ok", config: { ...config, systemPrompt: "v2" }, chips: ["a"] },
    });
    await post({
      ...validBody,
      sessionId: "s_test", turnIndex: 2, source: "chip",
      messages: [{ role: "user", text: "Book demos" }],
    });
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
      type: "builder.turn",
      sessionId: "s_test",
      durationMs: expect.any(Number),
      promptVersion: expect.stringMatching(/^builder-v/),
      data: expect.objectContaining({
        turnIndex: 2, source: "chip", userText: "Book demos",
        config: expect.objectContaining({ systemPrompt: "v2" }),
      }),
    }));
  });
});
