import { describe, it, expect } from "vitest";
import { freeSlots, isValidSlot, renderSlots, MAX_OFFERED, type BookingSettings } from "./schedule";

const S: BookingSettings = { workDays: [0, 1, 2, 3, 4], dayStart: "09:00", dayEnd: "17:00", meetingMinutes: 30, timezone: "Asia/Jerusalem" };
// Sunday 2026-07-12 09:00 IDT (Israel is UTC+3 in July) = 06:00Z. 2026-07-12 IS a Sunday.
const NOW = Date.parse("2026-07-12T06:00:00.000Z");

describe("freeSlots", () => {
  it("first slot respects the 2h minimum notice, aligned to the grid", () => {
    // now = 09:00 IDT → earliest bookable 11:00 IDT = 08:00Z
    expect(freeSlots(S, [], NOW)[0]).toBe("2026-07-12T08:00:00.000Z");
  });
  it("last slot of a day starts one meeting-length before dayEnd", () => {
    const slots = freeSlots(S, [], NOW);
    expect(slots).toContain("2026-07-12T13:30:00.000Z"); // 16:30 IDT
    expect(slots).not.toContain("2026-07-12T14:00:00.000Z"); // 17:00 IDT excluded
  });
  it("skips non-work days (Fri+Sat)", () => {
    const slots = freeSlots(S, [], NOW);
    // 2026-07-17 = Friday, 2026-07-18 = Saturday; all slots are 06:00–13:30Z so UTC date == Jerusalem date
    expect(slots.some((x) => x.startsWith("2026-07-17") || x.startsWith("2026-07-18"))).toBe(false);
  });
  it("excludes taken slots", () => {
    const [first, second] = freeSlots(S, [], NOW);
    expect(freeSlots(S, [first], NOW)[0]).toBe(second);
  });
  it("covers the 7-day horizon and nothing beyond", () => {
    const slots = freeSlots(S, [], NOW);
    expect(slots.some((x) => x.startsWith("2026-07-16"))).toBe(true);  // Thursday within horizon
    expect(slots.some((x) => x.startsWith("2026-07-19"))).toBe(false); // next Sunday, day 7 - out
  });
});

describe("isValidSlot", () => {
  it("accepts an on-grid future work-hour slot", () => {
    expect(isValidSlot(S, "2026-07-13T06:00:00.000Z", NOW)).toBe(true); // Monday 09:00 IDT
  });
  it("rejects off-grid minutes", () => {
    expect(isValidSlot(S, "2026-07-13T06:15:00.000Z", NOW)).toBe(false); // 09:15 IDT
  });
  it("rejects non-work days", () => {
    expect(isValidSlot(S, "2026-07-17T06:00:00.000Z", NOW)).toBe(false); // Friday
  });
  it("rejects times inside the minimum-notice window and the past", () => {
    expect(isValidSlot(S, "2026-07-12T06:30:00.000Z", NOW)).toBe(false); // 09:30 IDT, <2h away
    expect(isValidSlot(S, "2026-07-05T06:00:00.000Z", NOW)).toBe(false);
  });
  it("rejects a slot whose meeting would overrun dayEnd", () => {
    const s45 = { ...S, meetingMinutes: 45 };
    // 16:30 IDT is on the 45-min grid (09:00 + 10*45min) but 16:30+45 > 17:00
    expect(isValidSlot(s45, "2026-07-13T13:30:00.000Z", NOW)).toBe(false);
  });
  it("rejects garbage", () => {
    expect(isValidSlot(S, "tomorrow at noonish", NOW)).toBe(false);
    expect(isValidSlot(S, "", NOW)).toBe(false);
  });
});

describe("renderSlots", () => {
  const slots = freeSlots(S, [], NOW);
  it("caps at MAX_OFFERED and embeds the exact startTime code per line", () => {
    const text = renderSlots(slots, "en", S.timezone);
    expect(text.split("\n").length).toBe(MAX_OFFERED);
    expect(text).toContain(`(startTime: "${slots[0]}")`);
  });
  it("renders English day names in the settings timezone", () => {
    expect(renderSlots(slots, "en", S.timezone)).toContain("Sunday"); // 2026-07-12
  });
  it("renders Hebrew day names for language he", () => {
    expect(renderSlots(slots, "he", S.timezone)).toMatch(/יום ראשון/);
  });
  it("says the calendar is empty when there are no slots", () => {
    expect(renderSlots([], "en", S.timezone)).toBe("No open times this week.");
    expect(renderSlots([], "he", S.timezone)).toBe("אין זמנים פנויים השבוע.");
  });
});
