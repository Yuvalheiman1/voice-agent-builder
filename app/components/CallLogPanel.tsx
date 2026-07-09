"use client";

import { useEffect, useState } from "react";
import type { Agent, Lead } from "@/lib/types";
import type { CallRecord } from "@/lib/rows";
import { OutcomeBadge } from "./ui";
import { IconX, IconChevron } from "./icons";

// Read-only call history from the calls table (newest first, capped at 200
// by the API). Fetched on open - no live polling; close/reopen to refresh.
export default function CallLogPanel({ agents, leads, onClose }: {
  agents: Agent[];
  leads: Lead[];
  onClose: () => void;
}) {
  const [calls, setCalls] = useState<CallRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/calls-log")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load call log");
        setCalls(data.calls ?? []);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.config.name ?? " - ";
  const leadName = (c: CallRecord) =>
    c.type === "web" ? "Browser test" : leads.find((l) => l.id === c.leadId)?.name || leads.find((l) => l.id === c.leadId)?.phone || " - ";
  const when = (ms: number) => new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(6,9,15,0.55)" }} onClick={onClose}>
      <div className="flex max-h-[85dvh] w-full flex-col sm:max-w-2xl rounded-t-[18px] sm:rounded-[16px] p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>Call log {calls ? `(${calls.length})` : ""}</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full cursor-pointer" style={{ color: "var(--text-muted)" }}><IconX /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {error && <p className="text-sm" style={{ color: "var(--live)" }}>{error}</p>}
          {calls && calls.length === 0 && <p className="text-sm" style={{ color: "var(--text-muted)" }}>No calls yet - activate an agent with queued leads, or run a browser test call.</p>}
          {(calls ?? []).map((c) => {
            const expanded = open === c.id;
            const canExpand = Boolean(c.summary || c.transcript);
            return (
              <div key={c.id} className="rounded-[12px] px-3 py-2.5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{agentName(c.agentId)} → {leadName(c)}</div>
                    <div className="text-xs tabular" style={{ color: "var(--text-faint)" }}>
                      {when(c.at)}{c.durationSec ? ` · ${Math.round(c.durationSec)}s` : ""} · {c.type}
                    </div>
                  </div>
                  <OutcomeBadge label={c.label} />
                  {canExpand && (
                    <button aria-label={expanded ? "Hide call details" : "Show call details"} onClick={() => setOpen(expanded ? null : c.id)}
                      className="grid h-8 w-8 flex-none place-items-center cursor-pointer" style={{ color: "var(--text-faint)" }}>
                      <span style={{ display: "inline-flex", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }}><IconChevron width={16} height={16} /></span>
                    </button>
                  )}
                </div>
                {expanded && (
                  <div className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                    {c.reason && <p className="mb-1 text-xs font-medium" style={{ color: "var(--primary)" }}>{c.reason}</p>}
                    {c.summary && <p>{c.summary}</p>}
                    {c.transcript && <pre className="mt-1.5 max-h-56 overflow-y-auto whitespace-pre-wrap text-xs" style={{ fontFamily: "inherit" }}>{c.transcript}</pre>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
