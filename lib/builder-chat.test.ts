import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildPrompt, sanitizeChips } from "./builder-chat";
import { getPersona, personaToConfig } from "./agents";

const ellie = getPersona("ellie")!;

describe("buildSystemPrompt", () => {
  const sp = buildSystemPrompt(ellie);

  it("embeds the persona (name, personaPrompt, tone)", () => {
    expect(sp).toContain("You are Ellie");
    expect(sp).toContain(ellie.personaPrompt);
    expect(sp).toContain(ellie.tone);
  });

  it("frames the chat as configuring, not a sales call", () => {
    expect(sp).toContain("NOT on a sales call");
    expect(sp).toContain("OPERATOR");
  });

  it("bakes in the output rules: complete config, voiceId guard, chips, empty-history intro", () => {
    expect(sp).toContain("COMPLETE updated configuration");
    expect(sp).toMatch(/Never invent or change voiceId/);
    expect(sp).toMatch(/2-4 short suggested replies/);
    expect(sp).toContain("introduce yourself");
  });

  it("instructs expert prompt-crafting and excludes auto-appended voice mechanics", () => {
    expect(sp).toContain("expert prompt engineer");
    expect(sp).toContain("appended automatically");
  });

  it("requires the structured section template (Vapi reference-prompt style)", () => {
    for (const section of [
      "## Identity & Purpose",
      "## Voice & Persona",
      "## Conversation Flow",
      "## Response Guidelines",
      "## Scenario Handling",
    ]) expect(sp).toContain(section);
  });

  it("guards semantic interpretation: leads ≠ Leeds, no verbatim casual phrasing, ask when ambiguous", () => {
    expect(sp).toMatch(/NEVER the city Leeds/);
    expect(sp).toContain("normalize obvious typos");
    expect(sp).toMatch(/Never copy the operator's casual phrasing verbatim/);
    expect(sp).toContain("ask a short clarifying question instead of guessing");
  });

  it("frames calls as outbound and firstMessage as an outbound opener", () => {
    expect(sp).toContain("OUTBOUND");
    expect(sp).toMatch(/YOU are calling THEM/);
    expect(sp).toContain(`never "thanks for reaching out"`);
  });

  it("asks for the operator's company early and forbids claiming to be from VoiceBuilder", () => {
    expect(sp).toContain("The company you represent");
    expect(sp).toMatch(/VoiceBuilder is the PLATFORM.*NOT the operator's business/);
    expect(sp).toContain(`never introduce yourself as "from VoiceBuilder"`);
    expect(sp).toContain("never invent a company");
  });

  it("caps qualification questions at 3-5 with merge-don't-append guidance", () => {
    expect(sp).toContain("keep between 3 and 5");
    expect(sp).toContain("propose merging overlapping questions");
  });

  it("defines the booking flag: default true, false only for qualify-only", () => {
    expect(sp).toContain(`"config.booking"`);
    expect(sp).toMatch(/false ONLY when the operator says qualify-only/);
    expect(sp).toContain("removed from you automatically");
  });
});

describe("buildPrompt", () => {
  const config = personaToConfig(ellie);

  it("includes the current config JSON", () => {
    expect(buildPrompt(config, [])).toContain(JSON.stringify(config, null, 2));
  });

  it("marks an empty history as the intro turn", () => {
    expect(buildPrompt(config, [])).toContain("(no messages yet");
  });

  it("renders the transcript with Operator/You roles in order", () => {
    const p = buildPrompt(config, [
      { role: "assistant", text: "Hi, I'm Ellie!" },
      { role: "user", text: "Call SaaS leads" },
    ]);
    expect(p).toContain("You: Hi, I'm Ellie!");
    expect(p).toContain("Operator: Call SaaS leads");
    expect(p.indexOf("You: Hi")).toBeLessThan(p.indexOf("Operator: Call"));
  });
});

describe("sanitizeChips", () => {
  it("trims, drops empties and case-insensitive duplicates", () => {
    expect(sanitizeChips(["  Book demos ", "", "book demos", "  ", "Just qualify"]))
      .toEqual(["Book demos", "Just qualify"]);
  });

  it("caps at 4", () => {
    expect(sanitizeChips(["a", "b", "c", "d", "e", "f"])).toEqual(["a", "b", "c", "d"]);
  });
});
