import { ensureCurrentUser } from "@/lib/users";
import { listConfirmsForUser } from "@/lib/confirms";
import { jsonError } from "@/lib/http";
import type { Confirm } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam === "pending" ||
    statusParam === "approved" ||
    statusParam === "denied"
      ? (statusParam as Confirm["status"])
      : "pending";

  try {
    const confirms = await listConfirmsForUser(user, status);
    return Response.json({ confirms });
  } catch (err) {
    return jsonError(err, "Failed to list confirms");
  }
}
