"use client";

import type { Agent } from "@/lib/types";
import { getPersona } from "@/lib/agents";
import { VOICES } from "@/lib/assistant-config";
import { Button, Badge, OutcomeBadge } from "./ui";
import AgentAvatar from "./AgentAvatar";
import { IconX, IconPhone, IconTrash } from "./icons";

// Read-only agent detail (no editing - the app is create/view/delete).
export default function AgentView({
  agent,
  onClose,
  onDelete,
  onTestCall,
}: {
  agent: Agent;
  onClose: () => void;
  onDelete: () => void;
  onTestCall: () => void;
}) {
  const persona = getPersona(agent.personaId ?? "");
  const voice = VOICES.find((v) => v.id === agent.config.voiceId)?.label ?? agent.config.voiceId;
  const o = agent.lastOutcome;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(6,9,15,0.55)" }} onClick={onClose}>
      <div className="flex h-[88dvh] sm:h-auto sm:max-h-[86dvh] w-full sm:max-w-lg flex-col overflow-hidden rounded-t-[18px] sm:rounded-[16px]"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
        onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex min-w-0 items-center gap-3">
            {persona ? <AgentAvatar persona={persona} size={44} className="flex-none" /> : null}
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold" style={{ color: "var(--text)" }}>{agent.config.name}</h2>
              <div className="mt-0.5">{agent.vapiId ? <Badge tone="success">connected</Badge> : <Badge tone="muted">local</Badge>}</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 flex-none place-items-center rounded-full cursor-pointer" style={{ color: "var(--text-muted)" }}>
            <IconX />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <Row label="Opening line" value={agent.config.firstMessage} />
          <Row label="Voice" value={voice} />
          <Row label="How it behaves" value={agent.config.systemPrompt} />
          <Row label="Qualification questions" value={agent.config.qualificationQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")} />
          {o && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>Last test</div>
              <div className="mt-1 flex items-center gap-2"><OutcomeBadge label={o.label} />{o.durationSec != null && <span className="text-xs tabular" style={{ color: "var(--text-faint)" }}>{o.durationSec}s</span>}</div>
              {o.summary && <p className="mt-1.5 text-sm" style={{ color: "var(--text-muted)" }}>{o.summary}</p>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" size="sm" onClick={onDelete}><IconTrash width={16} height={16} /> Delete</Button>
          {agent.vapiId && <Button onClick={onTestCall}><IconPhone width={16} height={16} /> Test call</Button>}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</div>
      <div className="mt-0.5 whitespace-pre-wrap text-sm" style={{ color: "var(--text)" }}>{value}</div>
    </div>
  );
}
