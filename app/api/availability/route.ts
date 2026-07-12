import { getAvailability } from "@/lib/booking";

// Used by the in-browser test call (CallPanel) to fill {{availableSlots}} - // phone calls get theirs server-side in /api/calls.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const language = url.searchParams.get("language") === "he" ? "he" : "en";
    const { slots, text } = await getAvailability(language);
    return Response.json({ slots, text });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
