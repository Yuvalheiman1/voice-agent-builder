import { upsertAssistant } from "@/lib/vapi";

export async function POST(req: Request) {
  try {
    const { config, vapiId } = await req.json();
    if (!config?.name) return Response.json({ error: "Missing config" }, { status: 400 });
    const id = await upsertAssistant(config, vapiId);
    return Response.json({ id });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
