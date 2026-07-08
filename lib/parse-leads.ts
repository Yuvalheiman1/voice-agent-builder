import type { Lead } from "./types";
import { newId } from "./store";

// Normalize a phone string to E.164-ish: keep leading +, strip everything else.
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/[^\d]/g, "");
}

export function makeLead(name: string, phone: string): Lead {
  return {
    id: newId("lead"),
    name: name.trim() || "Unknown",
    phone: normalizePhone(phone),
    status: "new",
    createdAt: Date.now(),
  };
}

// Parse pasted/imported text as JSON array or CSV. Returns valid leads only.
export function parseLeadsText(text: string): Lead[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Try JSON first: [{ name, phone }, ...] or ["+123", ...]
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed);
      const arr = Array.isArray(data) ? data : [data];
      return arr
        .map((row) => {
          if (typeof row === "string") return makeLead("", row);
          if (row && typeof row === "object")
            return makeLead(String(row.name ?? row.Name ?? ""), String(row.phone ?? row.Phone ?? row.number ?? ""));
          return null;
        })
        .filter((l): l is Lead => !!l && !!l.phone);
    } catch {
      /* fall through to CSV */
    }
  }

  // CSV / newline list. Detect a header row.
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  const first = lines[0]?.toLowerCase() ?? "";
  const hasHeader = first.includes("phone") || first.includes("name") || first.includes("number");
  const rows = hasHeader ? lines.slice(1) : lines;

  return rows
    .map((line) => {
      const cols = line.split(/[,;\t]/).map((c) => c.trim());
      if (cols.length === 1) return makeLead("", cols[0]);
      // Guess which column is the phone (the one with the most digits).
      const phoneIdx = cols.reduce(
        (best, c, i) => ((c.replace(/\D/g, "").length > (cols[best]?.replace(/\D/g, "").length ?? 0)) ? i : best),
        0,
      );
      const name = cols.filter((_, i) => i !== phoneIdx).join(" ");
      return makeLead(name, cols[phoneIdx]);
    })
    .filter((l) => !!l.phone);
}
