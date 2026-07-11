import { describe, it, expect } from "vitest";
import { composeCallPrompt, toVapiAssistant } from "./vapi";
import type { AssistantConfig } from "./types";

const base: AssistantConfig = {
  name: "Theo",
  firstMessage: "hi",
  systemPrompt: "## Identity & Purpose\nDiscovery only.",
  voiceId: "Nico",
  qualificationQuestions: ["What problem are you solving?", "Team size?"],
};

describe("composeCallPrompt", () => {
  it("booking agent (default): core rules + email protocol + booking date line + questions", () => {
    const p = composeCallPrompt({ ...base, booking: true }, "2026-07-10");
    expect(p).toContain("## Identity & Purpose");
    expect(p).toContain("spoken phone call");
    expect(p).toContain('{{leadEmail}}');
    expect(p).toContain("after 2 failed correction attempts");
    expect(p).toContain("before calling book_meeting");
    expect(p).toContain("Today's date is 2026-07-10. When booking a meeting");
    expect(p).toContain("- What problem are you solving?");
  });

  it("booking undefined (pre-flag agents) behaves as booking", () => {
    expect(composeCallPrompt(base, "2026-07-10")).toContain("{{leadEmail}}");
  });

  it("qualify-only agent: NO email protocol, NO booking mentions, date still injected", () => {
    const p = composeCallPrompt({ ...base, booking: false }, "2026-07-10");
    expect(p).not.toContain("{{leadEmail}}");
    expect(p).not.toContain("book_meeting");
    expect(p).not.toMatch(/booking/i);
    expect(p).toContain("Today's date is 2026-07-10.");
    expect(p).toContain("spoken phone call");
    expect(p).toContain("- Team size?");
  });
});

const heCfg: AssistantConfig = {
  name: "מיה",
  firstMessage: "שלום!",
  systemPrompt: "You are Maya.",
  voiceId: "nova",
  qualificationQuestions: ["What problem are you solving?"],
  booking: true,
  language: "he" as const,
};
const enCfg: AssistantConfig = { ...heCfg, name: "Ellie", language: "en" as const };

describe("hebrew agents (push-time seam)", () => {
  it("hebrew prompt carries the hebrew-only rule and hebrew booking protocol", () => {
    const p = composeCallPrompt(heCfg, "2026-07-11");
    expect(p).toMatch(/עברית בלבד/);
    expect(p).toMatch(/נשלח לך הודעת טקסט/); // SMS fallback line
    expect(p).not.toMatch(/Read it back ONCE in two parts/); // English spell-back protocol absent
    expect(p).toMatch(/ask them in natural, native Hebrew/i); // questions-may-be-English instruction
  });
  it("hebrew payload sets transcriber + vapi endpointing; english payload has neither", () => {
    const he = toVapiAssistant(heCfg);
    expect(he.transcriber).toEqual({ provider: "deepgram", model: "nova-3", language: "he" });
    expect(he.startSpeakingPlan).toEqual({ smartEndpointingPlan: { provider: "vapi" } });
    const en = toVapiAssistant(enCfg);
    expect(en.transcriber).toBeUndefined();
    expect(en.startSpeakingPlan).toBeUndefined();
  });
  it("REGRESSION: english compose output is unchanged by the language field", () => {
    const { language: _l, ...legacy } = enCfg;
    expect(composeCallPrompt(enCfg, "2026-07-11")).toBe(composeCallPrompt(legacy as any, "2026-07-11"));
  });
});
