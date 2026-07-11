import { VapiClient } from "@vapi-ai/server-sdk";
import type { AssistantConfig } from "./types";
import type { VapiCallLike } from "./outcome";
import { resolveVoice } from "./assistant-config";
import { openaiModel } from "./model";

function client(): VapiClient {
  const token = process.env.VAPI_API_KEY;
  if (!token) throw new Error("VAPI_API_KEY is not set");
  return new VapiClient({ token });
}

function baseUrl(): string {
  // Prefer an explicit public URL, then Vercel's stable PRODUCTION domain.
  // Never fall back to VERCEL_URL alone: that is the deployment-specific URL,
  // which stays behind Deployment Protection (401) even when the production
  // alias is public - Vapi's webhook calls would 401. See PUBLIC_BASE_URL.
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "";
}

// Universal voice-agent rules appended to EVERY agent at push time (same idea
// as the date injection): guaranteed baseline even if the builder LLM omits it.
const VOICE_CORE = `Voice conversation rules (always apply):
- This is a spoken phone call: keep every reply to 1-2 short sentences, plain spoken language. No lists, markdown or emojis.
- Ask ONE question at a time and wait for the answer. If interrupted, stop talking and listen.
- If the person is busy or not interested, thank them warmly and end the call politely.`;

// Only for booking agents - qualify-only agents have no book_meeting tool, so
// collecting an email would be pointless friction.
const EMAIL_BOOKING = `Email protocol (for the calendar invite):
- The lead's email on file: "{{leadEmail}}".
- If it is a real email address: do NOT ask for it or spell it out. Just confirm once, casually: "I'll send the invite to the email we have on file - still the best one?" If they give a different one, use what they say.
- If it is "unknown" or blank: ask for it once. Read it back ONCE in two parts (the part before the at-sign, then the domain) to confirm. If they correct you, try again - but after 2 failed correction attempts, STOP asking: say "No worries - we'll send you a text message at this number instead", and call book_meeting with email set to "unknown". A booked meeting without an email is success; a lead who hangs up over spelling is failure.
- Never guess or invent an email.

Booking:
- Confirm the agreed date and time out loud before calling book_meeting.`;

// Hebrew agents: hard language rule + booking protocol WITHOUT voice email
// capture (mixed Hebrew/Latin STT is unreliable - spec decision: email on
// file or the SMS fallback).
const HEBREW_RULES = `כללי שפה (חובה):
- דבר/י עברית בלבד לאורך כל השיחה. לעולם אל תעבור/י לאנגלית, גם אם הלקוח משלב מילים באנגלית.
- The qualification questions below may be written in English - ask them in natural, native Hebrew.
- אמור/אמרי מספרים ושעות במילים בעברית (למשל "שלוש וחצי", לא "3:30").`;

const EMAIL_BOOKING_HE = `פרוטוקול אימייל (להזמנה ליומן):
- האימייל של הליד במערכת: "{{leadEmail}}".
- אם זו כתובת אמיתית: אל תבקש/י אותה שוב. אשר/י פעם אחת בקצרה: "אשלח את הזימון למייל שיש לנו במערכת - עדיין רלוונטי?".
- אם היא "unknown" או ריקה: אל תנסה/י לקלוט אימייל בשיחה. אמור/אמרי "נשלח לך הודעת טקסט למספר הזה עם כל הפרטים", וקרא/י ל-book_meeting עם email שווה "unknown".
- לעולם אל תנחש/י או תמציא/י אימייל.

קביעת פגישה:
- אשר/י בקול את התאריך והשעה שסוכמו לפני הקריאה ל-book_meeting.`;

// Pure prompt composition (exported for tests). booking !== false so agents
// saved before the flag existed keep their booking behavior.
export function composeCallPrompt(c: AssistantConfig, today: string): string {
  const booking = c.booking !== false;
  const hebrew = c.language === "he";
  const dateLine = booking
    ? `Today's date is ${today}. When booking a meeting, always choose a time in the future relative to today and pass startTime as an ISO 8601 datetime.`
    : `Today's date is ${today}.`;
  return [
    c.systemPrompt,
    ...(hebrew ? [HEBREW_RULES] : []),
    VOICE_CORE,
    ...(booking ? [hebrew ? EMAIL_BOOKING_HE : EMAIL_BOOKING] : []),
    dateLine,
    `Qualification questions:\n${c.qualificationQuestions.map((q) => `- ${q}`).join("\n")}`,
  ].join("\n\n");
}

// Build a Vapi assistant payload from our config. `any` for the SDK payload:
// Vapi's DTO is large and evolving - see https://github.com/VapiAI/docs.
// Exported for tests.
export function toVapiAssistant(c: AssistantConfig): any {
  // Inject today's date (at push time) so the agent stops hallucinating past
  // dates (e.g. 2023) and books real future times.
  const booking = c.booking !== false;
  const prompt = composeCallPrompt(c, new Date().toISOString().slice(0, 10));
  const webhook = baseUrl() ? `${baseUrl()}/api/vapi/webhook` : undefined;
  return {
    name: c.name,
    firstMessage: c.firstMessage,
    model: {
      provider: "openai",
      model: openaiModel(),
      messages: [{ role: "system", content: prompt }],
      // Capabilities are code-assigned: qualify-only agents get NO booking tool.
      ...(booking
        ? {
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
          }
        : {}),
    },
    voice: resolveVoice(c.voiceId),
    ...(c.language === "he"
      ? {
          transcriber: { provider: "deepgram", model: "nova-3", language: "he" },
          startSpeakingPlan: { smartEndpointingPlan: { provider: "vapi" } },
        }
      : {}),
    serverMessages: ["end-of-call-report", "tool-calls"],
    // Post-call analysis: ask Vapi's extractor for clean outcome fields, read from
    // call.analysis.structuredData by lib/outcome.ts (both web + lead paths).
    analysisPlan: {
      structuredDataPlan: {
        enabled: true,
        schema: {
          type: "object",
          properties: {
            qualified: { type: "boolean", description: "Did the lead meet the qualification criteria discussed on the call?" },
            booked: { type: "boolean", description: "Did the lead agree to a meeting (book_meeting used or a time agreed)?" },
            reason: { type: "string", description: "One short sentence explaining the outcome." },
          },
          required: ["qualified", "booked"],
        },
        timeoutSeconds: 10,
      },
    },
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

export async function startOutboundCall(vapiAssistantId: string, phone: string, leadId?: string, email?: string): Promise<string> {
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error("VAPI_PHONE_NUMBER_ID is not set (import a Twilio number in Vapi)");
  const call = await client().calls.create({
    assistantId: vapiAssistantId,
    phoneNumberId,
    customer: { number: phone },
    // Stamp the lead onto the call so the webhook can link book_meeting back
    // to our DB row. Verified: CreateCallDto has no top-level metadata - // it lives on assistantOverrides. variableValues fills the {{leadEmail}}
    // template in VOICE_BASELINE (LiquidJS) - "unknown" triggers voice capture.
    assistantOverrides: {
      ...(leadId ? { metadata: { leadId } } : {}),
      variableValues: { leadEmail: email || "unknown" },
    },
  } as any);
  return (call as { id: string }).id;
}

// Fetch a single call (status, endedReason, analysis) for outcome polling.
export async function getCall(id: string): Promise<VapiCallLike> {
  const call = await (client().calls as any).get({ id });
  return call as VapiCallLike;
}
