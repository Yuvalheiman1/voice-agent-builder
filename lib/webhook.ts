// Parsers for Vapi server webhook payloads. Shapes verified against
// @vapi-ai/server-sdk: ToolCall = { id, type, function: { name, arguments } }
// where `arguments` is a JSON string. Kept pure so they are unit-tested.

export type ParsedToolCall = { id: string; name: string; args: any };

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return {}; }
}

export function parseToolCall(body: any): ParsedToolCall[] {
  const list = body?.message?.toolCallList ?? [];
  return list.map((t: any) => {
    const raw = t?.function?.arguments ?? t?.arguments;
    const args = typeof raw === "string" ? safeParse(raw) : (raw ?? {});
    return { id: t?.id, name: t?.function?.name ?? t?.name, args };
  });
}

// Lead linkage: the dialer stamps { leadId } into the call's
// assistantOverrides.metadata at creation; Vapi echoes it back here.
export function extractCallMeta(body: any): { leadId?: string } {
  const leadId = body?.message?.call?.assistantOverrides?.metadata?.leadId;
  return typeof leadId === "string" && leadId ? { leadId } : {};
}

export function parseEndOfCall(body: any) {
  const m = body?.message ?? {};
  const call = m.call ?? {};
  return {
    vapiCallId: call.id ?? "",
    assistantId: call.assistantId ?? "",
    phone: call.customer?.number ?? "",
    status: call.status ?? "ended",
    summary: m.summary ?? "",
    transcript: m.transcript ?? "",
  };
}
