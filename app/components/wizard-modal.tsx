"use client";

import { useState } from "react";
import type { AssistantConfig } from "@/lib/types";
import { defaultConfig, mergeConfig, VOICES } from "@/lib/assistant-config";
import { Button, Field, Input, Textarea, Select } from "./ui";
import { IconX, IconArrowLeft, IconArrowRight, IconSparkles, IconCheck } from "./icons";

const STEPS = ["Basics", "Script", "Voice", "Qualify", "Review"] as const;

export default function WizardModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: AssistantConfig;
  onClose: () => void;
  onSave: (config: AssistantConfig) => void;
}) {
  const [config, setConfig] = useState<AssistantConfig>(initial ?? defaultConfig());
  const [step, setStep] = useState(0);
  const [chat, setChat] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatNote, setChatNote] = useState<string>();

  const set = (patch: Partial<AssistantConfig>) => setConfig((c) => mergeConfig(c, patch));

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
            <>
              <Field label="Agent name" hint="Just for you - how it shows in your list.">
                <Input value={config.name} onChange={(e) => set({ name: e.target.value })} placeholder="Sales Rep" />
              </Field>
              <Field label="Opening line" hint="The first thing the agent says when the lead picks up.">
                <Textarea rows={2} value={config.firstMessage} onChange={(e) => set({ firstMessage: e.target.value })} />
              </Field>
            </>
          )}
          {step === 1 && (
            <Field label="How the agent behaves" hint="Its personality and goal on the call.">
              <Textarea rows={7} value={config.systemPrompt} onChange={(e) => set({ systemPrompt: e.target.value })} />
            </Field>
          )}
          {step === 2 && (
            <Field label="Voice" hint="How the agent sounds.">
              <Select value={config.voiceId} onChange={(e) => set({ voiceId: e.target.value })}>
                {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </Select>
            </Field>
          )}
          {step === 3 && (
            <Field label="Qualification questions" hint="One per line. The agent asks these to qualify the lead.">
              <Textarea rows={6} value={config.qualificationQuestions.join("\n")}
                onChange={(e) => set({ qualificationQuestions: e.target.value.split("\n").map((q) => q).filter((q) => q.trim() !== "" || true) })}
                onBlur={(e) => set({ qualificationQuestions: e.target.value.split("\n").map((q) => q.trim()).filter(Boolean) })} />
            </Field>
          )}
          {step === 4 && (
            <div className="space-y-3">
              <Row label="Name" value={config.name} />
              <Row label="Opening" value={config.firstMessage} />
              <Row label="Voice" value={VOICES.find((v) => v.id === config.voiceId)?.label ?? config.voiceId} />
              <Row label="Questions" value={config.qualificationQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")} />
            </div>
          )}

          {/* chat refine */}
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
        </div>

        {/* footer nav */}
        <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" size="sm" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            <IconArrowLeft width={16} height={16} /> {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)}>Next <IconArrowRight width={16} height={16} /></Button>
          ) : (
            <Button onClick={() => onSave(config)}><IconCheck width={16} height={16} /> {initial ? "Save changes" : "Create agent"}</Button>
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
