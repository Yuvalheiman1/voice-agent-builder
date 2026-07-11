import type { AssistantConfig } from "./types";

// Validation + normalization for MANUAL agent edits (AgentView form).
// Pure and fully tested - the UI mirrors LIMITS via maxLength as a belt,
// but this is the source of truth (paste can bypass maxLength).

export const LIMITS = {
  name: 60,
  firstMessage: 400,
  systemPrompt: 10_000,
  question: 200,
  maxQuestions: 10,
} as const;

export type DraftResult =
  | { ok: true; config: AssistantConfig }
  | { ok: false; errors: string[] };

export function normalizeDraft(draft: AssistantConfig): DraftResult {
  // Name is a one-liner: collapse newlines/whitespace runs, then trim.
  const name = draft.name.replace(/\s+/g, " ").trim();
  const firstMessage = draft.firstMessage.trim();
  const systemPrompt = draft.systemPrompt.trim();

  // Questions: trim, drop empties, drop case-insensitive duplicates (keep first).
  const seen = new Set<string>();
  const questions: string[] = [];
  for (const raw of draft.qualificationQuestions) {
    const q = raw.trim();
    if (!q || seen.has(q.toLowerCase())) continue;
    seen.add(q.toLowerCase());
    questions.push(q);
  }

  const errors: string[] = [];
  if (!name) errors.push("Give your agent a name");
  else if (name.length > LIMITS.name) errors.push(`Name is too long (max ${LIMITS.name} characters)`);
  if (!firstMessage) errors.push("Add an opening line");
  else if (firstMessage.length > LIMITS.firstMessage) errors.push(`Opening line is too long (max ${LIMITS.firstMessage} characters)`);
  if (!systemPrompt) errors.push("Describe how the agent behaves");
  else if (systemPrompt.length > LIMITS.systemPrompt) errors.push(`Behavior description is too long (max ${LIMITS.systemPrompt} characters)`);
  if (questions.length === 0) errors.push("Add at least one qualification question");
  questions.forEach((q, i) => {
    if (q.length > LIMITS.question) errors.push(`Question ${i + 1} is too long (max ${LIMITS.question} characters)`);
  });
  if (questions.length > LIMITS.maxQuestions) errors.push(`Too many questions (max ${LIMITS.maxQuestions}) - merge or remove some`);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    config: { ...draft, name, firstMessage, systemPrompt, qualificationQuestions: questions },
  };
}
