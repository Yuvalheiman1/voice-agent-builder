export type AssistantConfig = {
  name: string;
  firstMessage: string;
  systemPrompt: string;
  voiceId: string;
  qualificationQuestions: string[];
};

export type Agent = {
  id: string;
  config: AssistantConfig;
  personaId?: string; // which pre-built persona this agent was created from (for its avatar)
  vapiId?: string; // set once pushed to Vapi
  lastOutcome?: CallOutcome; // last web test-call outcome (for the "last test" line)
  createdAt: number;
};

export type LeadStatus = "new" | "calling" | "qualified" | "booked" | "no-answer" | "not-qualified";

export type Lead = {
  id: string;
  name: string;
  phone: string;
  status: LeadStatus;
  outcome?: CallOutcome; // persisted final outcome (outcome.callId set early for poll resume)
  createdAt: number;
};

// ── Call outcomes & live status ───────────────────────────────────────────────

export type OutcomeLabel = "booked" | "qualified" | "not-qualified" | "no-answer";

export type CallOutcome = {
  label: OutcomeLabel;
  booked: boolean;
  qualified: boolean;
  reason?: string;
  summary?: string;
  transcript?: string;
  endedReason?: string;
  callId?: string;
  durationSec?: number;
  at: number;
};

// Live phase of a single call. "on-call" is the "onACall" state.
export type CallPhase = "queued" | "ringing" | "on-call" | "analyzing" | "done" | "failed";

// Live status of an agent (derived at render, never persisted).
export type AgentStatus = "idle" | "on-call";
