"use client";

import type { EventType } from "./log";

// Client-side analytics: fire-and-forget POSTs to /api/events. Never awaited,
// never throws - a failed log line must not affect the UI.

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem("voicebuilder.session");
  if (!id) {
    id = `s_${crypto.randomUUID().slice(0, 8)}`;
    sessionStorage.setItem("voicebuilder.session", id);
  }
  return id;
}

export function track(
  type: EventType,
  fields?: {
    agentId?: string; leadId?: string; callId?: string;
    ok?: boolean; error?: string; data?: Record<string, unknown>;
  },
): void {
  try {
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, sessionId: getSessionId(), ...fields }),
    }).catch(() => {});
  } catch {
    /* never break the UI over analytics */
  }
}
