import { db } from "./db";

// Event logging for user-behavior analysis (events table). One row per action:
// who did what, to which entities, did it work, how long, + JSONB payload.
// Fire-and-forget by design: a failed log line must NEVER break the product,
// so logEvent swallows every error (console only) - deliberate exception to
// the explicit-error rule.

// Controlled vocabulary - a typo'd type would silently vanish from every query.
export const EVENT_TYPES = [
  "builder.persona_picked",
  "builder.turn",
  "builder.created",
  "builder.abandoned",
  "agent.pushed",
  "agent.edited",
  "agent.deleted",
  "agent.activated",
  "agent.deactivated",
  "lead.added",
  "queue.added",
  "queue.removed",
  "call.started",
  "call.settled",
  "webhook.booking",
  "error.api",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type AppEvent = {
  type: EventType;
  sessionId?: string;
  actor?: "operator" | "system" | "webhook" | "dialer";
  agentId?: string;
  leadId?: string;
  callId?: string;
  durationMs?: number;
  ok?: boolean;
  error?: string;
  promptVersion?: string;
  data?: Record<string, unknown>;
};

export function isEventType(t: unknown): t is EventType {
  return typeof t === "string" && (EVENT_TYPES as readonly string[]).includes(t);
}

// Pure camelCase → snake_case row mapper (undefined → null for Postgres).
export function eventToRow(e: AppEvent): Record<string, unknown> {
  return {
    type: e.type,
    session_id: e.sessionId ?? null,
    actor: e.actor ?? "operator",
    agent_id: e.agentId ?? null,
    lead_id: e.leadId ?? null,
    call_id: e.callId ?? null,
    duration_ms: e.durationMs ?? null,
    ok: e.ok ?? true,
    error: e.error ?? null,
    prompt_version: e.promptVersion ?? null,
    data: e.data ?? null,
  };
}

export async function logEvent(e: AppEvent): Promise<void> {
  try {
    const { error } = await db().from("events").insert(eventToRow(e));
    if (error) console.error("logEvent insert failed", e.type, error.message);
  } catch (err) {
    console.error("logEvent failed", e.type, (err as Error).message);
  }
}
