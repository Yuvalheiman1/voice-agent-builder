"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentPersona } from "@/lib/agents";

/** True when the user asked the OS to reduce motion. Poster-only in that case. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Persona avatar: static poster by default; on hover the silent wave loop fades
 * in and plays, and on leave it pauses + resets to frame 0. Reuses the validated
 * poster→hover-video pattern from temp/hover-demo.html. Videos use preload="none"
 * so a list of avatars doesn't fetch every clip up front (loads on first hover).
 */
export default function AgentAvatar({
  persona,
  size,
  className = "",
}: {
  persona: AgentPersona;
  /** Square side in px. Omit to fill the parent (aspect-square container). */
  size?: number;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hover, setHover] = useState(false);
  const reduceMotion = usePrefersReducedMotion();

  const enter = () => {
    if (reduceMotion) return;
    setHover(true);
    videoRef.current?.play().catch(() => { /* autoplay blocked - poster stays */ });
  };
  const leave = () => {
    setHover(false);
    const v = videoRef.current;
    if (v) { v.pause(); v.currentTime = 0; }
  };

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        width: size, height: size,
        aspectRatio: size ? undefined : "1 / 1",
        borderRadius: 14,
        background: "linear-gradient(135deg,#7c3aed,#a855f7)",
      }}
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      <img
        src={persona.media.poster}
        alt={persona.name}
        className="absolute inset-0 h-full w-full"
        style={{ objectFit: "cover", objectPosition: "50% 22%" }}
      />
      {!reduceMotion && (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          poster={persona.media.poster}
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          style={{ objectFit: "cover", objectPosition: "50% 22%", opacity: hover ? 1 : 0, transition: "opacity .25s" }}
        >
          <source src={persona.media.webm} type="video/webm" />
          <source src={persona.media.mp4} type="video/mp4" />
        </video>
      )}
    </div>
  );
}
