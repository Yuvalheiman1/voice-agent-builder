// PLACEHOLDER - SMS follow-up to a lead is not implemented yet (see docs/backlog.md).
// Called when a meeting books WITHOUT a confirmed email (the agent promised the
// lead "we'll send you a text instead"). Real implementation: Twilio SMS.
export async function sendFollowUpSms(phone: string, context: string): Promise<{ ok: boolean; detail: string }> {
  console.log("[sms placeholder] follow-up SMS not sent", { phone, context });
  return { ok: false, detail: "SMS follow-up not implemented yet (backlog)" };
}
