import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const ConfigSchema = z.object({
  name: z.string(),
  firstMessage: z.string(),
  systemPrompt: z.string(),
  voiceId: z.string(),
  qualificationQuestions: z.array(z.string()),
});

const ResultSchema = z.object({
  config: ConfigSchema,
  summary: z.string().describe("One short sentence describing what changed."),
});

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: "Add OPENAI_API_KEY in Vercel to use chat refine." }, { status: 400 });
    }
    const { message, config } = await req.json();

    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: ResultSchema,
      prompt:
        `You edit a voice assistant's configuration. Here is the CURRENT config as JSON:\n` +
        `${JSON.stringify(config, null, 2)}\n\n` +
        `Apply this change request: "${message}"\n` +
        `Return the COMPLETE updated config (carry over every unchanged field exactly) and a one-sentence summary. ` +
        `Do not invent a voiceId - keep the existing one unless the user explicitly asks to change the voice.`,
    });

    return Response.json(object);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
