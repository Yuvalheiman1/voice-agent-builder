"use client";

import { useEffect, useRef, useState } from "react";
import { IconPlay } from "./icons";

// Module-level so only one persona sample plays at a time across all cards.
let current: HTMLAudioElement | null = null;

/**
 * ▶ "Hear voice" button for a persona card. Plays /agents/<id>-sample.mp3.
 * Samples are dropped in by the operator (see public/agents/VOICE-SAMPLES.md);
 * a missing file just disables the button - never a crash.
 */
export default function VoicePreview({ personaId, name }: { personaId: string; name: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => () => { if (current === ref.current) current = null; }, []);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // don't also select the persona
    const a = ref.current;
    if (!a || missing) return;
    if (playing) { a.pause(); return; }
    if (current && current !== a) current.pause();
    current = a;
    a.currentTime = 0;
    a.play().then(() => setPlaying(true)).catch(() => setMissing(true));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={missing}
      aria-label={missing ? `${name} voice sample not added yet` : `Hear ${name}'s voice`}
      title={missing ? "voice sample not added yet" : `Hear ${name}'s voice`}
      className="grid h-9 w-9 place-items-center rounded-full cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--primary)" }}
    >
      {playing ? <span className="text-xs leading-none">⏸</span> : <IconPlay width={14} height={14} />}
      <audio
        ref={ref}
        src={`/agents/${personaId}-sample.mp3`}
        preload="none"
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onError={() => setMissing(true)}
      />
    </button>
  );
}
