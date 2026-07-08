import type { AssistantConfig } from "./types";

export const VOICES = [
  { id: "alloy", label: "Alloy - neutral" },
  { id: "echo", label: "Echo - warm male" },
  { id: "shimmer", label: "Shimmer - bright female" },
  { id: "onyx", label: "Onyx - deep male" },
];

export function defaultConfig(): AssistantConfig {
  return {
    name: "Sales Rep",
    firstMessage: "Hi, this is Riley calling from VoiceBuilder - is now a good time for a quick chat?",
    systemPrompt:
      "You are a friendly, concise sales rep. Qualify the lead by asking the qualification questions one at a time. If they are interested and qualified, offer to book a meeting and use the book_meeting tool. Keep it natural and never pushy.",
    voiceId: "alloy",
    qualificationQuestions: [
      "What problem are you hoping to solve right now?",
      "Roughly what timeline are you working with?",
      "Are you the right person for this decision?",
    ],
  };
}

export function mergeConfig(current: AssistantConfig, patch: Partial<AssistantConfig>): AssistantConfig {
  return { ...current, ...patch };
}
