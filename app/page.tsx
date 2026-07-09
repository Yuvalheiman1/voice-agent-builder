"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Agent, AssistantConfig, Lead, CallPhase, AgentStatus, OutcomeLabel, CallOutcome } from "@/lib/types";
import { useAgents, useLeads, newId, insertCallLog } from "@/lib/store";
import { VOICES } from "@/lib/assistant-config";
import { getPersona } from "@/lib/agents";
import { pollDecision } from "@/lib/outcome";
import { parseLeadsText, makeLead } from "@/lib/parse-leads";
import { Button, Card, Badge, Checkbox, Input, Field, Textarea, OutcomeBadge } from "./components/ui";
import { IconBot, IconUsers, IconPhone, IconPlus, IconUpload, IconTrash, IconSparkles, IconX, IconChevron } from "./components/icons";
import AgentAvatar from "./components/AgentAvatar";
import ChatBuilder from "./components/ChatBuilder";
import AgentView from "./components/AgentView";
import CallPanel from "./components/CallPanel";

type Toast = { msg: string; tone: "info" | "error" | "success" } | null;
// One in-flight call we're polling. Transient (React state) - never persisted.
type LiveCall = { leadId: string; agentId: string; phase: CallPhase; since: number };
const POLL_MS = 5000;
const MAX_PARALLEL_CAP = 3; // sane demo ceiling (Vapi plan cap ~10 concurrent total)
const CALL_CEILING_MS = 6 * 60 * 1000; // ring/queued this long with no connect → no-answer
const BROWSER_TEST_ID = "lead_browser_test"; // singleton pseudo-lead for in-browser test calls

