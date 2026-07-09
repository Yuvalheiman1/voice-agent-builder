import { test, expect } from "vitest";
import { buildBookingEmail } from "./email";

test("buildBookingEmail addresses the operator and includes lead + time", () => {
  const msg = buildBookingEmail(
    { name: "Dana", email: "dana@x.com", startTime: "2026-07-10T14:00:00Z" },
    "operator@voicebuilder.com",
  );
  expect(msg.to).toBe("operator@voicebuilder.com");
  expect(msg.subject).toContain("Dana");
  expect(msg.text).toContain("dana@x.com");
  expect(msg.text).toContain("2026-07-10T14:00:00Z");
});
