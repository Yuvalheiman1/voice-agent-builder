import { Resend } from "resend";

export type BookingArgs = { name: string; email: string; startTime: string };

export function buildBookingEmail(a: BookingArgs, operator: string) {
  return {
    to: operator,
    subject: `New meeting booked with ${a.name}`,
    text:
      `Your voice agent booked a meeting.\n\n` +
      `Lead: ${a.name} <${a.email}>\n` +
      `When: ${a.startTime}\n`,
  };
}

export async function sendBookingEmail(a: BookingArgs): Promise<{ ok: boolean; detail: string }> {
  const key = process.env.RESEND_API_KEY;
  const operator = process.env.OPERATOR_EMAIL;
  if (!key || !operator) return { ok: false, detail: "RESEND_API_KEY or OPERATOR_EMAIL not set" };
  const msg = buildBookingEmail(a, operator);
  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({ from: "VoiceBuilder <onboarding@resend.dev>", ...msg });
    if (error) return { ok: false, detail: error.message };
    return { ok: true, detail: `Emailed ${operator} about ${a.name} at ${a.startTime}` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
