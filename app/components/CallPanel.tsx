"use client";

import { useEffect, useRef, useState } from "react";
import Vapi from "@vapi-ai/web";
import type { Agent, CallOutcome, CallPhase } from "@/lib/types";
import { getPersona } from "@/lib/agents";
import { reduceWebMessage, labelFrom } from "@/lib/outcome";
import { Button, OutcomeBadge } from "./ui";
import AgentAvatar from "./AgentAvatar";
import { IconPhone, IconX } from "./icons";

type Line = { role: "assistant" | "user"; text: string };
type Status = "idle" | "connecting" | "live" | "ended" | "error";

export default function CallPanel({
  agent,
  onClose,
  onOutcome,
  onPhaseChange,
}: {
  agent: Agent;
  onClose: () => void;
  onOutcome?: (o: CallOutcome) => void;
  onPhaseChange?: (p: CallPhase) => void;
}) {
  const vapiRef = useRef<Vapi | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>();
  const [lines, setLines] = useState<Line[]>([]);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);

  // Refs so the once-registered Vapi listeners never read stale state/props.
  const accRef = useRef<Partial<CallOutcome>>({});
  const linesRef = useRef<Line[]>([]);
  const startedRef = useRef(false);
  const finalizedRef = useRef(false);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalizeRef = useRef<(report?: any) => void>(() => {});
  const phaseRef = useRef<((p: CallPhase) => void) | undefined>(onPhaseChange);
  phaseRef.current = onPhaseChange;
  const outcomeCbRef = useRef<((o: CallOutcome) => void) | undefined>(onOutcome);
  outcomeCbRef.current = onOutcome;

  // Build the outcome exactly once, from accumulated web messages + transcript lines.
  finalizeRef.current = (report?: any) => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    if (fallbackRef.current) { clearTimeout(fallbackRef.current); fallbackRef.current = null; }
    const p = report ? reduceWebMessage(accRef.current, report) : accRef.current;
    const transcript =
      p.transcript ??
      linesRef.current.map((l) => `${l.role === "user" ? "You" : agent.config.name}: ${l.text}`).join("\n");
    const o: CallOutcome = {
      label: labelFrom(Boolean(p.booked), Boolean(p.qualified), p.endedReason),
      booked: Boolean(p.booked),
      qualified: Boolean(p.qualified),
      reason: p.reason,
      summary: p.summary,
      transcript: transcript || undefined,
      endedReason: p.endedReason,
      durationSec: p.durationSec,
      at: Date.now(),
    };
    setOutcome(o);
    outcomeCbRef.current?.(o);
    phaseRef.current?.("done");
  };

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!key) {
      setError("NEXT_PUBLIC_VAPI_PUBLIC_KEY is not set");
      setStatus("error");
      return;
    }
    const vapi = new Vapi(key);
    vapiRef.current = vapi;
    vapi.on("call-start", () => { setStatus("live"); phaseRef.current?.("on-call"); });
    vapi.on("call-end", () => {
      setStatus("ended");
      phaseRef.current?.("analyzing");
      // If no end-of-call-report arrives, finalize with what we have.
      fallbackRef.current = setTimeout(() => finalizeRef.current?.(), 8000);
    });
    vapi.on("error", (e: unknown) => {
      setError(String((e as Error)?.message ?? e));
      setStatus("error");
    });
    vapi.on("message", (m: any) => {
      if (m?.type === "transcript" && m?.transcriptType === "final") {
        const line: Line = { role: m.role === "user" ? "user" : "assistant", text: m.transcript };
        linesRef.current = [...linesRef.current, line];
        setLines((ls) => [...ls, line]);
      }
      accRef.current = reduceWebMessage(accRef.current, m);
      if (m?.type === "end-of-call-report") finalizeRef.current?.(m);
    });
    return () => {
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
      // Panel closed before the end-of-call report / fallback: record the outcome
      // now (with whatever we have) so the "Browser test" lead isn't lost.
      if (startedRef.current && !finalizedRef.current) finalizeRef.current?.();
      try { vapi.stop(); } catch { /* already stopped */ }
    };
  }, []);

  const start = () => {
    if (!agent.vapiId) {
      setError("This agent isn't saved to Vapi yet.");
      setStatus("error");
      return;
    }
    setStatus("connecting");
    setError(undefined);
    setLines([]);
    setOutcome(null);
    linesRef.current = [];
    accRef.current = {};
    finalizedRef.current = false;
    startedRef.current = true;
    phaseRef.current?.("ringing");
    vapiRef.current?.start(agent.vapiId);
  };
  const stop = () => vapiRef.current?.stop();

  const persona = getPersona(agent.personaId ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(6,9,15,0.55)" }} onClick={onClose}>
      <div className="flex h-[80dvh] sm:h-auto sm:max-h-[85dvh] w-full sm:max-w-md flex-col overflow-hidden rounded-t-[18px] sm:rounded-[16px]"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex min-w-0 items-center gap-3">
            {persona ? <AgentAvatar persona={persona} size={40} className="flex-none" /> : null}
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold" style={{ color: "var(--text)" }}>Test call · {agent.config.name}</h2>
              <p className="text-xs" style={{ color: "var(--text-faint)" }}>In-browser web call</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full cursor-pointer" style={{ color: "var(--text-muted)" }}>
            <IconX />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <StatusBadge status={status} />
          {error && <p className="mt-2 text-sm" style={{ color: "var(--live)" }}>{error}</p>}

          {outcome && (
            <div className="mt-3 rounded-[12px] p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2">
                <OutcomeBadge label={outcome.label} />
                {outcome.durationSec != null && (
                  <span className="text-xs tabular" style={{ color: "var(--text-faint)" }}>{outcome.durationSec}s</span>
                )}
              </div>
              {outcome.summary
                ? <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{outcome.summary}</p>
                : <p className="mt-2 text-sm" style={{ color: "var(--text-faint)" }}>Summary unavailable.</p>}
            </div>
          )}

          {lines.length === 0 && status !== "error" && !outcome && (
            <p className="mt-3 text-sm" style={{ color: "var(--text-faint)" }}>
              Press Start, allow your mic, and say hello - {agent.config.name} will greet you.
            </p>
          )}
          <div className="mt-4 space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="text-sm" style={{ color: l.role === "user" ? "var(--text)" : "var(--text-muted)" }}>
                <span className="font-medium">{l.role === "user" ? "You" : agent.config.name}:</span> {l.text}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          {status === "live" || status === "connecting" ? (
            <Button variant="danger" onClick={stop}><IconPhone width={16} height={16} /> End call</Button>
          ) : (
            <Button onClick={start} disabled={!agent.vapiId}><IconPhone width={16} height={16} /> {outcome ? "Call again" : "Start call"}</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; color: string }> = {
    idle: { label: "Ready", color: "var(--text-muted)" },
    connecting: { label: "Connecting…", color: "var(--primary)" },
    live: { label: "● On call", color: "var(--live)" },
    ended: { label: "Call ended", color: "var(--text-muted)" },
    error: { label: "Error", color: "var(--live)" },
  };
  const s = map[status];
  return <span className="text-sm font-medium" style={{ color: s.color }}>{s.label}</span>;
}
