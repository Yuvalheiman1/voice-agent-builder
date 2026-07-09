import type { AssistantConfig } from "./types";

// Voice registry - each voice carries its Vapi provider so the assistant payload
// picks the right one (personas default to Vapi-native / ElevenLabs voices below).
export type VoiceProvider = "openai" | "vapi" | "11labs";
export type VoiceOption = { id: string; label: string; provider: VoiceProvider };

export const VOICES: VoiceOption[] = [
  // Vapi-native voices (provider "vapi", referenced by name)
  { id: "Savannah", label: "Savannah (Vapi)", provider: "vapi" },
  { id: "Layla", label: "Layla (Vapi)", provider: "vapi" },
  { id: "Nico", label: "Nico (Vapi)", provider: "vapi" },
  // ElevenLabs voices (provider "11labs", referenced by voice id)
  { id: "cgSgspJ2msm6clMCkdW9", label: "Remi voice (ElevenLabs)", provider: "11labs" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", label: "Vince voice (ElevenLabs)", provider: "11labs" },
  // OpenAI voices (provider "openai") - still selectable
  { id: "alloy", label: "Alloy - neutral (OpenAI)", provider: "openai" },
  { id: "echo", label: "Echo - warm male (OpenAI)", provider: "openai" },
  { id: "shimmer", label: "Shimmer - bright female (OpenAI)", provider: "openai" },
  { id: "onyx", label: "Onyx - deep male (OpenAI)", provider: "openai" },
  { id: "nova", label: "Nova - clear female (OpenAI)", provider: "openai" },
  { id: "coral", label: "Coral - lively female (OpenAI)", provider: "openai" },
];

// Resolve a voiceId to the `{ provider, voiceId }` shape Vapi expects.
// Unknown ids fall back to OpenAI so custom/edited configs never break the push.
export function resolveVoice(voiceId: string): { provider: VoiceProvider; voiceId: string } {
  const v = VOICES.find((x) => x.id === voiceId);
  return v ? { provider: v.provider, voiceId: v.id } : { provider: "openai", voiceId };
}

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
