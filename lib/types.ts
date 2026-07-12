export type AssistantConfig = {
  name: string;
  firstMessage: string;
  systemPrompt: string;
  voiceId: string;
  qualificationQuestions: string[];
  booking?: boolean; // false = qualify-only: no book_meeting tool, no email protocol (default true)
  language?: "en" | "he"; // agent call language (default "en"); drives transcriber/prompt/voice rules at push time
};

export type Agent = {
  id: string;
  config: AssistantConfig;
  personaId?: string; // which pre-built persona this agent was created from (for its avatar)
  active?: boolean;      // dialer activation toggle (DB-backed)
  maxParallel?: number;  // max simultaneous calls (DB-backed, default 1)
  vapiId?: string; // set once pushed to Vapi
  lastOutcome?: CallOutcome; // DERIVED from calls table (latest type='web' row) - set by GET /api/agents, never written
  createdAt: number;
};

export type LeadStatus = "new" | "queued" | "calling" | "qualified" | "booked" | "no-answer" | "not-qualified";

export type Lead = {
  id: string;
  name: string;
  phone: string;
  email?: string;        // captured at import or by book_meeting on a call
  status: LeadStatus;
  queuedAt?: number;     // FIFO key while status='queued'
  claimedBy?: string;    // agent id while status='calling'
  liveCallId?: string;   // in-flight Vapi call id (crash/reload recovery)
  outcome?: CallOutcome; // DERIVED from calls table (latest row for this lead) - set by GET /api/leads, never written
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

// ── Booking / schedule ────────────────────────────────────────────────────────

export type Meeting = {
  id: string;
  startTs: string;      // UTC ISO instant (unique - the double-booking guard)
  leadName: string;
  leadEmail?: string;
  leadPhone?: string;
  agentId?: string;
  callId?: string;
  createdAt: number;
};
