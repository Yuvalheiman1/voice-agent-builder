import { db } from "@/lib/db";
import { leadPatchToRow } from "@/lib/rows";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const patch = leadPatchToRow(await req.json());
    if (Object.keys(patch).length === 0) return Response.json({ ok: true });
    const { error } = await db().from("leads").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const { error } = await db().from("leads").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
