import { describe, it, expect } from "vitest";
import { normalizeDraft, LIMITS } from "./agent-edit";
import type { AssistantConfig } from "./types";

const valid = (): AssistantConfig => ({
  name: "Ellie",
  firstMessage: "Hi, it's Ellie!",
  systemPrompt: "## Identity\nYou are Ellie.",
  voiceId: "Layla",
  qualificationQuestions: ["What problem are you solving?"],
  booking: true,
});

const errorsOf = (draft: AssistantConfig): string[] => {
  const r = normalizeDraft(draft);
  return r.ok ? [] : r.errors;
};

describe("normalizeDraft - happy path", () => {
  it("valid draft → ok with normalized config, voiceId + booking preserved", () => {
    const r = normalizeDraft(valid());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config).toEqual(valid());
      expect(r.config.voiceId).toBe("Layla");
      expect(r.config.booking).toBe(true);
    }
  });

  it("does not mutate the input object", () => {
    const draft = { ...valid(), name: "  Ellie  ", qualificationQuestions: ["  q? ", ""] };
    const snapshot = JSON.parse(JSON.stringify(draft));
    normalizeDraft(draft);
    expect(draft).toEqual(snapshot);
  });

  it("trims all text fields and questions", () => {
    const r = normalizeDraft({
      ...valid(),
      name: "  Ellie  ",
      firstMessage: "  hi there  ",
      systemPrompt: "  be nice  ",
      qualificationQuestions: ["  Budget?  "],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.name).toBe("Ellie");
      expect(r.config.firstMessage).toBe("hi there");
      expect(r.config.systemPrompt).toBe("be nice");
      expect(r.config.qualificationQuestions).toEqual(["Budget?"]);
    }
  });

  it("unicode/Hebrew/emoji survive normalization exactly (after trim)", () => {
    const r = normalizeDraft({ ...valid(), name: " שלום 👋 ", firstMessage: "בוקר טוב ☀️" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.name).toBe("שלום 👋");
      expect(r.config.firstMessage).toBe("בוקר טוב ☀️");
    }
  });

  it("name: newlines and whitespace runs collapse to single spaces", () => {
    const r = normalizeDraft({ ...valid(), name: "Ellie\nthe\t\tGreat" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.name).toBe("Ellie the Great");
  });

  it("questions: drops empties + whitespace-only + case-insensitive duplicates (keeps first)", () => {
    const r = normalizeDraft({
      ...valid(),
      qualificationQuestions: ["  Budget? ", "budget?", "", "  ", "\n\t", "Timeline?"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.qualificationQuestions).toEqual(["Budget?", "Timeline?"]);
  });
});

describe("normalizeDraft - empty / whitespace-only fields", () => {
  it("empty name", () => {
    expect(errorsOf({ ...valid(), name: "" })).toContain("Give your agent a name");
  });
  it("whitespace-only name and opening line count as empty", () => {
    const errs = errorsOf({ ...valid(), name: "   ", firstMessage: "\n\t" });
    expect(errs).toContain("Give your agent a name");
    expect(errs).toContain("Add an opening line");
  });
  it("empty prompt", () => {
    expect(errorsOf({ ...valid(), systemPrompt: "  " })).toContain("Describe how the agent behaves");
  });
  it("no usable questions (all empty/whitespace)", () => {
    expect(errorsOf({ ...valid(), qualificationQuestions: ["", "  "] }))
      .toContain("Add at least one qualification question");
  });
});

describe("normalizeDraft - length limits (boundaries, measured after trim)", () => {
  it("name: exactly at limit passes, limit+1 fails", () => {
    expect(normalizeDraft({ ...valid(), name: "a".repeat(LIMITS.name) }).ok).toBe(true);
    expect(errorsOf({ ...valid(), name: "a".repeat(LIMITS.name + 1) }))
      .toContain(`Name is too long (max ${LIMITS.name} characters)`);
  });
  it("padded-over-limit name passes once trimmed", () => {
    expect(normalizeDraft({ ...valid(), name: "  " + "a".repeat(LIMITS.name) + "  " }).ok).toBe(true);
  });
  it("opening line boundary", () => {
    expect(normalizeDraft({ ...valid(), firstMessage: "a".repeat(LIMITS.firstMessage) }).ok).toBe(true);
    expect(errorsOf({ ...valid(), firstMessage: "a".repeat(LIMITS.firstMessage + 1) }))
      .toContain(`Opening line is too long (max ${LIMITS.firstMessage} characters)`);
  });
  it("system prompt boundary", () => {
    expect(normalizeDraft({ ...valid(), systemPrompt: "a".repeat(LIMITS.systemPrompt) }).ok).toBe(true);
    expect(errorsOf({ ...valid(), systemPrompt: "a".repeat(LIMITS.systemPrompt + 1) }))
      .toContain(`Behavior description is too long (max ${LIMITS.systemPrompt} characters)`);
  });
  it("single question boundary, error names the question number", () => {
    const long = "a".repeat(LIMITS.question + 1);
    expect(normalizeDraft({ ...valid(), qualificationQuestions: ["ok?", "a".repeat(LIMITS.question)] }).ok).toBe(true);
    expect(errorsOf({ ...valid(), qualificationQuestions: ["ok?", long] }))
      .toContain(`Question 2 is too long (max ${LIMITS.question} characters)`);
  });
  it("question count: 10 ok, 11 fails (counted after cleanup)", () => {
    const qs = (n: number) => Array.from({ length: n }, (_, i) => `Question number ${i}?`);
    expect(normalizeDraft({ ...valid(), qualificationQuestions: qs(LIMITS.maxQuestions) }).ok).toBe(true);
    expect(errorsOf({ ...valid(), qualificationQuestions: qs(LIMITS.maxQuestions + 1) }))
      .toContain(`Too many questions (max ${LIMITS.maxQuestions}) - merge or remove some`);
    // 11 raw but 2 are dupes → 10 after cleanup → ok
    expect(normalizeDraft({ ...valid(), qualificationQuestions: [...qs(LIMITS.maxQuestions), "question number 0?"] }).ok).toBe(true);
  });
});

describe("normalizeDraft - collects ALL errors at once", () => {
  it("empty name + too-long question + empty prompt → 3 errors", () => {
    const errs = errorsOf({
      ...valid(),
      name: "",
      systemPrompt: " ",
      qualificationQuestions: ["a".repeat(LIMITS.question + 1)],
    });
    expect(errs).toHaveLength(3);
    expect(errs).toContain("Give your agent a name");
    expect(errs).toContain("Describe how the agent behaves");
    expect(errs).toContain(`Question 1 is too long (max ${LIMITS.question} characters)`);
  });
});
