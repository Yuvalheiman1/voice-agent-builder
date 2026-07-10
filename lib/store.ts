"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent, CallOutcome, Lead } from "./types";
import { toWirePatch } from "./rows";

// DB-backed list hook (replaces the old localStorage hook - same interface).
// Optimistic writes: state updates instantly, the API call runs behind it;
// on failure we surface `error` and resync from the server. Reads assemble
// derived fields (lead.outcome, agent.lastOutcome) server-side.
function useDbList<T extends { id: string }>(endpoint: string, listKey: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `GET ${endpoint} failed`);
      if (alive.current) { setItems(data[listKey] ?? []); setError(null); }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setLoaded(true);
    }
  }, [endpoint, listKey]);

  useEffect(() => { refresh(); }, [refresh]);

  // Fire a write; on failure surface the error and resync so the optimistic
  // state never silently drifts from the DB.
  const send = useCallback(
    (url: string, method: string, body?: unknown) => {
      fetch(url, {
        method,
        ...(body !== undefined
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
          : {}),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error((await res.json()).error || `${method} ${url} failed`);
        })
        .catch((e) => {
          if (!alive.current) return;
          setError((e as Error).message);
          refresh();
        });
    },
    [refresh],
  );

  const add = useCallback((item: T) => {
    setItems((prev) => [item, ...prev]);
    send(endpoint, "POST", item);
  }, [endpoint, send]);

  const addMany = useCallback((newItems: T[]) => {
    setItems((prev) => [...newItems, ...prev]);
    send(endpoint, "POST", { items: newItems });
  }, [endpoint, send]);

  const update = useCallback((id: string, patch: Partial<T>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    // toWirePatch: JSON.stringify drops undefined, so "clear this field"
    // patches (e.g. { liveCallId: undefined }) must go over the wire as null.
    send(`${endpoint}/${id}`, "PATCH", toWirePatch(patch));
  }, [endpoint, send]);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    send(`${endpoint}/${id}`, "DELETE");
  }, [endpoint, send]);

  return { items, loaded, error, add, addMany, update, remove, refresh };
}

export function useAgents() {
  return useDbList<Agent>("/api/agents", "agents");
}

export function useLeads() {
  return useDbList<Lead>("/api/leads", "leads");
}

// Append a row to the calls log. Fire-and-forget friendly (callers may await
// to refresh derived outcomes right after).
export async function insertCallLog(entry: {
  outcome: CallOutcome;
  agentId: string | null;
  leadId: string | null;
  type: "phone" | "web";
}): Promise<void> {
  const res = await fetch("/api/calls-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error((await res.json()).error || "calls-log insert failed");
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
