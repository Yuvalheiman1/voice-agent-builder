import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDbMock, type DbMock } from "@/lib/test-utils/db-mock";

let mockDb: DbMock;
const mockSendEmail = vi.fn();
const mockSms = vi.fn();
const mockLog = vi.fn();

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
});

describe("POST /api/vapi/webhook - book_meeting", () => {
  it("confirmed email: emails operator, writes email back to the lead, no SMS", async () => {
    const res = await post(toolCallBody(
      { name: "Dana", email: "dana@x.com", startTime: "2026-07-12T10:00:00Z" },
      { leadId: "lead_1", phone: "+972501234567" },
    ));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [{ toolCallId: "tc1", result: "sent" }] });
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

  it("email send failure → { error } result but still HTTP 200 (never break the live call)", async () => {
    mockSendEmail.mockResolvedValue({ ok: false, detail: "resend down" });
    const res = await post(toolCallBody({ name: "Dana", email: "dana@x.com", startTime: "t" }, {}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [{ toolCallId: "tc1", error: "resend down" }] });
    expect(mockSms).not.toHaveBeenCalled();
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
