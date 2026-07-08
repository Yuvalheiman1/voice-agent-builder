"use client";

import React from "react";

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus-visible:ring-2";
  const sizes = { sm: "text-sm px-3 py-1.5 min-h-[36px]", md: "text-sm px-4 py-2.5 min-h-[44px]" };
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "var(--primary)", color: "var(--on-primary)" },
    secondary: { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border-strong)" },
    ghost: { background: "transparent", color: "var(--text-muted)" },
    danger: { background: "var(--live)", color: "#fff" },
  };
  return (
    <button
      className={`${base} ${sizes[size]} ${className}`}
      style={{ ...styles[variant], boxShadow: variant === "primary" ? "var(--shadow-sm)" : undefined }}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-[12px] ${className}`}
      style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", ...style }}
    >
      {children}
    </div>
  );
}

export function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "success" | "live" | "primary" }) {
  const tones: Record<string, React.CSSProperties> = {
    muted: { background: "var(--surface-2)", color: "var(--text-muted)" },
    success: { background: "var(--success-soft)", color: "var(--success)" },
    live: { background: "var(--live-soft)", color: "var(--live)" },
    primary: { background: "var(--primary-soft)", color: "var(--primary)" },
  };
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium" style={tones[tone]}>
      {children}
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium" style={{ color: "var(--text)" }}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs" style={{ color: "var(--text-faint)" }}>{hint}</span>}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border-strong)",
  color: "var(--text)",
  borderRadius: "10px",
};

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus-visible:ring-2 ${props.className ?? ""}`} style={{ ...inputStyle, ...(props.style || {}) }} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 ${props.className ?? ""}`} style={{ ...inputStyle, resize: "vertical", ...(props.style || {}) }} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`w-full px-3 py-2.5 text-sm min-h-[44px] cursor-pointer focus:outline-none focus-visible:ring-2 ${props.className ?? ""}`} style={{ ...inputStyle }} />;
}

export function Checkbox({ checked, onChange, "aria-label": ariaLabel }: { checked: boolean; onChange: () => void; "aria-label"?: string }) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(); } }}
      className="grid h-5 w-5 flex-none place-items-center rounded-[6px] transition-colors duration-150 cursor-pointer"
      style={{
        background: checked ? "var(--primary)" : "var(--surface)",
        border: `1.5px solid ${checked ? "var(--primary)" : "var(--border-strong)"}`,
      }}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </span>
  );
}
