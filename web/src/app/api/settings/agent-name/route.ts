import { jsonError, readJsonBody } from "@/lib/http";
import { setSageName } from "@/lib/sage";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to rename your agent." }, { status: 401 });
  }
  try {
    const body = await readJsonBody<{ name?: unknown }>(request);
    const name = await setSageName(
      user,
      typeof body.name === "string" ? body.name : null,
    );
    return Response.json({ ok: true, name });
  } catch (error) {
    return jsonError(error, "Could not rename your agent");
  }
}
