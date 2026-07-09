import { test, expect, describe, it } from "vitest";
import { parseToolCall, parseEndOfCall, extractCallMeta } from "./webhook";

test("parseToolCall reads the real nested Vapi shape (function.name + JSON-string arguments)", () => {
  const body = { message: { type: "tool-calls", toolCallList: [
    { id: "tc1", type: "function", function: {
      name: "book_meeting",
      arguments: JSON.stringify({ name: "Dana", email: "d@x.com", startTime: "2026-07-10T14:00:00Z" }),
    } },
  ] } };
  expect(parseToolCall(body)[0]).toEqual({
    id: "tc1", name: "book_meeting",
    args: { name: "Dana", email: "d@x.com", startTime: "2026-07-10T14:00:00Z" },
  });
});

test("parseToolCall also handles already-parsed object arguments (defensive)", () => {
  const body = { message: { toolCallList: [
    { id: "tc2", type: "function", function: { name: "book_meeting", arguments: { name: "Guy", email: "g@x.com", startTime: "2026-07-11T09:00:00Z" } } },
  ] } };
  expect(parseToolCall(body)[0].args).toEqual({ name: "Guy", email: "g@x.com", startTime: "2026-07-11T09:00:00Z" });
});

test("parseToolCall returns [] when there are no tool calls", () => {
  expect(parseToolCall({ message: { type: "status-update" } })).toEqual([]);
});

test("parseEndOfCall extracts call fields", () => {
  const body = { message: { type: "end-of-call-report",
    call: { id: "call1", assistantId: "a1", customer: { number: "+972500000000" }, status: "ended" },
    summary: "Qualified, booked", transcript: "AI: hi" } };
  const r = parseEndOfCall(body);
  expect(r.vapiCallId).toBe("call1");
  expect(r.assistantId).toBe("a1");
  expect(r.phone).toBe("+972500000000");
  expect(r.summary).toBe("Qualified, booked");
  expect(r.transcript).toBe("AI: hi");
});

test("parseEndOfCall is safe on a minimal/empty body", () => {
  const r = parseEndOfCall({});
  expect(r.vapiCallId).toBe("");
  expect(r.status).toBe("ended");
});

describe("extractCallMeta", () => {
  it("reads leadId from call assistantOverrides metadata", () => {
    const body = { message: { call: { assistantOverrides: { metadata: { leadId: "lead_9" } } } } };
    expect(extractCallMeta(body)).toEqual({ leadId: "lead_9" });
  });
  it("returns empty object when absent", () => {
    expect(extractCallMeta({})).toEqual({});
    expect(extractCallMeta({ message: { call: {} } })).toEqual({});
  });
});
