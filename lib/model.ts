// Single source of truth for the OpenAI model name, used by both the builder
// chat (/api/chat) and the Vapi assistant push (lib/vapi.ts). Set OPENAI_MODEL
// in .env.local / Vercel; existing Vapi agents pick a change up on re-save.
export function openaiModel(): string {
  return process.env.OPENAI_MODEL || "gpt-5.4-nano";
}
