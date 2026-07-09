import type { AssistantConfig } from "./types";

// The scripted "leading questions" the chat builder walks through. The persona
// already seeds a complete config; these chips REFINE it with deterministic patches.
export type ChipKind = "goal" | "qualify" | "tone" | "booking";
export type Chip = { id: string; label: string; kind: ChipKind };
export type FlowStep = { key: ChipKind; ask: (name: string) => string; chips: Chip[]; multi?: boolean };

const GOAL: Chip[] = [
  { id: "goal-qualify", label: "Qualify inbound leads", kind: "goal" },
  { id: "goal-demos", label: "Book product demos", kind: "goal" },
  { id: "goal-trials", label: "Follow up with free trials", kind: "goal" },
];
const QUALIFY: Chip[] = [
  { id: "q-budget", label: "Budget", kind: "qualify" },
  { id: "q-timeline", label: "Timeline", kind: "qualify" },
  { id: "q-dm", label: "Decision maker", kind: "qualify" },
  { id: "q-team", label: "Team size", kind: "qualify" },
];
const TONE: Chip[] = [
  { id: "tone-warm", label: "Warm & casual", kind: "tone" },
  { id: "tone-pro", label: "Professional", kind: "tone" },
  { id: "tone-energetic", label: "Energetic", kind: "tone" },
];
const BOOKING: Chip[] = [
  { id: "book-yes", label: "Email an invite", kind: "booking" },
  { id: "book-no", label: "Just qualify", kind: "booking" },
];

export const FLOW: FlowStep[] = [
  { key: "goal", ask: (n) => `In a sentence - who is ${n} calling, and what should they achieve?`, chips: GOAL },
  { key: "qualify", ask: (n) => `What should ${n} check to qualify a lead? Tap all that apply, then Done.`, chips: QUALIFY, multi: true },
  { key: "tone", ask: (n) => `How should ${n} come across on the call?`, chips: TONE },
  { key: "booking", ask: (n) => `When a lead's a good fit, should ${n} email a meeting invite?`, chips: BOOKING },
];

const GOAL_TEXT: Record<string, string> = {
  "goal-qualify": "Your goal is to qualify inbound leads.",
  "goal-demos": "Your goal is to book product demos.",
  "goal-trials": "Your goal is to follow up with free-trial users.",
};
const QUALIFY_Q: Record<string, string> = {
  "q-budget": "What budget do you have in mind?",
  "q-timeline": "What timeline are you working with?",
  "q-dm": "Are you the right person for this decision?",
  "q-team": "How big is your team?",
};
const TONE_TEXT: Record<string, string> = {
  "tone-warm": "Keep a warm, casual tone.",
  "tone-pro": "Keep a polished, professional tone.",
  "tone-energetic": "Keep an upbeat, energetic tone.",
};
const BOOK_NO = "Do not book a meeting - only qualify the lead.";

function ensureSentence(prompt: string, sentence: string): string {
  if (!sentence) return prompt;
  return prompt.includes(sentence) ? prompt : `${prompt.trim()} ${sentence}`;
}
function removeSentence(prompt: string, sentence: string): string {
  return prompt.replace(` ${sentence}`, "").replace(sentence, "").trim();
}

// Apply one tapped chip to the config. Idempotent - re-tapping doesn't duplicate.
export function applyChip(config: AssistantConfig, chip: Chip): AssistantConfig {
  switch (chip.kind) {
    case "goal":
      return { ...config, systemPrompt: ensureSentence(config.systemPrompt, GOAL_TEXT[chip.id] ?? "") };
    case "qualify": {
      const q = QUALIFY_Q[chip.id];
      if (!q || config.qualificationQuestions.includes(q)) return config;
      return { ...config, qualificationQuestions: [...config.qualificationQuestions, q] };
    }
    case "tone": {
      let p = config.systemPrompt;
      for (const s of Object.values(TONE_TEXT)) p = removeSentence(p, s);
      return { ...config, systemPrompt: ensureSentence(p, TONE_TEXT[chip.id] ?? "") };
    }
    case "booking":
      return chip.id === "book-no"
        ? { ...config, systemPrompt: ensureSentence(config.systemPrompt, BOOK_NO) }
        : { ...config, systemPrompt: removeSentence(config.systemPrompt, BOOK_NO) };
    default:
      return config;
  }
}
