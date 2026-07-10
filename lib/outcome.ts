import type { CallOutcome, CallPhase, OutcomeLabel } from "./types";

// Minimal shape we read off a Vapi Call (server SDK) - kept local so tests don't
// depend on the SDK types.
export type VapiCallLike = {
  id?: string;
  status?: string;
  endedReason?: string;
  startedAt?: string;
  endedAt?: string;
  transcript?: string;
  artifact?: { transcript?: string };
  analysis?: {
    summary?: string;
    structuredData?: { qualified?: boolean; booked?: boolean; reason?: string } & Record<string, unknown>;
    successEvaluation?: string;
  };
};

export type WebMessage = { type?: string; [k: string]: any };

// endedReasons that mean the call never had a real conversation.
export const NO_ANSWER_REASONS = new Set([
  "customer-did-not-answer",
  "customer-busy",
  "customer-did-not-give-microphone-permission",
]);

function didNotConnect(endedReason?: string): boolean {
  if (!endedReason) return false;
  if (NO_ANSWER_REASONS.has(endedReason)) return true;
  // call.start.error-* = the call died before ringing (e.g. Twilio refused the
  // number) - nobody was reached, so it's a no-answer; reason stays visible.
  return /no-answer|voicemail|did-not-answer|busy/.test(endedReason) || /^call\.start\.error/.test(endedReason);
}

export function callPhase(call: VapiCallLike): CallPhase {
  switch (call.status) {
    case "queued":
    case "scheduled":
      return "queued";
    case "ringing":
      return "ringing";
    case "in-progress":
    case "forwarding":
      return "on-call";
    case "ended":
      return call.analysis ? "done" : "analyzing";
    default:
      return "failed";
  }
}

function durationSec(call: VapiCallLike): number | undefined {
  if (!call.startedAt || !call.endedAt) return undefined;
  const ms = Date.parse(call.endedAt) - Date.parse(call.startedAt);
  return Number.isFinite(ms) ? Math.round(ms / 1000) : undefined;
}

// Single source of truth for the outcome label priority. Shared by the lead path
// (classifyOutcome) and the web path (CallPanel finalize) so they never drift.
export function labelFrom(booked: boolean, qualified: boolean, endedReason?: string): OutcomeLabel {
  if (didNotConnect(endedReason)) return "no-answer";
  if (booked) return "booked";
  if (qualified) return "qualified";
  return "not-qualified";
}

export function classifyOutcome(call: VapiCallLike): CallOutcome {
  const sd = call.analysis?.structuredData ?? {};
  const booked = Boolean((sd as any).booked);
  const qualified = Boolean((sd as any).qualified);
  return {
    label: labelFrom(booked, qualified, call.endedReason),
    booked,
    qualified,
    reason: (sd as any).reason,
    summary: call.analysis?.summary,
    transcript: call.transcript ?? call.artifact?.transcript,
    endedReason: call.endedReason,
    callId: call.id,
    durationSec: durationSec(call),
    at: Date.now(),
  };
}

// Decide what the poller should do with an in-flight call this tick. Pure so it
// can be unit-tested - this is where "booked" must never be clobbered by a timeout.
export type PollDecision =
  | { kind: "waiting"; phase: CallPhase }
  | { kind: "settle"; phase: CallPhase; outcome: CallOutcome }
  | { kind: "no-answer"; phase: CallPhase };

export function pollDecision(
  call: VapiCallLike,
  elapsedMs: number, // since the call was registered (click time)
  now: number,
  opts?: { analysisGraceMs?: number; connectCeilingMs?: number },
): PollDecision {
  const analysisGraceMs = opts?.analysisGraceMs ?? 120_000; // wait up to 2m after end for analysis
  const connectCeilingMs = opts?.connectCeilingMs ?? 360_000; // ring/queued this long → nobody picked up
  const phase = callPhase(call);
  if (phase === "done" || phase === "failed") return { kind: "settle", phase, outcome: classifyOutcome(call) };
  if (phase === "analyzing") {
    // A call that never started (rejected, busy, transport error) will never
    // get analysis - Vapi only analyzes conversations. Settle NOW, don't show
    // "Analyzing…" forever. (Bug: endedAt is null on these, and the old
    // `endedAt ?? now` fallback restarted the grace clock every tick.)
    if (!call.startedAt) return { kind: "settle", phase, outcome: classifyOutcome(call) };
    // Call ended after a real conversation; wait for analysis, but don't wait
    // forever - after the grace, classify with whatever we have (endedReason
    // drives the label, NOT a blind no-answer).
    if (call.endedAt) {
      if (now - Date.parse(call.endedAt) > analysisGraceMs) {
        return { kind: "settle", phase, outcome: classifyOutcome(call) };
      }
      return { kind: "waiting", phase };
    }
    // Ended, started, but no endedAt (rare) - no anchor for the grace clock, so
    // fall back to total elapsed: past the connect ceiling, settle from real data.
    if (elapsedMs > connectCeilingMs) return { kind: "settle", phase, outcome: classifyOutcome(call) };
    return { kind: "waiting", phase };
  }
  // queued / ringing - still trying to connect
  if (elapsedMs > connectCeilingMs) return { kind: "no-answer", phase };
  return { kind: "waiting", phase };
}

// Fold one Vapi Web SDK `message` into an accumulating partial outcome.
export function reduceWebMessage(prev: Partial<CallOutcome>, m: WebMessage): Partial<CallOutcome> {
  if (m?.type === "tool-calls" || m?.type === "function-call") {
    const list = m.toolCallList ?? m.toolCalls ?? (m.functionCall ? [{ function: m.functionCall }] : []);
    const booked = list.some((t: any) => (t?.function?.name ?? t?.name) === "book_meeting");
    return booked ? { ...prev, booked: true } : prev;
  }
  if (m?.type === "end-of-call-report") {
    const sd = m.analysis?.structuredData ?? {};
    return {
      ...prev,
      summary: m.analysis?.summary ?? prev.summary,
      qualified: sd.qualified ?? prev.qualified,
      booked: sd.booked ?? prev.booked,
      reason: sd.reason ?? prev.reason,
      endedReason: m.endedReason ?? prev.endedReason,
      transcript: m.transcript ?? m.artifact?.transcript ?? prev.transcript,
    };
  }
  return prev;
}
