import { db } from "./db";
import { freeSlots, isValidSlot, renderSlots, type BookingSettings } from "./schedule";

// The booking seam: bookSlot() owns the single meetings INSERT. Swapping in a
// real calendar (Google) later means reimplementing only this file.

export type BookArgs = {
  name?: string; email?: string; startTime?: string;
  leadPhone?: string; agentId?: string; callId?: string;
};
export type BookResult =
  | { ok: true; startISO: string }
  | { ok: false; kind: "invalid" | "conflict" | "error"; sayToLead: string };

const mtgId = () => `mtg_${Math.random().toString(36).slice(2, 10)}`;

export async function getSettings(): Promise<BookingSettings> {
  const { data, error } = await db().from("booking_settings").select("*").eq("id", 1).single();
  if (error) throw new Error(error.message);
  return {
    workDays: data.work_days, dayStart: data.day_start, dayEnd: data.day_end,
    meetingMinutes: data.meeting_minutes, timezone: data.timezone,
  };
}

export async function getAvailability(language: "en" | "he" = "en", now = Date.now()) {
  const settings = await getSettings();
  const { data, error } = await db().from("meetings").select("start_ts").gte("start_ts", new Date(now).toISOString());
  if (error) throw new Error(error.message);
  const slots = freeSlots(settings, (data ?? []).map((r: { start_ts: string }) => r.start_ts), now);
  return { settings, slots, text: renderSlots(slots, language, settings.timezone) };
}

// First 3 alternatives for spoken recovery. Best-effort: recovery text must
// never throw (it is built while already handling a failure).
async function stillFree(now: number): Promise<string> {
  try {
    const { slots, settings } = await getAvailability("en", now);
    return renderSlots(slots.slice(0, 3), "en", settings.timezone);
  } catch {
    return "(I couldn't load alternative times)";
  }
}

export async function bookSlot(a: BookArgs, now = Date.now()): Promise<BookResult> {
  let settings: BookingSettings;
  try {
    settings = await getSettings();
  } catch {
    return { ok: false, kind: "error", sayToLead: "I couldn't reach the calendar just now - our team will follow up to schedule a time." };
  }
  if (!a.startTime || !isValidSlot(settings, a.startTime, now)) {
    return { ok: false, kind: "invalid", sayToLead: `That time isn't available. These times are still free:\n${await stillFree(now)}` };
  }
  const startISO = new Date(Date.parse(a.startTime)).toISOString();
  const { error } = await db().from("meetings").insert({
    id: mtgId(), start_ts: startISO, lead_name: a.name ?? "", lead_email: a.email ?? null,
    lead_phone: a.leadPhone ?? null, agent_id: a.agentId ?? null, call_id: a.callId ?? null,
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, kind: "conflict", sayToLead: `Ah - that time was just taken. These times are still free:\n${await stillFree(now)}` };
    }
    return { ok: false, kind: "error", sayToLead: "I couldn't confirm the booking just now - our team will follow up to schedule a time." };
  }
  return { ok: true, startISO };
}
