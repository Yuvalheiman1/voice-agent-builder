import { describe, it, expect } from "vitest";
import { callPhase, classifyOutcome, reduceWebMessage, labelFrom, pollDecision } from "./outcome";

describe("callPhase", () => {
  it("maps live statuses", () => {
    expect(callPhase({ status: "queued" })).toBe("queued");
    expect(callPhase({ status: "ringing" })).toBe("ringing");
    expect(callPhase({ status: "in-progress" })).toBe("on-call");
    expect(callPhase({ status: "forwarding" })).toBe("on-call");
  });
  it("ended without analysis is analyzing; with analysis is done", () => {
    expect(callPhase({ status: "ended" })).toBe("analyzing");
    expect(callPhase({ status: "ended", analysis: { summary: "x" } })).toBe("done");
  });
  it("unknown/not-found is failed", () => {
    expect(callPhase({ status: "not-found" })).toBe("failed");
  });
});

describe("labelFrom", () => {
  it("no-answer endedReason wins", () => {
    expect(labelFrom(true, true, "customer-did-not-answer")).toBe("no-answer");
  });
  it("booked > qualified > not-qualified", () => {
    expect(labelFrom(true, false, "customer-ended-call")).toBe("booked");
    expect(labelFrom(false, true, "customer-ended-call")).toBe("qualified");
    expect(labelFrom(false, false, "customer-ended-call")).toBe("not-qualified");
  });
});

describe("classifyOutcome", () => {
  it("no-answer from endedReason wins over everything", () => {
    const o = classifyOutcome({ endedReason: "customer-did-not-answer", analysis: { structuredData: { qualified: true, booked: true } } });
    expect(o.label).toBe("no-answer");
  });
  it("booked when structuredData.booked", () => {
    const o = classifyOutcome({ status: "ended", endedReason: "customer-ended-call", analysis: { summary: "s", structuredData: { qualified: true, booked: true, reason: "agreed Tue" } } });
    expect(o.label).toBe("booked");
    expect(o.booked).toBe(true);
    expect(o.qualified).toBe(true);
    expect(o.reason).toBe("agreed Tue");
    expect(o.summary).toBe("s");
  });
  it("qualified when qualified but not booked", () => {
    const o = classifyOutcome({ status: "ended", endedReason: "customer-ended-call", analysis: { structuredData: { qualified: true, booked: false } } });
    expect(o.label).toBe("qualified");
  });
  it("not-qualified when neither", () => {
    const o = classifyOutcome({ status: "ended", endedReason: "customer-ended-call", analysis: { structuredData: { qualified: false, booked: false } } });
    expect(o.label).toBe("not-qualified");
  });
  it("ended without analysis → not-qualified, summary undefined", () => {
    const o = classifyOutcome({ status: "ended", endedReason: "customer-ended-call" });
    expect(o.label).toBe("not-qualified");
    expect(o.summary).toBeUndefined();
  });
  it("computes durationSec from timestamps", () => {
    const o = classifyOutcome({ status: "ended", startedAt: "2026-07-09T10:00:00Z", endedAt: "2026-07-09T10:01:30Z" });
    expect(o.durationSec).toBe(90);
  });
  it("reads transcript from artifact when top-level absent", () => {
    const o = classifyOutcome({ status: "ended", artifact: { transcript: "hi there" } });
    expect(o.transcript).toBe("hi there");
  });
});

describe("pollDecision", () => {
  const NOW = Date.parse("2026-07-09T14:20:00Z");
  it("a booked call settles as booked even after 6+ minutes elapsed (the regression)", () => {
    const call = { status: "ended", endedReason: "customer-ended-call", endedAt: "2026-07-09T14:14:47Z", analysis: { summary: "booked", structuredData: { booked: true, qualified: false } } };
    const d = pollDecision(call, 8 * 60 * 1000, NOW); // 8 min since click
    expect(d.kind).toBe("settle");
    expect(d.kind === "settle" && d.outcome.label).toBe("booked");
  });
  it("ended but no analysis yet, within grace → waiting", () => {
    const d = pollDecision({ status: "ended", endedAt: "2026-07-09T14:19:30Z", endedReason: "customer-ended-call" }, 3 * 60 * 1000, NOW);
    expect(d.kind).toBe("waiting");
  });
  it("ended, no analysis, past grace → settle by endedReason (not blind no-answer)", () => {
    const d = pollDecision({ status: "ended", endedAt: "2026-07-09T14:16:00Z", endedReason: "customer-ended-call" }, 5 * 60 * 1000, NOW);
    expect(d.kind).toBe("settle");
    expect(d.kind === "settle" && d.outcome.label).toBe("not-qualified");
  });
  it("still ringing past the connect ceiling → no-answer", () => {
    const d = pollDecision({ status: "ringing" }, 7 * 60 * 1000, NOW);
    expect(d.kind).toBe("no-answer");
  });
  it("still ringing within the ceiling → waiting", () => {
    const d = pollDecision({ status: "ringing" }, 30 * 1000, NOW);
    expect(d.kind).toBe("waiting");
  });
});

describe("reduceWebMessage", () => {
  it("book_meeting tool-call sets booked", () => {
    const p = reduceWebMessage({}, { type: "tool-calls", toolCallList: [{ function: { name: "book_meeting" } }] });
    expect(p.booked).toBe(true);
  });
  it("end-of-call-report merges analysis", () => {
    const p = reduceWebMessage({ booked: true }, { type: "end-of-call-report", endedReason: "customer-ended-call", analysis: { summary: "hi", structuredData: { qualified: true, booked: true, reason: "r" } } });
    expect(p.summary).toBe("hi");
    expect(p.qualified).toBe(true);
    expect(p.reason).toBe("r");
    expect(p.endedReason).toBe("customer-ended-call");
    expect(p.booked).toBe(true);
  });
  it("unrelated message is a no-op", () => {
    const prev = { booked: true };
    expect(reduceWebMessage(prev, { type: "transcript" })).toEqual(prev);
  });
});
