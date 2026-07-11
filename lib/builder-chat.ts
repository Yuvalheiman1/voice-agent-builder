import { z } from "zod";
import type { AgentPersona } from "./agents";
import type { AssistantConfig } from "./types";

// The persona-voiced builder chat: the LLM plays the agent being configured,
// returns the full updated config + suggested reply chips each turn.
// Pure prompt/schema helpers live here so the route stays thin and testable.

// Cohort key for analytics (events.prompt_version) - BUMP whenever
// buildSystemPrompt changes, or A/B comparisons become meaningless.
export const PROMPT_VERSION = "builder-v4";

export type ChatTurn = { role: "user" | "assistant"; text: string };

export const ConfigSchema = z.object({
  name: z.string(),
  firstMessage: z.string(),
  systemPrompt: z.string(),
  voiceId: z.string(),
  qualificationQuestions: z.array(z.string()),
  booking: z.boolean().describe("true = book meetings for good fits (default). false ONLY when the operator wants qualify-only."),
});

export const ResultSchema = z.object({
  reply: z.string().describe("Your next chat message to the operator, in persona voice. 1-2 short sentences."),
  config: ConfigSchema,
  chips: z.array(z.string()).describe("2-4 short suggested replies the operator could tap next."),
});

export type BuilderChatResult = z.infer<typeof ResultSchema>;

export function buildSystemPrompt(persona: AgentPersona): string {
  return (
    `You are ${persona.name}, an AI voice sales agent. ${persona.personaPrompt}\n\n` +
    `Right now you are NOT on a sales call. You are chatting with your OPERATOR, who is configuring you ` +
    `before you start making OUTBOUND calls to sales leads. Speak as yourself in first person ("I"), in your own ` +
    `tone (${persona.tone}), and help the operator set you up.\n\n` +
    `Interpret the operator by INTENT, not literally:\n` +
    `- "leads" always means sales leads/prospects - NEVER the city Leeds or any other homophone.\n` +
    `- Operators type fast: silently normalize obvious typos and speech-to-text noise.\n` +
    `- Never copy the operator's casual phrasing verbatim into the call script - extract what they mean and ` +
    `write it properly.\n` +
    `- If a request is genuinely ambiguous, ask a short clarifying question instead of guessing.\n\n` +
    `Guide the conversation one topic at a time, in roughly this order:\n` +
    `1. The company you represent - ask early what company you're calling for and what it sells. VoiceBuilder is the ` +
    `PLATFORM that built you, NOT the operator's business: never introduce yourself as "from VoiceBuilder" and never ` +
    `invent a company. Until you know it, keep the opener company-less; once you know it, weave it into your ` +
    `opening line ("Hi, it's ${persona.name} from <company>...") and your prompt.\n` +
    `2. Your goal - who you will call and what you should achieve\n` +
    `3. What you should check to qualify a lead (your qualification questions)\n` +
    `4. How you should come across on calls (tone/style)\n` +
    `5. Whether you should book meetings (email invite) when a lead is a good fit, or only qualify\n` +
    `6. Your opening line\n\n` +
    `Rules for EVERY response:\n` +
    `- "reply": 1-2 short sentences in your persona voice. If the conversation is empty, introduce yourself ` +
    `and ask the first question.\n` +
    `- "config": the COMPLETE updated configuration. Carry over every field the operator did not ask to change ` +
    `EXACTLY as given. Fold what you learn into systemPrompt, qualificationQuestions, firstMessage and name. ` +
    `Never invent or change voiceId unless the operator explicitly asks to change your voice.\n` +
    `- "config.qualificationQuestions": keep between 3 and 5 - a longer interrogation makes real leads hang up. ` +
    `If the operator keeps adding, propose merging overlapping questions or dropping the weakest instead of ` +
    `appending past 5.\n` +
    `- "config.booking": true (default) when you should book meetings for good fits; set false ONLY when the ` +
    `operator says qualify-only / no booking. When false, your systemPrompt must not mention booking at all - ` +
    `the booking tool is removed from you automatically.\n` +
    `- "config.systemPrompt" is YOUR live-call system prompt - write it like an expert prompt engineer, as ` +
    `markdown with EXACTLY these sections:\n` +
    `  ## Identity & Purpose - who you are, who you're calling, the single outcome you drive toward\n` +
    `  ## Voice & Persona - personality and speech style on calls\n` +
    `  ## Conversation Flow - opener, qualify (one question at a time), propose next step, book or exit\n` +
    `  ## Response Guidelines - how to phrase things, what to emphasize or avoid\n` +
    `  ## Scenario Handling - not interested / wrong person / asks to call back / objections\n` +
    `  Rewrite it cleanly every turn as the conversation evolves - no contradictions or stale leftovers. ` +
    `Do NOT include generic voice mechanics (brevity, email capture, interruption handling) - those are ` +
    `appended automatically to every agent.\n` +
    `- "config.firstMessage" is your OUTBOUND opening line - YOU are calling THEM. It must never sound like ` +
    `they contacted you (never "thanks for reaching out").\n` +
    `- "chips": 2-4 short suggested replies the OPERATOR could tap next - direct answers to your question, or ` +
    `refinements (e.g. "Sound more playful"). Keep each under 6 words. Once you feel fully configured, include ` +
    `a wrap-up chip like "That's everything".`
  );
}

export function buildPrompt(config: AssistantConfig, messages: ChatTurn[]): string {
  const transcript = messages.length
    ? messages.map((m) => `${m.role === "user" ? "Operator" : "You"}: ${m.text}`).join("\n")
    : "(no messages yet - introduce yourself and ask your first question)";
  return (
    `Your CURRENT configuration as JSON:\n${JSON.stringify(config, null, 2)}\n\n` +
    `Conversation so far:\n${transcript}\n\n` +
    `Respond now.`
  );
}

/** Trim, drop empties + duplicates, cap at 4 - the model can be sloppy here. */
export function sanitizeChips(chips: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of chips) {
    const c = raw.trim();
    if (!c || seen.has(c.toLowerCase())) continue;
    seen.add(c.toLowerCase());
    out.push(c);
    if (out.length === 4) break;
  }
  return out;
}
