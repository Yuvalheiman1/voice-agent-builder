// Pure slot math - no I/O (same pattern as lib/dialer.ts). All slot instants
// are UTC ISO strings; the timezone only shapes the wall-clock grid.

export type BookingSettings = {
  workDays: number[];     // 0=Sun … 6=Sat
  dayStart: string;       // "09:00" wall clock in `timezone`
  dayEnd: string;         // "17:00"
  meetingMinutes: number; // slot length AND grid step
  timezone: string;       // IANA, e.g. "Asia/Jerusalem"
};

export const MIN_NOTICE_MS = 2 * 60 * 60 * 1000;
export const HORIZON_DAYS = 7;
export const MAX_OFFERED = 8;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Wall-clock parts of an instant in a timezone (Intl is the only tz database
// available without a dependency; Node ships full ICU).
function partsIn(tz: string, at: number) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", hour12: false, weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(at)) p[part.type] = part.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, wd: WEEKDAYS.indexOf(p.weekday) };
}

// Instant of a wall-clock HH:MM in tz, on the calendar day containing dayAnchor.
// Offset correction is computed at the guessed instant - stable away from DST
// transitions (Israel switches in Mar/Oct; a slot on the switch night may shift
// an hour - accepted, out of demo scope).
function wallTimeToInstant(tz: string, dayAnchor: number, hhmm: string): number {
  const p = partsIn(tz, dayAnchor);
  const [h, mi] = hhmm.split(":").map(Number);
  const guess = Date.UTC(p.y, p.mo - 1, p.d, h, mi);
  const g = partsIn(tz, guess);
  const offset = Date.UTC(g.y, g.mo - 1, g.d, g.h, g.mi) - guess;
  return guess - offset;
}

const hhmmToMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

export function freeSlots(s: BookingSettings, takenISO: string[], now: number): string[] {
  const taken = new Set(takenISO.map((t) => Date.parse(t)));
  const step = s.meetingMinutes * 60000;
  const out: string[] = [];
  for (let day = 0; day < HORIZON_DAYS; day++) {
    const anchor = now + day * DAY_MS;
    if (!s.workDays.includes(partsIn(s.timezone, anchor).wd)) continue;
    const start = wallTimeToInstant(s.timezone, anchor, s.dayStart);
    const end = wallTimeToInstant(s.timezone, anchor, s.dayEnd);
    for (let t = start; t + step <= end; t += step) {
      if (t < now + MIN_NOTICE_MS || taken.has(t)) continue;
      out.push(new Date(t).toISOString());
    }
  }
  return out;
}

export function isValidSlot(s: BookingSettings, startTime: string, now: number): boolean {
  const t = Date.parse(startTime);
  if (Number.isNaN(t) || t < now + MIN_NOTICE_MS) return false;
  const p = partsIn(s.timezone, t);
  if (!s.workDays.includes(p.wd)) return false;
  const mins = p.h * 60 + p.mi;
  const startM = hhmmToMin(s.dayStart);
  const endM = hhmmToMin(s.dayEnd);
  if (mins < startM || mins + s.meetingMinutes > endM) return false;
  return (mins - startM) % s.meetingMinutes === 0;
}

// Spoken-friendly list for the prompt. Each line carries the machine-readable
// startTime the agent must pass to book_meeting VERBATIM - removes all
// timezone/parsing ambiguity (a bare "2026-07-13T10:00" would be parsed in the
// server's timezone, not the operator's).
export function renderSlots(slotsISO: string[], language: "en" | "he", tz: string): string {
  const chosen = slotsISO.slice(0, MAX_OFFERED);
  if (chosen.length === 0) return language === "he" ? "אין זמנים פנויים השבוע." : "No open times this week.";
  const locale = language === "he" ? "he-IL" : "en-US";
  return chosen
    .map((iso) => {
      const d = new Date(iso);
      const day = new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(d);
      const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
      return `- ${day} ${time} (startTime: "${iso}")`;
    })
    .join("\n");
}
