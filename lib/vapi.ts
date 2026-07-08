import { VapiClient } from "@vapi-ai/server-sdk";
import type { AssistantConfig } from "./types";

function client(): VapiClient {
  const token = process.env.VAPI_API_KEY;
  if (!token) throw new Error("VAPI_API_KEY is not set");
  return new VapiClient({ token });
}

function baseUrl(): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "";
}

// Build a Vapi assistant payload from our config. `any` for the SDK payload:
// Vapi's DTO is large and evolving - see https://github.com/VapiAI/docs.
function toVapiAssistant(c: AssistantConfig): any {
  const prompt = `${c.systemPrompt}\n\nQualification questions:\n${c.qualificationQuestions.map((q) => `- ${q}`).join("\n")}`;
  const webhook = baseUrl() ? `${baseUrl()}/api/vapi/webhook` : undefined;
  return {
    name: c.name,
    firstMessage: c.firstMessage,
    model: {
      provider: "openai",
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      tools: [
        {
          type: "function",
          function: {
            name: "book_meeting",
            description: "Book a meeting once the lead is qualified and agrees to a time.",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string" },
                email: { type: "string" },
                startTime: { type: "string", description: "ISO 8601 datetime" },
              },
              required: ["name", "email", "startTime"],
            },
          },
          ...(webhook ? { server: { url: webhook } } : {}),
        },
      ],
    },
    voice: { provider: "openai", voiceId: c.voiceId },
    serverMessages: ["end-of-call-report", "tool-calls"],
    ...(webhook ? { server: { url: webhook } } : {}),
  };
}

export async function upsertAssistant(config: AssistantConfig, vapiId?: string): Promise<string> {
  const assistants = client().assistants as any;
  const payload = toVapiAssistant(config);
  if (vapiId) {
    await assistants.update(vapiId, payload);
    return vapiId;
  }
  const created = await assistants.create(payload);
  return (created as { id: string }).id;
}

export async function startOutboundCall(vapiAssistantId: string, phone: string): Promise<string> {
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error("VAPI_PHONE_NUMBER_ID is not set (import a Twilio number in Vapi)");
  const call = await client().calls.create({
    assistantId: vapiAssistantId,
    phoneNumberId,
    customer: { number: phone },
  } as any);
  return (call as { id: string }).id;
}
