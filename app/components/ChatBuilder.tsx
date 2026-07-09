"use client";

import { useEffect, useRef, useState } from "react";
import type { AssistantConfig } from "@/lib/types";
import { PERSONAS, personaToConfig, getPersona, type AgentPersona } from "@/lib/agents";
import { FLOW, applyChip, type Chip } from "@/lib/builder-flow";
import AgentAvatar from "./AgentAvatar";
import VoicePreview from "./VoicePreview";
import { Button, Input } from "./ui";
import { IconX, IconCheck, IconArrowLeft } from "./icons";

type Msg = { role: "ai" | "me"; text: string; chips?: Chip[]; showDone?: boolean };

// Persona-first conversational builder: pick a persona (seeds a complete config),
// then refine by tapping chips (deterministic patches) or typing (→ /api/chat).
export default function ChatBuilder({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (config: AssistantConfig, personaId?: string) => void;
}) {
  const [stage, setStage] = useState<"persona" | "chat">("persona");
  const [personaId, setPersonaId] = useState<string>();
  const [config, setConfig] = useState<AssistantConfig | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [step, setStep] = useState(0); // index into FLOW; === FLOW.length when done
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const chatRef = useRef<HTMLDivElement | null>(null);

  const persona = getPersona(personaId ?? "");
  const done = step >= FLOW.length;
  const last = messages[messages.length - 1];

  useEffect(() => { const c = chatRef.current; if (c) c.scrollTop = c.scrollHeight; }, [messages]);

  function pick(p: AgentPersona) {
    setPersonaId(p.id);
    setConfig(personaToConfig(p));
    setStage("chat");
    setStep(0);
    setMessages([{ role: "ai", text: FLOW[0].ask(p.name), chips: FLOW[0].chips }]);
  }

  function recap(cfg: AssistantConfig): string {
    const n = cfg.qualificationQuestions.length;
    return `Perfect - ${cfg.name} is ready: ${n} qualification question${n !== 1 ? "s" : ""}. Tap Create, or keep refining by typing.`;
  }

  function advance(nextStep: number, name: string, cfg: AssistantConfig) {
    setStep(nextStep);
    if (nextStep < FLOW.length) {
      const s = FLOW[nextStep];
      setMessages((m) => [...m, { role: "ai", text: s.ask(name), chips: s.chips, showDone: s.multi }]);
    } else {
      setMessages((m) => [...m, { role: "ai", text: recap(cfg) }]);
    }
  }

  function onChip(chip: Chip) {
    if (!config || !persona) return;
    const next = applyChip(config, chip);
    setConfig(next);
    setMessages((m) => [...m, { role: "me", text: chip.label }]);
    const cur = FLOW[step];
    if (cur?.multi) {
      setMessages((m) => [...m, { role: "ai", text: `Added. Anything else ${persona.name} should check?`, chips: cur.chips, showDone: true }]);
    } else {
      advance(step + 1, persona.name, next);
    }
  }

  function onDone() {
    if (!persona || !config) return;
    advance(step + 1, persona.name, config);
  }

  async function sendText() {
    const t = text.trim();
    if (!t || !config || !persona || busy) return;
    setText("");
    setMessages((m) => [...m, { role: "me", text: t }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: t, config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setConfig(data.config);
      const cur = FLOW[step];
      setMessages((m) => [...m, { role: "ai", text: data.summary || "Updated.", chips: cur?.chips, showDone: cur?.multi }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "ai", text: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(6,9,15,0.55)" }} onClick={onClose}>
      <div className="flex h-[92dvh] sm:h-auto sm:max-h-[88dvh] w-full sm:max-w-2xl flex-col overflow-hidden rounded-t-[18px] sm:rounded-[16px]"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
        onClick={(e) => e.stopPropagation()}>

        {/* header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex min-w-0 items-center gap-3">
            {stage === "chat" && (
              <button onClick={() => setStage("persona")} aria-label="Back to personas" className="grid h-9 w-9 flex-none place-items-center rounded-full cursor-pointer" style={{ color: "var(--text-muted)" }}>
                <IconArrowLeft />
              </button>
            )}
            {stage === "chat" && persona && <AgentAvatar persona={persona} size={36} className="flex-none" />}
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold" style={{ color: "var(--text)" }}>
                {stage === "persona" ? "Choose your agent" : persona?.name}
              </h2>
              <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                {stage === "persona" ? "Pick a persona - this sets its voice & style." : "Building your agent"}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 flex-none place-items-center rounded-full cursor-pointer" style={{ color: "var(--text-muted)" }}>
            <IconX />
          </button>
        </div>

        {stage === "persona" ? (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-2 gap-3.5">
              {PERSONAS.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => pick(p)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(p); } }}
                  aria-label={`Choose ${p.name} - ${p.tone}`}
                  className="persona-card relative flex flex-col rounded-[20px] p-2 pb-3.5 text-center cursor-pointer focus:outline-none focus-visible:ring-2"
                >
                  <div className="absolute left-3 top-3 z-[3]" onClick={(e) => e.stopPropagation()}>
                    <VoicePreview personaId={p.id} name={p.name} />
                  </div>
                  <AgentAvatar persona={p} className="w-full" />
                  <span className="relative z-[2] mx-auto -mt-[26px] max-w-[90%] rounded-[12px] px-3.5 py-2 text-[13px] font-semibold leading-tight"
                    style={{ background: "var(--ink)", color: "#fff", boxShadow: "0 6px 18px rgba(0,0,0,.22)" }}>
                    {p.name}
                  </span>
                  <span className="mt-2 text-xs font-medium" style={{ color: "var(--primary)" }}>{p.tone}</span>
                  <span className="mt-1.5 text-xs leading-snug" style={{ color: "var(--text-faint)" }}>{p.blurb}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div ref={chatRef} className="cb-chat">
              {messages.map((m, i) => (
                <div key={i} className={`cb-msg ${m.role}`}>
                  {m.role === "ai" && persona && <div className="flex-none self-end"><AgentAvatar persona={persona} size={28} /></div>}
                  <div className="cb-bub">{m.text}</div>
                </div>
              ))}
            </div>

            {(last?.chips?.length || last?.showDone || done) && (
              <div className="cb-chips">
                {last?.chips?.map((c) => (
                  <button key={c.id} type="button" className="cb-chip" onClick={() => onChip(c)}>{c.label}</button>
                ))}
                {last?.showDone && <button type="button" className="cb-chip" onClick={onDone}>Done</button>}
                {done && (
                  <button type="button" className="cb-chip create" onClick={() => config && onSave(config, personaId)}>
                    <IconCheck width={14} height={14} /> Create {persona?.name}
                  </button>
                )}
              </div>
            )}

            <div className="flex gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
              <Input value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendText(); }}
                placeholder="Type anything, or tap a suggestion…" disabled={busy} />
              <Button size="sm" onClick={sendText} disabled={busy || !text.trim()}>{busy ? "…" : "Send"}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
