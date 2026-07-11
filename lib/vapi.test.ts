import { describe, it, expect } from "vitest";
import { composeCallPrompt } from "./vapi";
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
