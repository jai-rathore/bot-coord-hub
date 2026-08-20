import { isIntentAdmin } from "@/lib/intent-moderation";
import { intentsForViewer, listRegistryIntents } from "@/lib/intents";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;

  try {
    const [items, user] = await Promise.all([
      listRegistryIntents(q),
      ensureCurrentUser(),
    ]);
    return Response.json({
      intents: intentsForViewer(items, {
        signedIn: Boolean(user),
        admin: Boolean(user && isIntentAdmin(user)),
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: message }, { status: 503 });
  }
}