export default function Dashboard() {
  const agents = useAgents();
  const leads = useLeads();
  const [selAgents, setSelAgents] = useState<Set<string>>(new Set());
  const [selLeads, setSelLeads] = useState<Set<string>>(new Set());
  const [builderOpen, setBuilderOpen] = useState(false);
  const [viewAgent, setViewAgent] = useState<Agent | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [callAgent, setCallAgent] = useState<Agent | null>(null);
  const [liveWebPhase, setLiveWebPhase] = useState<CallPhase | null>(null);
  const [liveCalls, setLiveCalls] = useState<Record<string, LiveCall>>({}); // keyed by callId
  const liveCallsRef = useRef(liveCalls);
  liveCallsRef.current = liveCalls;
  const [tab, setTab] = useState<"agents" | "leads">("agents");
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [calling, setCalling] = useState(false);

  const showToast = (msg: string, tone: NonNullable<Toast>["tone"] = "info") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 4000);
  };

  const agentsError = agents.error;
  const leadsError = leads.error;
  useEffect(() => {
    if (agentsError) showToast(`Agents sync failed: ${agentsError}`, "error");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentsError]);
  useEffect(() => {
    if (leadsError) showToast(`Leads sync failed: ${leadsError}`, "error");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadsError]);

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  async function saveAgent(config: AssistantConfig, personaId?: string) {
    const id = newId("agent");
    agents.add({ id, config, personaId, createdAt: Date.now() });
    showToast("Agent created", "success");
    try {
      const res = await fetch("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (res.ok && data.id) agents.update(id, { vapiId: data.id });
    } catch { /* offline / no key - stays local */ }
  }

  async function callLeads() {
    const agent = agents.items.find((a) => selAgents.has(a.id));
    const chosen = leads.items.filter((l) => selLeads.has(l.id));
    if (!agent || chosen.length === 0) return;
    if (!agent.vapiId) {
      showToast("This agent isn't connected to Vapi yet - add VAPI_API_KEY in Vercel to place real calls.", "error");
      return;
    }
    setCalling(true);
    chosen.forEach((l) => leads.update(l.id, { status: "calling" }));
    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vapiId: agent.vapiId, leads: chosen.map((l) => ({ id: l.id, phone: l.phone })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Call failed");
      const results: { id: string; callId?: string; ok: boolean }[] = data.results ?? [];
      const now = Date.now();
      const ok = results.filter((r) => r.ok && r.callId);
      // Calls that failed to place revert to "new"; successes go live + store callId.
      results.filter((r) => !r.ok).forEach((r) => leads.update(r.id, { status: "new" }));
      if (ok.length) {
        setLiveCalls((m) => {
          const next = { ...m };
          ok.forEach((r) => { next[r.callId!] = { leadId: r.id, agentId: agent.id, phase: "queued", since: now }; });
          return next;
        });
        ok.forEach((r) => leads.update(r.id, {
          status: "calling",
          liveCallId: r.callId,
          claimedBy: agent.id,
        }));
      }
      showToast(`Calling ${ok.length} lead${ok.length > 1 ? "s" : ""} with ${agent.config.name}`, "success");
    } catch (e) {
      chosen.forEach((l) => leads.update(l.id, { status: "new" }));
      showToast((e as Error).message, "error");
    } finally {
      setCalling(false);
    }
  }

  // ── Live-call polling + derivations ─────────────────────────────────────────
  const leadPhase = (leadId: string): CallPhase | undefined =>
    Object.values(liveCalls).find((c) => c.leadId === leadId)?.phase;

  const agentLiveCount = (agentId: string): number =>
    Object.values(liveCalls).filter(
      (c) => c.agentId === agentId && ["queued", "ringing", "on-call", "analyzing"].includes(c.phase),
    ).length;

  const agentStatus = (agentId: string): AgentStatus => {
    if (callAgent?.id === agentId && liveWebPhase && liveWebPhase !== "done") return "on-call";
    return agentLiveCount(agentId) > 0 ? "on-call" : "idle";
  };

  // Resume polling for calls left "calling" from a previous session (after reload).
  useEffect(() => {
    if (!leads.loaded) return;
    const now = Date.now();
    const resume: Record<string, LiveCall> = {};
    leads.items.forEach((l) => {
      if (l.status === "calling" && l.liveCallId) {
        resume[l.liveCallId] = { leadId: l.id, agentId: l.claimedBy ?? "", phase: "queued", since: now };
      }
    });
    if (Object.keys(resume).length) setLiveCalls((m) => ({ ...resume, ...m }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads.loaded]);

  // Poll Vapi for outcomes while any call is in flight. Reads liveCalls via ref so
  // the interval isn't recreated on every phase update - only when the *set* of
  // pending call ids changes (pendingKey).
  const pendingKey = Object.keys(liveCalls).sort().join(",");
  useEffect(() => {
    if (!pendingKey) return;
    const tick = async () => {
      const current = liveCallsRef.current;
      const ids = Object.keys(current);
      if (ids.length === 0) return;
      const now = Date.now();
      let calls: any[] = [];
      try {
        const res = await fetch(`/api/calls/status?ids=${ids.join(",")}`);
        calls = (await res.json()).calls ?? [];
      } catch { return; } // network hiccup - keep pending, retry next tick
      const byId: Record<string, any> = {};
      calls.forEach((c) => { byId[c.callId] = c; });

      // Decide per call in plain data first (pollDecision is pure + tested), then
      // apply lead settlements and the liveCalls update as separate, non-nested setStates.
      const phaseUpdates: Record<string, CallPhase> = {};
      const remove: string[] = [];
      const settle: { leadId: string; agentId: string; patch: Partial<Lead>; outcome?: CallOutcome }[] = [];
      for (const id of ids) {
        const lc = current[id];
        const c = byId[id];
        const elapsed = now - lc.since;
        if (!c || c.error) {
          if (elapsed > CALL_CEILING_MS) {
            settle.push({ leadId: lc.leadId, agentId: lc.agentId, patch: { status: "no-answer", liveCallId: undefined, claimedBy: undefined } });
            remove.push(id);
          }
          continue;
        }
        const d = pollDecision(c, elapsed, now, { connectCeilingMs: CALL_CEILING_MS });
        phaseUpdates[id] = d.phase;
        if (d.kind === "settle") {
          settle.push({ leadId: lc.leadId, agentId: lc.agentId, patch: { status: d.outcome.label, liveCallId: undefined, claimedBy: undefined }, outcome: d.outcome });
          remove.push(id);
        } else if (d.kind === "no-answer") {
          settle.push({ leadId: lc.leadId, agentId: lc.agentId, patch: { status: "no-answer", liveCallId: undefined, claimedBy: undefined } });
          remove.push(id);
        }
      }

      settle.forEach((s) => {
        leads.update(s.leadId, s.patch);
        if (s.outcome) {
          insertCallLog({ outcome: s.outcome, agentId: s.agentId || null, leadId: s.leadId, type: "phone" })
            .then(() => leads.refresh())
            .catch((e) => showToast(`Call log failed: ${(e as Error).message}`, "error"));
        }
      });
      if (remove.length || Object.keys(phaseUpdates).length) {
        setLiveCalls((m) => {
          const next = { ...m };
          for (const id of Object.keys(next)) {
            if (remove.includes(id)) delete next[id];
            else if (phaseUpdates[id]) next[id] = { ...next[id], phase: phaseUpdates[id] };
          }
          return next;
        });
      }
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey]);

  const actionReady = selAgents.size > 0 && selLeads.size > 0;
  const selectedAgentName = useMemo(
    () => agents.items.find((a) => selAgents.has(a.id))?.config.name,
    [agents.items, selAgents],
  );

  return (
    <div className="mx-auto min-h-dvh w-full max-w-6xl px-4 pb-32 pt-5 sm:px-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: "var(--primary)", color: "#fff" }}>
            <IconPhone width={18} height={18} />
          </div>
          <div>
            <div className="text-lg font-bold tracking-tight" style={{ color: "var(--text)" }}>VoiceBuilder</div>
            <div className="text-xs" style={{ color: "var(--text-faint)" }}>Voice AI outreach</div>
          </div>
        </div>
      </header>

      <div className="mb-4 flex gap-1 rounded-[10px] p-1 sm:hidden" style={{ background: "var(--surface-2)" }}>
        {(["agents", "leads"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 rounded-[8px] py-2 text-sm font-medium capitalize transition-colors cursor-pointer"
            style={{ background: tab === t ? "var(--surface)" : "transparent", color: tab === t ? "var(--text)" : "var(--text-muted)", boxShadow: tab === t ? "var(--shadow-sm)" : undefined }}>
            {t} {t === "agents" ? `(${agents.items.length})` : `(${leads.items.length})`}
          </button>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <section className={tab === "agents" ? "block" : "hidden sm:block"}>
          <PanelHeader icon={<IconBot />} title="Agents" count={agents.items.length}
            action={<Button size="sm" onClick={() => setBuilderOpen(true)}><IconPlus width={16} height={16} /> New</Button>} />
          {agents.items.length === 0 ? (
            <EmptyState icon={<IconBot width={26} height={26} />} title="You have no agents yet"
              body="Create your first voice AI agent - describe how it should talk, qualify leads, and book meetings."
              cta={<Button onClick={() => setBuilderOpen(true)}><IconSparkles width={16} height={16} /> Create your first agent</Button>} />
          ) : (
            <div className="space-y-2.5">
              {agents.items.map((a) => (
                <SelectableRow key={a.id} selected={selAgents.has(a.id)} onToggle={() => toggle(selAgents, a.id, setSelAgents)}>
                  <button className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer" onClick={() => setViewAgent(a)}>
                    {(() => { const p = getPersona(a.personaId ?? ""); return p ? <AgentAvatar persona={p} size={44} className="flex-none" /> : null; })()}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium" style={{ color: "var(--text)" }}>{a.config.name}</span>
                        {agentStatus(a.id) === "on-call"
                          ? <Badge tone="live"><span className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--live)" }} /> {agentLiveCount(a.id) > 1 ? `${agentLiveCount(a.id)} calls` : "On a call"}</Badge>
                          : a.active ? <Badge tone="primary">active</Badge>
                          : a.vapiId ? <Badge tone="success">connected</Badge> : <Badge tone="muted">local</Badge>}
                      </span>
                      <span className="block truncate text-xs" style={{ color: "var(--text-faint)" }}>
                        {getPersona(a.personaId ?? "")?.tone ?? VOICES.find((v) => v.id === a.config.voiceId)?.label.split(" - ")[0] ?? a.config.voiceId} · {a.config.qualificationQuestions.length} questions{a.lastOutcome ? ` · last test: ${a.lastOutcome.label}` : ""}
                      </span>
                    </span>
                  </button>
                  {a.vapiId && (
                    <div className="flex flex-none items-center gap-1">
                      {a.active && (
                        <span className="flex items-center gap-0.5 rounded-[8px] px-1 text-xs tabular" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                          <button aria-label="Fewer parallel calls" className="cursor-pointer px-1 py-1"
                            onClick={(e) => { e.stopPropagation(); agents.update(a.id, { maxParallel: Math.max(1, (a.maxParallel ?? 1) - 1) }); }}>−</button>
                          <span aria-label={`Parallel calls: ${a.maxParallel ?? 1}`}>∥ {a.maxParallel ?? 1}</span>
                          <button aria-label="More parallel calls" className="cursor-pointer px-1 py-1"
                            onClick={(e) => { e.stopPropagation(); agents.update(a.id, { maxParallel: Math.min(MAX_PARALLEL_CAP, (a.maxParallel ?? 1) + 1) }); }}>+</button>
                        </span>
                      )}
                      <Button size="sm" variant={a.active ? "danger" : "secondary"}
                        aria-label={a.active ? `Deactivate ${a.config.name}` : `Activate ${a.config.name}`}
                        onClick={(e) => { e.stopPropagation(); agents.update(a.id, { active: !a.active }); }}>
                        {a.active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  )}
                  {a.vapiId && (
                    <IconButton label="Test call" onClick={() => setCallAgent(a)}><IconPhone width={16} height={16} /></IconButton>
                  )}
                  <IconButton label="Delete agent" onClick={() => { agents.remove(a.id); toggle(selAgents, a.id, setSelAgents); }}><IconTrash width={16} height={16} /></IconButton>
                </SelectableRow>
              ))}
            </div>
          )}
        </section>

        <section className={tab === "leads" ? "block" : "hidden sm:block"}>
          <PanelHeader icon={<IconUsers />} title="Leads" count={leads.items.length}
            action={<Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}><IconUpload width={16} height={16} /> Import</Button>} />
          <QuickAddLead onAdd={(name, phone) => leads.add(makeLead(name, phone))} />
          {leads.items.length === 0 ? (
            <div className="mt-3"><EmptyState icon={<IconUsers width={26} height={26} />} title="No leads yet"
              body="Add a number above, or import a CSV/JSON list of leads to start calling." cta={null} /></div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {leads.items.map((l) => {
                const ph = leadPhase(l.id);
                const canExpand = Boolean(l.outcome?.summary || l.outcome?.transcript);
                const open = openLead === l.id;
                const settled = (["booked", "qualified", "not-qualified", "no-answer"] as const).includes(l.status as never);
                return (
                  <div key={l.id}>
                    <SelectableRow selected={selLeads.has(l.id)} onToggle={() => toggle(selLeads, l.id, setSelLeads)}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium" style={{ color: "var(--text)" }}>{l.name}</span>
                          {l.id === BROWSER_TEST_ID && <Badge tone="muted">test</Badge>}
                        </div>
                        <div className="truncate text-xs tabular" style={{ color: "var(--text-faint)" }}>{l.phone}</div>
                      </div>
                      {ph ? <LivePhaseBadge phase={ph} />
                        : settled ? <OutcomeBadge label={l.status as OutcomeLabel} />
                        : <LeadStatusBadge status={l.status} />}
                      {canExpand && (
                        <IconButton label={open ? "Hide details" : "Show details"} onClick={() => setOpenLead(open ? null : l.id)}>
                          <span style={{ display: "inline-flex", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}><IconChevron width={16} height={16} /></span>
                        </IconButton>
                      )}
                      <IconButton label="Delete lead" onClick={() => { leads.remove(l.id); toggle(selLeads, l.id, setSelLeads); }}><IconTrash width={16} height={16} /></IconButton>
                    </SelectableRow>
                    {open && l.outcome && (
                      <div className="mx-1 mt-1 rounded-[10px] px-3 py-2.5 text-sm" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                        {l.outcome.reason && <p className="mb-1 text-xs font-medium" style={{ color: "var(--primary)" }}>{l.outcome.reason}</p>}
                        {l.outcome.summary && <p style={{ color: "var(--text-muted)" }}>{l.outcome.summary}</p>}
                        {l.outcome.transcript && <TranscriptToggle text={l.outcome.transcript} />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {actionReady && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
          <div className="mx-auto max-w-3xl">
            <Card className="flex items-center justify-between gap-3 px-4 py-3" style={{ boxShadow: "var(--shadow-md)", border: "1px solid var(--border-strong)" }}>
              <div className="min-w-0 text-sm">
                <span className="font-semibold" style={{ color: "var(--text)" }}>{selLeads.size}</span>
                <span style={{ color: "var(--text-muted)" }}> lead{selLeads.size > 1 ? "s" : ""} · </span>
                <span className="truncate" style={{ color: "var(--text-muted)" }}>{selectedAgentName}</span>
              </div>
              <Button variant="danger" onClick={callLeads} disabled={calling}>
                <IconPhone width={16} height={16} /> {calling ? "Calling…" : `Call ${selLeads.size}`}
              </Button>
            </Card>
          </div>
        </div>
      )}

      {builderOpen && (
        <ChatBuilder onClose={() => setBuilderOpen(false)} onSave={(config, personaId) => { saveAgent(config, personaId); setBuilderOpen(false); }} />
      )}
      {viewAgent && (
        <AgentView
          agent={viewAgent}
          onClose={() => setViewAgent(null)}
          onDelete={() => { agents.remove(viewAgent.id); setSelAgents((s) => { const n = new Set(s); n.delete(viewAgent.id); return n; }); setViewAgent(null); }}
          onTestCall={() => { setCallAgent(viewAgent); setViewAgent(null); }}
        />
      )}
      {importOpen && (
        <ImportModal onClose={() => setImportOpen(false)} onImport={(ls) => { leads.addMany(ls); setImportOpen(false); showToast(`Imported ${ls.length} lead${ls.length > 1 ? "s" : ""}`, "success"); }} />
      )}
      {callAgent && (
        <CallPanel
          agent={callAgent}
          onClose={() => { setCallAgent(null); setLiveWebPhase(null); }}
          onPhaseChange={setLiveWebPhase}
          onOutcome={(o) => {
            const name = `Browser test · ${callAgent.config.name}`;
            // Surface the in-browser test as a "Browser test" lead; its summary/
            // transcript render from the calls log (derived outcome).
            if (leads.items.some((l) => l.id === BROWSER_TEST_ID)) {
              leads.update(BROWSER_TEST_ID, { name, status: o.label });
            } else {
              leads.add({ id: BROWSER_TEST_ID, name, phone: "in-browser web call", status: o.label, createdAt: Date.now() });
            }
            insertCallLog({ outcome: o, agentId: callAgent.id, leadId: BROWSER_TEST_ID, type: "web" })
              .then(() => { leads.refresh(); agents.refresh(); })
              .catch((e) => showToast(`Call log failed: ${(e as Error).message}`, "error"));
          }}
        />
      )}
      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4" aria-live="polite">
          <div className="rounded-[10px] px-4 py-2.5 text-sm" style={{
            background: "var(--surface)", border: `1px solid ${toast.tone === "error" ? "var(--live)" : toast.tone === "success" ? "var(--success)" : "var(--border-strong)"}`,
            color: "var(--text)", boxShadow: "var(--shadow-md)", maxWidth: 480,
          }}>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}

function PanelHeader({ icon, title, count, action }: { icon: React.ReactNode; title: string; count: number; action: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2" style={{ color: "var(--text)" }}>
        <span style={{ color: "var(--text-muted)" }}>{icon}</span>
        <h2 className="font-semibold">{title}</h2>
        <span className="rounded-full px-2 py-0.5 text-xs tabular" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>{count}</span>
      </div>
      {action}
    </div>
  );
}

function SelectableRow({ selected, onToggle, children }: { selected: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] px-3 py-3 transition-colors duration-150"
      style={{ background: "var(--surface)", border: `1px solid ${selected ? "var(--primary)" : "var(--border)"}`, boxShadow: "var(--shadow-sm)" }}>
      <Checkbox checked={selected} onChange={onToggle} aria-label="Select" />
      {children}
    </div>
  );
}

function IconButton({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button aria-label={label} onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="grid h-9 w-9 flex-none place-items-center rounded-[8px] cursor-pointer transition-colors"
      style={{ color: "var(--text-faint)" }}>{children}</button>
  );
}

function EmptyState({ icon, title, body, cta }: { icon: React.ReactNode; title: string; body: string; cta: React.ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-full" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>{icon}</div>
      <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>{title}</h3>
      <p className="mt-1 max-w-xs text-sm" style={{ color: "var(--text-muted)" }}>{body}</p>
      {cta && <div className="mt-4">{cta}</div>}
    </Card>
  );
}

function LivePhaseBadge({ phase }: { phase: CallPhase }) {
  const dot = <span className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--live)" }} />;
  if (phase === "ringing") return <Badge tone="live">{dot} Ringing…</Badge>;
  if (phase === "on-call") return <Badge tone="live">{dot} On call</Badge>;
  if (phase === "analyzing") return <Badge tone="primary">Analyzing…</Badge>;
  return <Badge tone="primary">Calling…</Badge>; // queued / other in-flight
}

function TranscriptToggle({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const lines = text.split("\n").filter((l) => l.trim());
  return (
    <div className="mt-2">
      <button onClick={() => setOpen((o) => !o)} className="text-xs font-medium cursor-pointer" style={{ color: "var(--primary)" }}>
        {open ? "▾" : "▸"} Transcript ({lines.length} line{lines.length !== 1 ? "s" : ""})
      </button>
      {open && (
        <pre className="mt-1.5 max-h-56 overflow-y-auto whitespace-pre-wrap text-xs" style={{ color: "var(--text-muted)", fontFamily: "inherit" }}>{text}</pre>
      )}
    </div>
  );
}

function LeadStatusBadge({ status }: { status: Lead["status"] }) {
  if (status === "calling") return <Badge tone="live"><span className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--live)" }} /> calling</Badge>;
  if (status === "qualified") return <Badge tone="primary">qualified</Badge>;
  if (status === "booked") return <Badge tone="success">booked</Badge>;
  if (status === "no-answer") return <Badge tone="muted">no answer</Badge>;
  return <Badge tone="muted">new</Badge>;
}

function QuickAddLead({ onAdd }: { onAdd: (name: string, phone: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const submit = () => { if (phone.trim()) { onAdd(name, phone); setName(""); setPhone(""); } };
  return (
    <div className="flex gap-2">
      <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: "0 0 34%" }} />
      <Input placeholder="+1 555 123 4567" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
      <Button size="sm" onClick={submit}><IconPlus width={16} height={16} /></Button>
    </div>
  );
}

function ImportModal({ onClose, onImport }: { onClose: () => void; onImport: (leads: Lead[]) => void }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseLeadsText(text), [text]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(6,9,15,0.55)" }} onClick={onClose}>
      <div className="w-full sm:max-w-lg rounded-t-[18px] sm:rounded-[16px] p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>Import leads</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full cursor-pointer" style={{ color: "var(--text-muted)" }}><IconX /></button>
        </div>
        <label className="mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-sm" style={{ border: "1.5px dashed var(--border-strong)", color: "var(--text-muted)" }}>
          <IconUpload width={16} height={16} /> Choose a .csv or .json file
          <input type="file" accept=".csv,.json,.txt" className="hidden"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
        </label>
        <Field label="…or paste" hint="CSV (name, phone), a JSON array, or one number per line.">
          <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Dana, +972 50 123 4567\nGuy, +972 54 765 4321"} />
        </Field>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>{parsed.length} lead{parsed.length !== 1 ? "s" : ""} detected</span>
          <Button onClick={() => onImport(parsed)} disabled={parsed.length === 0}>Import {parsed.length || ""}</Button>
        </div>
      </div>
    </div>
  );
}
