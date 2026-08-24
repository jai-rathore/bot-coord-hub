import { isIntentAdmin } from "@/lib/intent-moderation";
import { errorMessage, errorStatus } from "@/lib/http";
import {
  listSageOperationsJobs,
  requeueSageJob,
  sageOperationsSnapshot,
} from "@/lib/sage/operations";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

async function administratorOrResponse() {
  const administrator = await ensureCurrentUser();
  if (!administrator) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isIntentAdmin(administrator)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return administrator;
}

export async function GET() {
  const administrator = await administratorOrResponse();
  if (administrator instanceof Response) return administrator;
  const [snapshot, jobs] = await Promise.all([
    sageOperationsSnapshot(),
    listSageOperationsJobs(),
  ]);
  return Response.json({ snapshot, jobs });
}

export async function POST(request: Request) {
  const administrator = await administratorOrResponse();
  if (administrator instanceof Response) return administrator;
  try {
    const body = (await request.json()) as {
      action?: unknown;
      jobId?: unknown;
      reason?: unknown;
    };
    if (
      body.action !== "requeue" ||
      typeof body.jobId !== "string" ||
      typeof body.reason !== "string"
    ) {
      return Response.json(
        { error: "action, jobId, and reason are required" },
        { status: 400 },
      );
    }
    return Response.json({
      job: await requeueSageJob({
        administrator,
        jobId: body.jobId,
        reason: body.reason,
      }),
    });
  } catch (error) {
    return Response.json(
      { error: errorMessage(error) },
      { status: errorStatus(error) },
    );
  }
}
