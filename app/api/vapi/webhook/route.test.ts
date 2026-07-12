import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDbMock, type DbMock } from "@/lib/test-utils/db-mock";

let mockDb: DbMock;
const mockSendEmail = vi.fn();
const mockSms = vi.fn();
const mockLog = vi.fn();
const bookSlotMock = vi.fn();

vi.mock("@/lib/db", () => ({ db: () => mockDb.db() }));
vi.mock("@/lib/log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/log")>()),
  logEvent: (...args: unknown[]) => mockLog(...args),
}));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendBookingEmail: (...args: unknown[]) => mockSendEmail(...args),
}));
vi.mock("@/lib/sms", () => ({ sendFollowUpSms: (...args: unknown[]) => mockSms(...args) }));
vi.mock("@/lib/booking", () => ({ bookSlot: (...args: unknown[]) => bookSlotMock(...args) }));

import { POST } from "./route";

// Real nested Vapi shape: function.name + JSON-string arguments.
const toolCallBody = (args: Record<string, unknown>, meta?: { leadId?: string; phone?: string }) => ({
  message: {
    type: "tool-calls",
    toolCallList: [{ id: "tc1", type: "function", function: { name: "book_meeting", arguments: JSON.stringify(args) } }],
    call: {
      ...(meta?.leadId ? { assistantOverrides: { metadata: { leadId: meta.leadId } } } : {}),
      ...(meta?.phone ? { customer: { number: meta.phone } } : {}),
    },
  },
});

const post = (body: unknown) =>
  POST(new Request("http://t/api/vapi/webhook", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  mockDb = createDbMock();
  mockDb.setResult({ data: null, error: null });
  mockSendEmail.mockReset().mockResolvedValue({ ok: true, detail: "sent" });
  mockSms.mockReset().mockResolvedValue({ ok: false, detail: "placeholder" });
  mockLog.mockReset().mockResolvedValue(undefined);
  bookSlotMock.mockReset().mockResolvedValue({ ok: true, startISO: "2026-07-12T10:00:00.000Z" });
});

describe("POST /api/vapi/webhook - book_meeting", () => {
  it("confirmed email: emails operator, writes email back to the lead, no SMS", async () => {
    const res = await post(toolCallBody(
      { name: "Dana", email: "dana@x.com", startTime: "2026-07-12T10:00:00Z" },
      { leadId: "lead_1", phone: "+972501234567" },
    ));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [{ toolCallId: "tc1", result: "Booked 2026-07-12T10:00:00.000Z. sent" }],
    });
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ email: "dana@x.com" }));
    expect(mockDb.op("leads", "update")?.args[0]).toEqual({ email: "dana@x.com" });
    expect(mockSms).not.toHaveBeenCalled();
  });

  it('email "unknown": flags phone to the email builder, fires SMS placeholder, never writes "unknown" to the lead', async () => {
    const res = await post(toolCallBody(
      { name: "Dana", email: "unknown", startTime: "2026-07-12T10:00:00Z" },
      { leadId: "lead_1", phone: "+972501234567" },
    ));
    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ email: "unknown", phone: "+972501234567" }));
    expect(mockSms).toHaveBeenCalledWith("+972501234567", expect.stringContaining("Dana"));
    expect(mockDb.op("leads", "update")).toBeUndefined();
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
      type: "webhook.booking", actor: "webhook", leadId: "lead_1",
      data: { emailConfirmed: false, smsFallback: true },
    }));
  });

  it("confirmed email logs webhook.booking with emailConfirmed:true, no smsFallback", async () => {
    await post(toolCallBody(
      { name: "Dana", email: "dana@x.com", startTime: "t" },
      { leadId: "lead_1", phone: "+972501234567" },
    ));
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
      type: "webhook.booking", ok: true,
      data: { emailConfirmed: true, smsFallback: false },
    }));
  });

  it("email send failure → booking still confirms as { result } (not error), still HTTP 200", async () => {
    mockSendEmail.mockResolvedValue({ ok: false, detail: "resend down" });
    const res = await post(toolCallBody({ name: "Dana", email: "dana@x.com", startTime: "t" }, {}));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results[0].result).toContain("Booked");
    expect(json.results[0].error).toBeUndefined();
    expect(mockSms).not.toHaveBeenCalled();
  });
});

describe("book_meeting availability guard", () => {
  it("books the slot first, then emails: success result carries the ISO", async () => {
    bookSlotMock.mockResolvedValue({ ok: true, startISO: "2026-07-13T06:00:00.000Z" });
    const res = await post(toolCallBody({ name: "Dana", email: "d@x.com", startTime: "2026-07-13T06:00:00.000Z" }));
    const json = await res.json();
    expect(json.results[0].result).toContain("Booked 2026-07-13T06:00:00.000Z");
    expect(bookSlotMock).toHaveBeenCalledWith(expect.objectContaining({ startTime: "2026-07-13T06:00:00.000Z" }));
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ type: "meeting.booked" }));
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ type: "webhook.booking" }));
  });

  it("returns the spoken recovery as result (not error) on conflict and does NOT email", async () => {
    bookSlotMock.mockResolvedValue({
      ok: false, kind: "conflict",
      sayToLead: "Ah - that time was just taken. These times are still free:\n- Monday 09:00",
    });
    const res = await post(toolCallBody({ name: "Dana", email: "d@x.com", startTime: "2026-07-13T06:00:00.000Z" }));
    const json = await res.json();
    expect(json.results[0].result).toContain("just taken");
    expect(json.results[0].error).toBeUndefined();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
      type: "meeting.conflict", ok: false, error: "conflict",
    }));
  });

  it("a failed operator email does NOT unbook: result still confirms the booking", async () => {
    bookSlotMock.mockResolvedValue({ ok: true, startISO: "2026-07-13T06:00:00.000Z" });
    mockSendEmail.mockResolvedValue({ ok: false, detail: "smtp down" });
    const res = await post(toolCallBody({ name: "Dana", email: "d@x.com", startTime: "2026-07-13T06:00:00.000Z" }));
    const json = await res.json();
    expect(json.results[0].result).toContain("Booked");
  });
});

describe("POST /api/vapi/webhook - other messages", () => {
  it("unknown tool → generic ok result", async () => {
    const body = { message: { type: "tool-calls", toolCallList: [
      { id: "tc2", type: "function", function: { name: "something_else", arguments: "{}" } },
    ], call: {} } };
    expect(await (await post(body)).json()).toEqual({ results: [{ toolCallId: "tc2", result: "ok" }] });
  });

  it("end-of-call-report and unknown types → { ok: true }", async () => {
    expect(await (await post({ message: { type: "end-of-call-report", summary: "booked" } })).json()).toEqual({ ok: true });
    expect(await (await post({ message: { type: "status-update" } })).json()).toEqual({ ok: true });
  });
});
