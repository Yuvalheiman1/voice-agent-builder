// lib/rows.test.ts
import { describe, it, expect } from "vitest";
import {
  rowToAgent, agentToRow, agentPatchToRow,
  rowToLead, leadToRow, leadPatchToRow,
  rowToCall, outcomeToCallRow, attachOutcomes, attachLastTest,
} from "./rows";
import type { Agent, Lead, CallOutcome } from "./types";

const config = { name: "Vera", firstMessage: "hi", systemPrompt: "sp", voiceId: "Savannah", qualificationQuestions: ["budget?"] };

describe("agent mappers", () => {
  it("round-trips an agent", () => {
    const a: Agent = { id: "agent_1", config, personaId: "vera", vapiId: "v-1", active: true, maxParallel: 2, createdAt: 1750000000000 };
    const row = agentToRow(a);
    expect(row).toMatchObject({ id: "agent_1", persona_id: "vera", vapi_id: "v-1", active: true, max_parallel: 2 });
    expect(rowToAgent({ ...row, created_at: new Date(a.createdAt).toISOString() })).toMatchObject(a);
  });
  it("defaults active=false, maxParallel=1 when columns are null-ish", () => {
    const a = rowToAgent({ id: "x", config, persona_id: null, vapi_id: null, active: false, max_parallel: 1, created_at: "2026-07-09T00:00:00Z" });
    expect(a.active).toBe(false);
    expect(a.maxParallel).toBe(1);
    expect(a.personaId).toBeUndefined();
  });
  it("maps only known keys in a patch", () => {
    expect(agentPatchToRow({ vapiId: "v-2", active: true })).toEqual({ vapi_id: "v-2", active: true });
    expect(agentPatchToRow({ lastOutcome: { label: "booked", booked: true, qualified: true, at: 1 } } as Partial<Agent>)).toEqual({});
  });
});

describe("lead mappers", () => {
  it("round-trips a lead", () => {
    const l: Lead = { id: "lead_1", name: "Dana", phone: "+972501234567", email: "d@x.com", status: "queued", queuedAt: 1750000000000, claimedBy: "agent_1", liveCallId: "call-9", createdAt: 1750000000000 };
    const row = leadToRow(l);
    expect(row).toMatchObject({ id: "lead_1", email: "d@x.com", status: "queued", claimed_by: "agent_1", live_call_id: "call-9" });
    expect(rowToLead({ ...row, queued_at: new Date(1750000000000).toISOString(), created_at: new Date(1750000000000).toISOString() })).toMatchObject(l);
  });
  it("patch maps nullable clears", () => {
    expect(leadPatchToRow({ status: "booked", liveCallId: undefined, claimedBy: undefined })).toEqual({ status: "booked", live_call_id: null, claimed_by: null });
  });
});

describe("call mappers", () => {
  const outcome: CallOutcome = { label: "booked", booked: true, qualified: true, reason: "agreed", summary: "s", transcript: "t", endedReason: "hangup", callId: "vapi-1", durationSec: 62, at: 1750000000000 };
  it("outcomeToCallRow → rowToCall round-trip", () => {
    const row = outcomeToCallRow(outcome, { id: "call_1", agentId: "agent_1", leadId: "lead_1", type: "phone" });
    expect(row).toMatchObject({ id: "call_1", vapi_call_id: "vapi-1", agent_id: "agent_1", lead_id: "lead_1", type: "phone", label: "booked", booked: true, qualified: true, duration_sec: 62 });
    const back = rowToCall({ ...row, created_at: new Date(1750000000000).toISOString() });
    expect(back).toMatchObject({ id: "call_1", agentId: "agent_1", leadId: "lead_1", type: "phone", label: "booked", callId: "vapi-1", at: 1750000000000 });
  });
});

describe("attachment helpers", () => {
  const mkCallRow = (id: string, leadId: string | null, agentId: string, type: string, createdAt: string, label = "booked") => ({
    id, vapi_call_id: null, agent_id: agentId, lead_id: leadId, type, label,
    booked: label === "booked", qualified: true, reason: null, summary: "sum", transcript: null,
    ended_reason: null, duration_sec: 10, started_at: null, ended_at: createdAt, created_at: createdAt,
  });
  it("attachOutcomes picks the latest call per lead", () => {
    const leads: Lead[] = [{ id: "lead_1", name: "", phone: "1", status: "booked", createdAt: 0 }];
    const out = attachOutcomes(leads, [
      mkCallRow("c1", "lead_1", "a1", "phone", "2026-07-01T00:00:00Z", "no-answer"),
      mkCallRow("c2", "lead_1", "a1", "phone", "2026-07-09T00:00:00Z", "booked"),
    ]);
    expect(out[0].outcome?.label).toBe("booked");
  });
  it("attachLastTest uses only web calls of that agent", () => {
    const agents: Agent[] = [{ id: "a1", config, createdAt: 0 }];
    const out = attachLastTest(agents, [
      mkCallRow("c1", null, "a1", "web", "2026-07-08T00:00:00Z", "qualified"),
      mkCallRow("c2", null, "a1", "phone", "2026-07-09T00:00:00Z", "booked"),
      mkCallRow("c3", null, "other", "web", "2026-07-09T00:00:00Z", "booked"),
    ]);
    expect(out[0].lastOutcome?.label).toBe("qualified");
  });
  it("leaves outcome undefined when no calls", () => {
    const out = attachOutcomes([{ id: "l", name: "", phone: "1", status: "new", createdAt: 0 }], []);
    expect(out[0].outcome).toBeUndefined();
  });
});
