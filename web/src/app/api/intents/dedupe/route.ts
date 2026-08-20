import { findDedupeHits } from "@/lib/intents";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to check task names" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name") ?? "";
  const slug = searchParams.get("slug") ?? undefined;

  if (!name.trim()) {
    return Response.json({ hits: [] });
  }

  try {
    const hits = await findDedupeHits(name, slug);
    return Response.json({ hits });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: message }, { status: 503 });
  }
}
