import { db } from "@/lib/db";
import { getSettings } from "@/lib/booking";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Returns an error string, or null when the patch is valid.
function patchError(b: Record<string, unknown>): string | null {
  if (b.workDays !== undefined && (!Array.isArray(b.workDays) || b.workDays.length === 0 || b.workDays.some((d) => !Number.isInteger(d) || (d as number) < 0 || (d as number) > 6))) {
    return "workDays must be a non-empty array of day indices 0-6";
  }
  if (b.dayStart !== undefined && (typeof b.dayStart !== "string" || !HHMM.test(b.dayStart))) return "dayStart must be HH:MM";
  if (b.dayEnd !== undefined && (typeof b.dayEnd !== "string" || !HHMM.test(b.dayEnd))) return "dayEnd must be HH:MM";
  if (b.meetingMinutes !== undefined && (!Number.isInteger(b.meetingMinutes) || (b.meetingMinutes as number) < 10 || (b.meetingMinutes as number) > 120)) {
    return "meetingMinutes must be an integer between 10 and 120";
  }
  return null;
}

export async function GET() {
  try {
    return Response.json({ settings: await getSettings() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const err = patchError(body);
    if (err) return Response.json({ error: err }, { status: 400 });
    const current = await getSettings();
    const merged = {
      dayStart: (body.dayStart as string) ?? current.dayStart,
      dayEnd: (body.dayEnd as string) ?? current.dayEnd,
    };
    // HH:MM strings compare chronologically as strings.
    if (merged.dayEnd <= merged.dayStart) return Response.json({ error: "dayEnd must be after dayStart" }, { status: 400 });
    const row: Record<string, unknown> = {};
    if (body.workDays !== undefined) row.work_days = body.workDays;
    if (body.dayStart !== undefined) row.day_start = body.dayStart;
    if (body.dayEnd !== undefined) row.day_end = body.dayEnd;
    if (body.meetingMinutes !== undefined) row.meeting_minutes = body.meetingMinutes;
    if (Object.keys(row).length === 0) return Response.json({ error: "Nothing to update" }, { status: 400 });
    const { error } = await db().from("booking_settings").update(row).eq("id", 1);
    if (error) throw new Error(error.message);
    return Response.json({ settings: await getSettings() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
