import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { openaiModel } from "@/lib/model";
import { getPersona } from "@/lib/agents";
import { logEvent } from "@/lib/log";
import {
  ResultSchema, buildSystemPrompt, buildPrompt, sanitizeChips, PROMPT_VERSION, type ChatTurn,
} from "@/lib/builder-chat";

// Persona-voiced builder chat: the LLM plays the agent being configured.
// In: { personaId, messages, config } - full history each turn (stateless route).
// Optional analytics fields from the client: { sessionId, turnIndex, source }.
// Out: { reply, config, chips } - reply in persona voice, complete updated
// config, and LLM-suggested tappable replies for the operator.
export async function POST(req: Request) {
  let sessionId: string | undefined;
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: "Add OPENAI_API_KEY in Vercel to use the builder chat." }, { status: 400 });
    }
    const body = await req.json();
    const { personaId, messages, config } = body;
    sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    const persona = getPersona(personaId ?? "");
    if (!persona) {
      return Response.json({ error: "Unknown personaId." }, { status: 400 });
    }
    if (!config || typeof config !== "object" || !Array.isArray(messages)) {
      return Response.json({ error: "config (object) and messages (array) are required." }, { status: 400 });
    }

    const started = Date.now();
    const { object } = await generateObject({
      model: openai(openaiModel()),
      schema: ResultSchema,
      system: buildSystemPrompt(persona),
      prompt: buildPrompt(config, messages as ChatTurn[]),
    });
    const chips = sanitizeChips(object.chips);

    const lastUser = [...(messages as ChatTurn[])].reverse().find((m) => m.role === "user");
    await logEvent({
      type: "builder.turn",
      sessionId,
      durationMs: Date.now() - started,
      promptVersion: PROMPT_VERSION,
      data: {
        personaId,
        turnIndex: typeof body.turnIndex === "number" ? body.turnIndex : messages.length,
        source: typeof body.source === "string" ? body.source : undefined,
        userText: lastUser?.text,
        reply: object.reply,
        chips,
        config: object.config, // full snapshot - replayable per approved design
        model: openaiModel(),
      },
    });

    return Response.json({ ...object, chips });
  } catch (e) {
    await logEvent({
      type: "error.api", actor: "system", sessionId, ok: false,
      error: (e as Error).message, data: { route: "/api/chat" },
    });
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
