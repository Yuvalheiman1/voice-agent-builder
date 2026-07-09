"use client";

import { useEffect, useRef, useState } from "react";
import Vapi from "@vapi-ai/web";
import type { Agent } from "@/lib/types";
import { getPersona } from "@/lib/agents";
import { Button } from "./ui";
import AgentAvatar from "./AgentAvatar";
import { IconPhone, IconX } from "./icons";

type Line = { role: "assistant" | "user"; text: string };
type Status = "idle" | "connecting" | "live" | "ended" | "error";

export default function CallPanel({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const vapiRef = useRef<Vapi | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>();
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!key) {
      setError("NEXT_PUBLIC_VAPI_PUBLIC_KEY is not set");
      setStatus("error");
      return;
    }
    const vapi = new Vapi(key);
    vapiRef.current = vapi;
    vapi.on("call-start", () => setStatus("live"));
    vapi.on("call-end", () => setStatus("ended"));
    vapi.on("error", (e: unknown) => {
      setError(String((e as Error)?.message ?? e));
      setStatus("error");
    });
    vapi.on("message", (m: any) => {
      if (m?.type === "transcript" && m?.transcriptType === "final") {
        setLines((ls) => [...ls, { role: m.role === "user" ? "user" : "assistant", text: m.transcript }]);
      }
    });
    return () => {
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
    vapiRef.current?.start(agent.vapiId);
  };
  const stop = () => vapiRef.current?.stop();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(6,9,15,0.55)" }} onClick={onClose}>
      <div className="flex h-[80dvh] sm:h-auto sm:max-h-[85dvh] w-full sm:max-w-md flex-col overflow-hidden rounded-t-[18px] sm:rounded-[16px]"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex min-w-0 items-center gap-3">
            {(() => { const p = getPersona(agent.personaId ?? ""); return p ? <AgentAvatar persona={p} size={40} className="flex-none" /> : null; })()}
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
          {lines.length === 0 && status !== "error" && (
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
            <Button onClick={start} disabled={!agent.vapiId}><IconPhone width={16} height={16} /> Start call</Button>
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
