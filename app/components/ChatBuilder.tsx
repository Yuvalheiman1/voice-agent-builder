"use client";

import { useEffect, useRef, useState } from "react";
import type { AssistantConfig } from "@/lib/types";
import { PERSONAS, personaToConfig, getPersona, type AgentPersona } from "@/lib/agents";
import type { ChatTurn } from "@/lib/builder-chat";
import { track, getSessionId } from "@/lib/client-log";
import AgentAvatar from "./AgentAvatar";
import VoicePreview from "./VoicePreview";
import { Button, Input } from "./ui";
import { IconX, IconCheck, IconArrowLeft } from "./icons";

type Msg = { role: "ai" | "me"; text: string; err?: boolean };

// Persona-first conversational builder: pick a persona (seeds a complete,
// always-valid config), then the LLM PLAYS that persona - it interviews the
// operator, updates the config each turn and suggests the next tappable chips.
// Deterministic parts: persona pick and Create (save). Everything else is LLM.
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
  const [chips, setChips] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const chatRef = useRef<HTMLDivElement | null>(null);
  // Stale-response guard: each request takes a ticket; a response whose ticket
  // is no longer current (user switched persona mid-flight) is discarded.
  const reqIdRef = useRef(0);

  const persona = getPersona(personaId ?? "");

  useEffect(() => { const c = chatRef.current; if (c) c.scrollTop = c.scrollHeight; }, [messages, busy]);

  // One path for everything: POST the full history + config; the persona
  // replies, returns the updated config and the next suggested chips.
  // `source` (intro|chip|text) rides along for analytics - the server logs the turn.
  async function callApi(history: Msg[], cfg: AssistantConfig, pid: string, source: "intro" | "chip" | "text") {
    const rid = ++reqIdRef.current;
    setBusy(true);
    try {
      // Error bubbles are UI-only - never send them to the LLM as persona speech.
      const turns: ChatTurn[] = history
        .filter((m) => !m.err)
        .map((m) => ({ role: m.role === "me" ? "user" : "assistant", text: m.text }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaId: pid, messages: turns, config: cfg,
          sessionId: getSessionId(), turnIndex: turns.length, source,
        }),
      });
      const data = await res.json();
      if (rid !== reqIdRef.current) return; // stale - a newer request superseded this one
      if (!res.ok) throw new Error(data.error || "Request failed");
      setConfig(data.config);
      setMessages((m) => [...m, { role: "ai", text: data.reply }]);
      setChips(Array.isArray(data.chips) ? data.chips : []);
    } catch (e) {
      if (rid !== reqIdRef.current) return;
      // Keep the previous chips so the operator isn't stranded; typing still works.
      setMessages((m) => [...m, { role: "ai", text: (e as Error).message, err: true }]);
    } finally {
      if (rid === reqIdRef.current) setBusy(false);
    }
  }

  function pick(p: AgentPersona) {
    const seeded = personaToConfig(p);
    setPersonaId(p.id);
    setConfig(seeded);
    setStage("chat");
    setMessages([]);
    setChips([]);
    track("builder.persona_picked", { data: { personaId: p.id } });
    callApi([], seeded, p.id, "intro"); // empty history → the persona introduces itself
  }

  function send(raw: string, source: "chip" | "text" = "text") {
    const t = raw.trim();
    if (!t || !config || !personaId || busy) return;
    setText("");
    setChips([]);
    const next: Msg[] = [...messages, { role: "me", text: t }];
    setMessages(next);
    callApi(next, config, personaId, source);
  }

  // Analytics: fired when the operator leaves a chat without creating the agent.
  function trackAbandon() {
    if (stage !== "chat") return;
    track("builder.abandoned", {
      data: { personaId, lastTurnIndex: messages.filter((m) => m.role === "ai" && !m.err).length - 1 },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(6,9,15,0.55)" }} onClick={() => { trackAbandon(); onClose(); }}>
      <div className="flex h-[92dvh] sm:h-auto sm:max-h-[88dvh] w-full sm:max-w-2xl flex-col overflow-hidden rounded-t-[18px] sm:rounded-[16px]"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
        onClick={(e) => e.stopPropagation()}>

        {/* header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex min-w-0 items-center gap-3">
            {stage === "chat" && (
              <button onClick={() => { trackAbandon(); setStage("persona"); }} aria-label="Back to personas" className="grid h-9 w-9 flex-none place-items-center rounded-full cursor-pointer" style={{ color: "var(--text-muted)" }}>
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
          <button onClick={() => { trackAbandon(); onClose(); }} aria-label="Close" className="grid h-9 w-9 flex-none place-items-center rounded-full cursor-pointer" style={{ color: "var(--text-muted)" }}>
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
            {config && (
              // Live agent card: the generated config, visible + flashing on every
              // change - "you describe it, the system builds it" made demonstrable.
              <div key={JSON.stringify(config)} className="cb-live">
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{config.name}</span>
                <span>·</span>
                <span>{config.qualificationQuestions.length} question{config.qualificationQuestions.length !== 1 ? "s" : ""}</span>
                <span>·</span>
                <span style={config.booking !== false ? { color: "var(--success)", fontWeight: 500 } : undefined}>
                  {config.booking !== false ? "Books meetings ✓" : "Qualify only"}
                </span>
                <span className="cb-live-open">“{config.firstMessage}”</span>
              </div>
            )}
            <div ref={chatRef} className="cb-chat">
              {messages.map((m, i) => (
                <div key={i} className={`cb-msg ${m.role}`}>
                  {m.role === "ai" && persona && <div className="flex-none self-end"><AgentAvatar persona={persona} size={28} /></div>}
                  <div className="cb-bub">{m.text}</div>
                </div>
              ))}
              {busy && persona && (
                <div className="cb-msg ai">
                  <div className="flex-none self-end"><AgentAvatar persona={persona} size={28} /></div>
                  <div className="cb-bub">…</div>
                </div>
              )}
            </div>

            <div className="cb-chips">
              {chips.map((c) => (
                <button key={c} type="button" className="cb-chip" disabled={busy} onClick={() => send(c, "chip")}>{c}</button>
              ))}
              <button type="button" className="cb-chip create" disabled={busy || !config}
                onClick={() => {
                  if (!config) return;
                  track("builder.created", { data: {
                    personaId,
                    turns: messages.filter((m) => m.role === "me").length,
                    booking: config.booking !== false,
                    questions: config.qualificationQuestions.length,
                  } });
                  onSave(config, personaId);
                }}>
                <IconCheck width={14} height={14} /> Create {persona?.name}
              </button>
            </div>

            <div className="flex gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
              <Input value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") send(text); }}
                placeholder="Type anything, or tap a suggestion…" disabled={busy} />
              <Button size="sm" onClick={() => send(text)} disabled={busy || !text.trim()}>{busy ? "…" : "Send"}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
