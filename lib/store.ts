"use client";

import { useCallback, useEffect, useState } from "react";
import type { Agent, Lead } from "./types";

// A tiny localStorage-backed list hook. Persistence layer for the demo so the
// whole UX works on the deployed URL without any backend/DB. Swappable for a
// hosted DB (Turso) later without touching the components.
function useLocalList<T extends { id: string }>(key: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* ignore corrupt storage */
    }
    setLoaded(true);
  }, [key]);

  // Persist whenever items change (after initial load).
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch {
      /* storage full / unavailable - keep in-memory */
    }
  }, [key, items, loaded]);

  const add = useCallback((item: T) => setItems((prev) => [item, ...prev]), []);
  const addMany = useCallback((newItems: T[]) => setItems((prev) => [...newItems, ...prev]), []);
  const update = useCallback(
    (id: string, patch: Partial<T>) =>
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it))),
    [],
  );
  const remove = useCallback((id: string) => setItems((prev) => prev.filter((it) => it.id !== id)), []);

  return { items, loaded, add, addMany, update, remove };
}

export function useAgents() {
  return useLocalList<Agent>("voicebuilder.agents");
}

export function useLeads() {
  return useLocalList<Lead>("voicebuilder.leads");
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
