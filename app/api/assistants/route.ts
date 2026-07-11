import { upsertAssistant } from "@/lib/vapi";

export async function POST(req: Request) {
  try {
    const { config, vapiId } = await req.json();
    // Shape guard - nothing malformed reaches the Vapi push.
    if (
      !config || typeof config !== "object" ||
      typeof config.name !== "string" || !config.name.trim() ||
      !Array.isArray(config.qualificationQuestions)
    ) {
      return Response.json({ error: "Missing or invalid config" }, { status: 400 });
    }
    const id = await upsertAssistant(config, vapiId);
    return Response.json({ id });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
