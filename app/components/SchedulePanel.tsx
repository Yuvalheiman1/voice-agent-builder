"use client";

import { useEffect, useMemo, useState } from "react";
import type { Meeting } from "@/lib/types";
import type { BookingSettings } from "@/lib/schedule";
import { Button, Input } from "./ui";
import { IconX } from "./icons";

// Read-only week grid + working-hours settings. Times render in the BROWSER's
// timezone - the operator is the viewer, and the demo runs in Israel; the
// server-side grid math is the authority either way.

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function slotTimes(s: BookingSettings): string[] {
  const [sh, sm] = s.dayStart.split(":").map(Number);
  const [eh, em] = s.dayEnd.split(":").map(Number);
  const out: string[] = [];
  for (let m = sh * 60 + sm; m + s.meetingMinutes <= eh * 60 + em; m += s.meetingMinutes) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

export default function SchedulePanel({ onClose }: { onClose: () => void }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ dayStart: "", dayEnd: "", meetingMinutes: 30 });

  useEffect(() => {
    Promise.all([fetch("/api/meetings"), fetch("/api/booking-settings")])
      .then(async ([mRes, sRes]) => {
        const m = await mRes.json();
        const s = await sRes.json();
        if (!mRes.ok) throw new Error(m.error || "meetings failed");
        if (!sRes.ok) throw new Error(s.error || "settings failed");
        setMeetings(m.meetings);
        setSettings(s.settings);
        setForm({ dayStart: s.settings.dayStart, dayEnd: s.settings.dayEnd, meetingMinutes: s.settings.meetingMinutes });
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  // Next 7 days, filtered to work days.
  const days = useMemo(() => {
    if (!settings) return [];
    const out: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() + i * DAY_MS);
      if (settings.workDays.includes(d.getDay())) out.push(d);
    }
    return out;
  }, [settings]);

  const byCell = useMemo(() => {
    const m = new Map<string, Meeting>();
    for (const mt of meetings) {
      const d = new Date(mt.startTs);
      m.set(`${d.toDateString()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, mt);
    }
    return m;
  }, [meetings]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/booking-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayStart: form.dayStart, dayEnd: form.dayEnd, meetingMinutes: Number(form.meetingMinutes) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "save failed");
      setSettings(j.settings);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(6,9,15,0.55)" }} onClick={onClose}>
      <div className="flex max-h-[85dvh] w-full flex-col sm:max-w-3xl overflow-auto rounded-t-[18px] sm:rounded-[16px] p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>Schedule</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full cursor-pointer" style={{ color: "var(--text-muted)" }}><IconX /></button>
        </div>

        {error && <p className="mb-3 text-sm" style={{ color: "var(--live)" }}>{error}</p>}
        {!settings && !error && <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>}

        {settings && (
          <>
            <div className="mb-4 flex flex-wrap items-end gap-3 text-sm">
              <label className="flex flex-col gap-1" style={{ color: "var(--text)" }}>Day starts
                <Input type="time" value={form.dayStart} onChange={(e) => setForm({ ...form, dayStart: e.target.value })} className="w-auto" />
              </label>
              <label className="flex flex-col gap-1" style={{ color: "var(--text)" }}>Day ends
                <Input type="time" value={form.dayEnd} onChange={(e) => setForm({ ...form, dayEnd: e.target.value })} className="w-auto" />
              </label>
              <label className="flex flex-col gap-1" style={{ color: "var(--text)" }}>Meeting (min)
                <Input type="number" min={10} max={120} step={5} value={form.meetingMinutes} onChange={(e) => setForm({ ...form, meetingMinutes: Number(e.target.value) })} className="w-20" />
              </label>
              <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save hours"}</Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="p-1 text-left font-medium" style={{ color: "var(--text-faint)" }}> </th>
                    {days.map((d) => (
                      <th key={d.toDateString()} className="p-1 text-left font-medium" style={{ color: "var(--text-faint)" }}>
                        {DAY_NAMES[d.getDay()]} {d.getDate()}/{d.getMonth() + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slotTimes(settings).map((t) => (
                    <tr key={t}>
                      <td className="p-1 font-mono" style={{ color: "var(--text-faint)" }}>{t}</td>
                      {days.map((d) => {
                        const mt = byCell.get(`${d.toDateString()} ${t}`);
                        return (
                          <td key={d.toDateString() + t} className="p-1">
                            {mt ? (
                              <span className="block truncate rounded px-1.5 py-0.5 font-medium" style={{ background: "var(--primary)", color: "var(--on-primary)" }} title={`${mt.leadName} ${mt.leadEmail ?? ""}`}>
                                {mt.leadName || "Booked"}
                              </span>
                            ) : (
                              <span className="block rounded px-1.5 py-0.5" style={{ background: "var(--surface-2)" }}> </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
