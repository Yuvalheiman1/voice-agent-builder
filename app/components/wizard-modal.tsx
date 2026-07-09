"use client";

import { useState } from "react";
import type { AssistantConfig } from "@/lib/types";
import { defaultConfig, mergeConfig, VOICES } from "@/lib/assistant-config";
import { PERSONAS, personaToConfig, type AgentPersona } from "@/lib/agents";
import { Button, Field, Input, Textarea, Select } from "./ui";
import AgentAvatar from "./AgentAvatar";
import { IconX, IconArrowLeft, IconArrowRight, IconSparkles, IconCheck, IconPlay } from "./icons";

const STEPS = ["Persona", "Basics", "Script", "Voice", "Qualify", "Review"] as const;

export default function WizardModal({
  initial,
  initialPersonaId,
  onClose,
  onSave,
}: {
  initial?: AssistantConfig;
  initialPersonaId?: string;
  onClose: () => void;
  onSave: (config: AssistantConfig, personaId?: string) => void;
}) {
  const [config, setConfig] = useState<AssistantConfig>(initial ?? defaultConfig());
  const [personaId, setPersonaId] = useState<string | undefined>(initialPersonaId);
  const [step, setStep] = useState(0);
  const [chat, setChat] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatNote, setChatNote] = useState<string>();

  const set = (patch: Partial<AssistantConfig>) => setConfig((c) => mergeConfig(c, patch));

  // Picking a persona seeds the whole config (name, opening, prompt, voice, questions)
  // and records personaId; later steps stay fully editable.
  const pickPersona = (p: AgentPersona) => {
    setConfig(personaToConfig(p));
    setPersonaId(p.id);
    setStep(1);
  };

  async function refine() {
    if (!chat.trim()) return;
    setChatBusy(true);
    setChatNote(undefined);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: chat, config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setConfig(data.config);
      setChatNote(data.summary || "Updated.");
      setChat("");
    } catch (e) {
      setChatNote((e as Error).message);
    } finally {
      setChatBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(6,9,15,0.55)" }} onClick={onClose}>
      <div
        className="flex h-[92dvh] sm:h-auto sm:max-h-[88dvh] w-full sm:max-w-2xl flex-col overflow-hidden rounded-t-[18px] sm:rounded-[16px]"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header + stepper */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>
              {initial ? "Edit agent" : "Create your agent"}
            </h2>
            <p className="text-xs" style={{ color: "var(--text-faint)" }}>Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full cursor-pointer" style={{ color: "var(--text-muted)" }}>
            <IconX />
          </button>
        </div>
        <div className="flex gap-1.5 px-5 py-3">
          {STEPS.map((s, i) => (
            <div key={s} className="h-1.5 flex-1 rounded-full transition-colors duration-200"
              style={{ background: i <= step ? "var(--primary)" : "var(--surface-2)" }} />
          ))}
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {step === 0 && (
            <div>
              <p className="mb-3 text-sm" style={{ color: "var(--text-muted)" }}>
                Pick who your agent becomes - this seeds its name, opening line, personality and voice. You can tweak everything after.
              </p>
              <div className="grid grid-cols-2 gap-3.5">
                {PERSONAS.map((p, i) => {
                  const selected = p.id === personaId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickPersona(p)}
                      aria-pressed={selected}
                      aria-label={`Choose ${p.name} - ${p.tone}`}
                      style={{ animationDelay: `${i * 45}ms` }}
                      className="persona-card relative flex flex-col rounded-[20px] p-2 pb-3.5 text-center cursor-pointer focus:outline-none focus-visible:ring-2"
                    >
                      {selected && (
                        <span className="absolute right-3 top-3 z-[3] grid h-[26px] w-[26px] place-items-center rounded-full"
                          style={{ background: "var(--primary)", color: "var(--on-primary)", boxShadow: "0 4px 12px rgba(109,40,217,.4)" }}>
                          <IconCheck width={15} height={15} />
                        </span>
                      )}
                      <AgentAvatar persona={p} className="w-full" />
                      <span className="relative z-[2] mx-auto -mt-[26px] max-w-[90%] rounded-[12px] px-3.5 py-2 text-[13px] font-semibold leading-tight"
                        style={{ background: "var(--ink)", color: "#fff", boxShadow: "0 6px 18px rgba(0,0,0,.22)" }}>
                        {p.name}
                      </span>
                      <span className="mt-2 flex items-center justify-center gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                        <IconPlay width={11} height={11} /> {p.tone}
                      </span>
                      <span className="mt-1.5 text-xs leading-snug" style={{ color: "var(--text-faint)" }}>{p.blurb}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {step === 1 && (
            <>
              <Field label="Agent name" hint="Just for you - how it shows in your list.">
                <Input value={config.name} onChange={(e) => set({ name: e.target.value })} placeholder="Sales Rep" />
              </Field>
              <Field label="Opening line" hint="The first thing the agent says when the lead picks up.">
                <Textarea rows={2} value={config.firstMessage} onChange={(e) => set({ firstMessage: e.target.value })} />
              </Field>
            </>
          )}
          {step === 2 && (
            <Field label="How the agent behaves" hint="Its personality and goal on the call.">
              <Textarea rows={7} value={config.systemPrompt} onChange={(e) => set({ systemPrompt: e.target.value })} />
            </Field>
          )}
          {step === 3 && (
            <Field label="Voice" hint="How the agent sounds.">
              <Select value={config.voiceId} onChange={(e) => set({ voiceId: e.target.value })}>
                {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </Select>
            </Field>
          )}
          {step === 4 && (
            <Field label="Qualification questions" hint="One per line. The agent asks these to qualify the lead.">
              <Textarea rows={6} value={config.qualificationQuestions.join("\n")}
                onChange={(e) => set({ qualificationQuestions: e.target.value.split("\n").map((q) => q).filter((q) => q.trim() !== "" || true) })}
                onBlur={(e) => set({ qualificationQuestions: e.target.value.split("\n").map((q) => q.trim()).filter(Boolean) })} />
            </Field>
          )}
          {step === 5 && (
            <div className="space-y-3">
              <Row label="Name" value={config.name} />
              <Row label="Opening" value={config.firstMessage} />
              <Row label="Voice" value={VOICES.find((v) => v.id === config.voiceId)?.label ?? config.voiceId} />
              <Row label="Questions" value={config.qualificationQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")} />
            </div>
          )}

          {/* chat refine - hidden on the persona-pick step */}
          {step > 0 && (
          <div className="rounded-[12px] p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--primary)" }}>
              <IconSparkles width={16} height={16} /> Refine by chat
            </div>
            <div className="flex gap-2">
              <Input value={chat} onChange={(e) => setChat(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") refine(); }}
                placeholder='e.g. "make it warmer and add a budget question"' />
              <Button size="sm" onClick={refine} disabled={chatBusy || !chat.trim()}>
                {chatBusy ? "…" : "Apply"}
              </Button>
            </div>
            {chatNote && <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>{chatNote}</p>}
          </div>
          )}
        </div>

        {/* footer nav */}
        <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" size="sm" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            <IconArrowLeft width={16} height={16} /> {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={step === 0 && !initial && !personaId}>
              Next <IconArrowRight width={16} height={16} />
            </Button>
          ) : (
            <Button onClick={() => onSave(config, personaId)}><IconCheck width={16} height={16} /> {initial ? "Save changes" : "Create agent"}</Button>
          )}
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
