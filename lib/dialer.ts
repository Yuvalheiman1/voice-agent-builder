import type { Agent, Lead } from "./types";

// Pure dialer decisions - kept out of React so they are unit-tested
// (every past bug lived in untested component glue, not tested modules).

export function claimSlots(
  agents: Agent[],
  liveCounts: Record<string, number>,
): { agentId: string; vapiId: string; slots: number }[] {
  return agents
    .filter((a) => a.active && a.vapiId)
    .map((a) => ({
      agentId: a.id,
      vapiId: a.vapiId as string,
      slots: Math.max(0, (a.maxParallel ?? 1) - (liveCounts[a.id] ?? 0)),
    }))
    .filter((c) => c.slots > 0);
}

export function queueOrder(leads: Lead[]): string[] {
  return leads
    .filter((l) => l.status === "queued")
    .sort((a, b) => (a.queuedAt ?? Infinity) - (b.queuedAt ?? Infinity))
    .map((l) => l.id);
}

export function recoveryActions(leads: Lead[]): {
  resume: { leadId: string; callId: string; agentId: string }[];
  revertToQueue: string[];
} {
  const resume: { leadId: string; callId: string; agentId: string }[] = [];
  const revertToQueue: string[] = [];
  for (const l of leads) {
    if (l.status !== "calling") continue;
    if (l.liveCallId) resume.push({ leadId: l.id, callId: l.liveCallId, agentId: l.claimedBy ?? "" });
    else revertToQueue.push(l.id);
  }
  return { resume, revertToQueue };
}
