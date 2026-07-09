import { describe, it, expect } from "vitest";
import { FLOW, applyChip, type Chip } from "./builder-flow";
import { personaToConfig, getPersona } from "./agents";

const base = () => personaToConfig(getPersona("ellie")!);
const chip = (id: string, kind: Chip["kind"]): Chip => ({ id, label: id, kind });

describe("FLOW", () => {
  it("has goal→qualify→tone→booking, qualify multi", () => {
    expect(FLOW.map((s) => s.key)).toEqual(["goal", "qualify", "tone", "booking"]);
    expect(FLOW.find((s) => s.key === "qualify")!.multi).toBe(true);
  });
});

describe("applyChip", () => {
  it("goal appends once (idempotent)", () => {
    const c1 = applyChip(base(), chip("goal-demos", "goal"));
    const c2 = applyChip(c1, chip("goal-demos", "goal"));
    expect(c1.systemPrompt).toContain("book product demos");
    expect(c2.systemPrompt).toBe(c1.systemPrompt);
  });
  it("qualify adds + dedups the mapped question", () => {
    const c1 = applyChip(base(), chip("q-budget", "qualify"));
    const c2 = applyChip(c1, chip("q-budget", "qualify"));
    expect(c1.qualificationQuestions.filter((q) => /budget/i.test(q)).length).toBe(1);
    expect(c2.qualificationQuestions).toEqual(c1.qualificationQuestions);
  });
  it("tone replaces a prior tone (no stacking)", () => {
    const c1 = applyChip(base(), chip("tone-warm", "tone"));
    const c2 = applyChip(c1, chip("tone-pro", "tone"));
    expect(c2.systemPrompt).toContain("professional");
    expect(c2.systemPrompt).not.toContain("warm, casual");
  });
  it("booking 'just qualify' adds then 'email invite' removes the instruction", () => {
    const c1 = applyChip(base(), chip("book-no", "booking"));
    expect(c1.systemPrompt).toContain("only qualify");
    const c2 = applyChip(c1, chip("book-yes", "booking"));
    expect(c2.systemPrompt).not.toContain("only qualify");
  });
});
