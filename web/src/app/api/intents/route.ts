import { listRegistryIntents } from "@/lib/intents";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;

  try {
    const items = await listRegistryIntents(q);
    return Response.json({ intents: items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: message }, { status: 503 });
  }
}
