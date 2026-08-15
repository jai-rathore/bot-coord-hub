import { ensureCurrentUser } from "@/lib/users";
import { isIntentAdmin } from "@/lib/intent-moderation";
import {
  decideSafetyReport,
  listSafetyReportsForModeration,
} from "@/lib/discovery-service";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

async function moderatorOrResponse() {
  const user = await ensureCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isIntentAdmin(user)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return user;
}

export async function GET() {
  const moderator = await moderatorOrResponse();
  if (moderator instanceof Response) return moderator;
  try {
    return Response.json({
      reports: await listSafetyReportsForModeration(),
    });
  } catch (error) {
    return jsonError(error, "Failed to load safety reports");
  }
}

export async function POST(request: Request) {
  const moderator = await moderatorOrResponse();
  if (moderator instanceof Response) return moderator;
  try {
    const body = (await request.json()) as {
      reportId?: unknown;
      decision?: unknown;
      moderatorNotes?: unknown;
      safetyStatus?: unknown;
    };
    if (
      typeof body.reportId !== "string" ||
      !["reviewed", "actioned", "dismissed"].includes(String(body.decision))
    ) {
      return Response.json(
        { error: "reportId and a valid decision are required" },
        { status: 400 },
      );
    }
    const safetyStatus = ["active", "restricted", "suspended"].includes(
      String(body.safetyStatus),
    )
      ? (body.safetyStatus as "active" | "restricted" | "suspended")
      : undefined;
    return Response.json({
      report: await decideSafetyReport({
        moderator,
        reportId: body.reportId,
        decision: body.decision as "reviewed" | "actioned" | "dismissed",
        moderatorNotes:
          typeof body.moderatorNotes === "string"
            ? body.moderatorNotes
            : undefined,
        safetyStatus,
      }),
    });
  } catch (error) {
    return jsonError(error, "Failed to review safety report");
  }
}
