// lib/dialer.test.ts
import { describe, it, expect } from "vitest";
import { claimSlots, queueOrder, recoveryActions, capAllowance } from "./dialer";
import type { Agent, Lead } from "./types";

const config = { name: "A", firstMessage: "hi", systemPrompt: "sp", voiceId: "alloy", qualificationQuestions: [] };
const agent = (id: string, over: Partial<Agent> = {}): Agent =>
  ({ id, config, vapiId: `v-${id}`, active: true, maxParallel: 1, createdAt: 0, ...over });
const lead = (id: string, over: Partial<Lead> = {}): Lead =>
  ({ id, name: id, phone: "+972500000000", status: "new", createdAt: 0, ...over });

describe("claimSlots", () => {
  it("gives an active agent its free slots", () => {
    expect(claimSlots([agent("a1", { maxParallel: 3 })], { a1: 1 }))
      .toEqual([{ agentId: "a1", vapiId: "v-a1", slots: 2 }]);
  });
  it("skips inactive agents, agents without vapiId, and full agents", () => {
    const agents = [
      agent("a1", { active: false }),
      agent("a2", { vapiId: undefined }),
      agent("a3", { maxParallel: 2 }),
    ];
    expect(claimSlots(agents, { a3: 2 })).toEqual([]);
  });
  it("defaults maxParallel to 1 and live count to 0", () => {
    expect(claimSlots([agent("a1", { maxParallel: undefined })], {}))
      .toEqual([{ agentId: "a1", vapiId: "v-a1", slots: 1 }]);
  });
});

describe("queueOrder", () => {
  it("returns queued ids oldest-first", () => {
    const leads = [
      lead("l1", { status: "queued", queuedAt: 200 }),
      lead("l2", { status: "new" }),
      lead("l3", { status: "queued", queuedAt: 100 }),
    ];
    expect(queueOrder(leads)).toEqual(["l3", "l1"]);
  });
  it("puts queued leads without queuedAt last", () => {
    const leads = [
      lead("l1", { status: "queued" }),
      lead("l2", { status: "queued", queuedAt: 100 }),
    ];
    expect(queueOrder(leads)).toEqual(["l2", "l1"]);
  });
});

describe("recoveryActions", () => {
  it("resumes calling leads with a live call id", () => {
    const r = recoveryActions([lead("l1", { status: "calling", liveCallId: "c1", claimedBy: "a1" })]);
    expect(r.resume).toEqual([{ leadId: "l1", callId: "c1", agentId: "a1" }]);
    expect(r.revertToQueue).toEqual([]);
  });
  it("reverts calling leads with no call id back to the queue", () => {
    const r = recoveryActions([lead("l1", { status: "calling" })]);
    expect(r.resume).toEqual([]);
    expect(r.revertToQueue).toEqual(["l1"]);
  });
  it("ignores settled/new/queued leads", () => {
    const r = recoveryActions([lead("l1"), lead("l2", { status: "queued", queuedAt: 1 }), lead("l3", { status: "booked" })]);
    expect(r.resume).toEqual([]);
    expect(r.revertToQueue).toEqual([]);
  });
});

describe("capAllowance", () => {
  it("allows the remainder under the cap", () => {
    expect(capAllowance(30, 10, 2)).toBe(18);
  });
  it("counts live calls against the allowance", () => {
    expect(capAllowance(30, 29, 1)).toBe(0);
  });
  it("clamps at zero when over", () => {
    expect(capAllowance(30, 45, 0)).toBe(0);
  });
  it("zero cap allows nothing", () => {
    expect(capAllowance(0, 0, 0)).toBe(0);
  });
});
