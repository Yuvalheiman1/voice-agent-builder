import { test, expect } from "vitest";
import { buildBookingEmail, isEmailUnconfirmed } from "./email";

test("buildBookingEmail addresses the operator and includes lead + time", () => {
  const msg = buildBookingEmail(
    { name: "Dana", email: "dana@x.com", startTime: "2026-07-10T14:00:00Z" },
    "operator@voicebuilder.com",
  );
  expect(msg.to).toBe("operator@voicebuilder.com");
  expect(msg.subject).toContain("Dana");
  expect(msg.subject).not.toContain("unconfirmed");
  expect(msg.text).toContain("dana@x.com");
  expect(msg.text).toContain("2026-07-10T14:00:00Z");
});

test("unknown email → flagged subject + SMS follow-up note with phone", () => {
  const msg = buildBookingEmail(
    { name: "Dana", email: "unknown", startTime: "2026-07-10T14:00:00Z", phone: "+972501234567" },
    "operator@voicebuilder.com",
  );
  expect(msg.subject).toMatch(/^\[email unconfirmed\]/);
  expect(msg.text).toContain("NOT captured");
  expect(msg.text).toContain("+972501234567");
  expect(msg.text).not.toContain("<unknown>");
});

test("isEmailUnconfirmed: unknown/empty/missing are unconfirmed, real emails are not", () => {
  expect(isEmailUnconfirmed("unknown")).toBe(true);
  expect(isEmailUnconfirmed("Unknown")).toBe(true);
  expect(isEmailUnconfirmed("")).toBe(true);
  expect(isEmailUnconfirmed(undefined)).toBe(true);
  expect(isEmailUnconfirmed("dana@x.com")).toBe(false);
});
