import type { Agent, Lead, CallOutcome, Meeting } from "./types";

// snake_case DB row ↔ camelCase app type mappers. Pure - the only place
// column names live. undefined → null on the way in (Postgres), null →
// undefined on the way out (app types use optionals).

const iso = (ms?: number) => (ms == null ? null : new Date(ms).toISOString());
const ms = (s?: string | null) => (s == null ? undefined : Date.parse(s));

export function rowToAgent(r: any): Agent {
  return {
    id: r.id,
    config: r.config,
    personaId: r.persona_id ?? undefined,
    vapiId: r.vapi_id ?? undefined,
    active: r.active ?? false,
    maxParallel: r.max_parallel ?? 1,
    createdAt: ms(r.created_at) ?? 0,
  };
}

export function agentToRow(a: Agent): Record<string, unknown> {
  return {
    id: a.id,
    config: a.config,
    persona_id: a.personaId ?? null,
    vapi_id: a.vapiId ?? null,
    active: a.active ?? false,
    max_parallel: a.maxParallel ?? 1,
    created_at: iso(a.createdAt),
  };
}

const AGENT_PATCH_COLS: Record<string, string> = {
  config: "config", personaId: "persona_id", vapiId: "vapi_id",
  active: "active", maxParallel: "max_parallel",
};

export function agentPatchToRow(p: Partial<Agent>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(AGENT_PATCH_COLS)) {
    if (key in p) row[col] = (p as any)[key] ?? null;
  }
  return row;
}

export function rowToLead(r: any): Lead {
  return {
    id: r.id,
    name: r.name ?? "",
    phone: r.phone,
    email: r.email ?? undefined,
    status: r.status,
    queuedAt: ms(r.queued_at),
    claimedBy: r.claimed_by ?? undefined,
    liveCallId: r.live_call_id ?? undefined,
    createdAt: ms(r.created_at) ?? 0,
  };
}

export function leadToRow(l: Lead): Record<string, unknown> {
  return {
    id: l.id,
    name: l.name,
    phone: l.phone,
    email: l.email ?? null,
    status: l.status,
    queued_at: iso(l.queuedAt),
    claimed_by: l.claimedBy ?? null,
    live_call_id: l.liveCallId ?? null,
    created_at: iso(l.createdAt),
  };
}

const LEAD_PATCH_COLS: Record<string, string> = {
  name: "name", phone: "phone", email: "email", status: "status",
  queuedAt: "queued_at", claimedBy: "claimed_by", liveCallId: "live_call_id",
};

export function leadPatchToRow(p: Partial<Lead>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(LEAD_PATCH_COLS)) {
    if (key in p) {
      const v = (p as any)[key];
      row[col] = key === "queuedAt" ? iso(v) : v ?? null;
    }
  }
  return row;
}

export type CallRecord = CallOutcome & {
  id: string;
  agentId: string | null;
  leadId: string | null;
  type: "phone" | "web";
};

export function rowToCall(r: any): CallRecord {
  return {
    id: r.id,
    agentId: r.agent_id ?? null,
    leadId: r.lead_id ?? null,
    type: r.type,
    label: r.label,
    booked: r.booked,
    qualified: r.qualified,
    reason: r.reason ?? undefined,
    summary: r.summary ?? undefined,
    transcript: r.transcript ?? undefined,
    endedReason: r.ended_reason ?? undefined,
    callId: r.vapi_call_id ?? undefined,
    durationSec: r.duration_sec ?? undefined,
    at: ms(r.ended_at) ?? ms(r.created_at) ?? 0,
  };
}

export function rowToMeeting(r: any): Meeting {
  return {
    id: r.id,
    startTs: r.start_ts,
    leadName: r.lead_name ?? "",
    leadEmail: r.lead_email ?? undefined,
    leadPhone: r.lead_phone ?? undefined,
    agentId: r.agent_id ?? undefined,
    callId: r.call_id ?? undefined,
    createdAt: ms(r.created_at) ?? 0,
  };
}

export function outcomeToCallRow(
  o: CallOutcome,
  meta: { id: string; agentId: string | null; leadId: string | null; type: "phone" | "web" },
): Record<string, unknown> {
  return {
    id: meta.id,
    vapi_call_id: o.callId ?? null,
    agent_id: meta.agentId,
    lead_id: meta.leadId,
    type: meta.type,
    label: o.label,
    booked: o.booked,
    qualified: o.qualified,
    reason: o.reason ?? null,
    summary: o.summary ?? null,
    transcript: o.transcript ?? null,
    ended_reason: o.endedReason ?? null,
    duration_sec: o.durationSec ?? null,
    started_at: null,
    ended_at: iso(o.at),
  };
}

// JSON.stringify drops undefined values, so a "clear this field" patch like
// { liveCallId: undefined } would silently vanish on the wire. Convert
// undefined → null (which survives JSON and maps to SQL NULL).
export function toWirePatch<T extends object>(patch: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(patch).map(([k, v]) => [k, v === undefined ? null : v]),
  );
}

// Latest call row per group key (rows may arrive in any order).
function latestBy(rows: any[], key: (r: any) => string | null): Map<string, any> {
  const m = new Map<string, any>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const prev = m.get(k);
    if (!prev || Date.parse(r.created_at) > Date.parse(prev.created_at)) m.set(k, r);
  }
  return m;
}

export function attachOutcomes(leads: Lead[], callRows: any[]): Lead[] {
  const latest = latestBy(callRows, (r) => r.lead_id);
  return leads.map((l) => {
    const r = latest.get(l.id);
    if (!r) return l;
    const { id: _id, agentId: _a, leadId: _l, type: _t, ...outcome } = rowToCall(r);
    return { ...l, outcome };
  });
}

export function attachLastTest(agents: Agent[], callRows: any[]): Agent[] {
  const latest = latestBy(callRows.filter((r) => r.type === "web"), (r) => r.agent_id);
  return agents.map((a) => {
    const r = latest.get(a.id);
    if (!r) return a;
    const { id: _id, agentId: _a, leadId: _l, type: _t, ...lastOutcome } = rowToCall(r);
    return { ...a, lastOutcome };
  });
}
