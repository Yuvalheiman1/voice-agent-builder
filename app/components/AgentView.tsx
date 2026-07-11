"use client";

import { useState } from "react";
import type { Agent, AssistantConfig } from "@/lib/types";
import { getPersona } from "@/lib/agents";
import { VOICES } from "@/lib/assistant-config";
import { normalizeDraft, LIMITS } from "@/lib/agent-edit";
import { Button, Badge, OutcomeBadge, Input, Textarea, Select, Checkbox } from "./ui";
import AgentAvatar from "./AgentAvatar";
import { IconX, IconPhone, IconTrash, IconPlus } from "./icons";

// Editable agent settings: every field is a form input; Save validates via
// normalizeDraft (pure, tested) then persists + re-pushes to Vapi upstream.
export default function AgentView({
  agent,
  onClose,
  onDelete,
  onTestCall,
  onSaveEdit,
}: {
  agent: Agent;
  onClose: () => void;
  onDelete: () => void;
  onTestCall: () => void;
  onSaveEdit: (config: AssistantConfig) => void;
}) {
  const persona = getPersona(agent.personaId ?? "");
  const [draft, setDraft] = useState<AssistantConfig>({
    ...agent.config,
    qualificationQuestions: [...agent.config.qualificationQuestions],
  });
  const [errors, setErrors] = useState<string[]>([]);
  const o = agent.lastOutcome;

  const dirty = JSON.stringify(draft) !== JSON.stringify(agent.config);
  const patch = (p: Partial<AssistantConfig>) => setDraft((d) => ({ ...d, ...p }));
  const setQuestion = (i: number, value: string) =>
    patch({ qualificationQuestions: draft.qualificationQuestions.map((q, j) => (j === i ? value : q)) });

  const save = () => {
    const r = normalizeDraft(draft);
    if (!r.ok) { setErrors(r.errors); return; }
    setErrors([]);
    onSaveEdit(r.config);
  };

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
          <Labeled label="Name">
            <Input value={draft.name} maxLength={LIMITS.name} aria-label="Agent name"
              onChange={(e) => patch({ name: e.target.value })} />
          </Labeled>
          <Labeled label="Opening line">
            <Textarea rows={2} value={draft.firstMessage} maxLength={LIMITS.firstMessage} aria-label="Opening line"
              onChange={(e) => patch({ firstMessage: e.target.value })} />
          </Labeled>
          <Labeled label="Voice">
            <Select value={draft.voiceId} aria-label="Voice" onChange={(e) => patch({ voiceId: e.target.value })}>
              {!VOICES.some((v) => v.id === draft.voiceId) && (
                <option value={draft.voiceId}>{draft.voiceId} (custom)</option>
              )}
              {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </Select>
          </Labeled>
          <Labeled label="How it behaves">
            <Textarea rows={10} value={draft.systemPrompt} maxLength={LIMITS.systemPrompt} aria-label="How it behaves"
              onChange={(e) => patch({ systemPrompt: e.target.value })} />
          </Labeled>
          <Labeled label="Qualification questions">
            <div className="space-y-2">
              {draft.qualificationQuestions.map((q, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={q} maxLength={LIMITS.question} aria-label={`Question ${i + 1}`}
                    onChange={(e) => setQuestion(i, e.target.value)} />
                  <button aria-label={`Remove question ${i + 1}`}
                    onClick={() => patch({ qualificationQuestions: draft.qualificationQuestions.filter((_, j) => j !== i) })}
                    className="grid h-9 w-9 flex-none place-items-center rounded-[8px] cursor-pointer" style={{ color: "var(--text-faint)" }}>
                    <IconX width={16} height={16} />
                  </button>
                </div>
              ))}
              <Button size="sm" variant="secondary"
                disabled={draft.qualificationQuestions.length >= LIMITS.maxQuestions}
                onClick={() => patch({ qualificationQuestions: [...draft.qualificationQuestions, ""] })}>
                <IconPlus width={14} height={14} /> Add question
              </Button>
            </div>
          </Labeled>
          <label className="flex cursor-pointer items-center gap-2.5">
            <Checkbox checked={draft.booking !== false} aria-label="Books meetings"
              onChange={() => patch({ booking: draft.booking === false })} />
            <span className="text-sm" style={{ color: "var(--text)" }}>Books meetings when a lead is a good fit</span>
          </label>

          {o && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>Last test</div>
              <div className="mt-1 flex items-center gap-2"><OutcomeBadge label={o.label} />{o.durationSec != null && <span className="text-xs tabular" style={{ color: "var(--text-faint)" }}>{o.durationSec}s</span>}</div>
              {o.summary && <p className="mt-1.5 text-sm" style={{ color: "var(--text-muted)" }}>{o.summary}</p>}
            </div>
          )}
        </div>

        {errors.length > 0 && (
          <ul className="px-5 py-2 text-sm" style={{ color: "var(--live)", borderTop: "1px solid var(--border)" }} aria-live="polite">
            {errors.map((e) => <li key={e}>• {e}</li>)}
          </ul>
        )}

        <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" size="sm" onClick={onDelete}><IconTrash width={16} height={16} /> Delete</Button>
          <div className="flex items-center gap-2">
            {agent.vapiId && <Button variant="secondary" onClick={onTestCall}><IconPhone width={16} height={16} /> Test call</Button>}
            <Button onClick={save} disabled={!dirty}>Save</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</div>
      {children}
    </div>
  );
}
