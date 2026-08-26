import { AgentApiError } from "@/lib/agent-errors";
import { distributedRateLimit } from "@/lib/distributed-rate-limit";
import {
  buildHiringRoleDraftRequest,
  hiringRoleDraftToolName,
  parseHiringRoleDraft,
  prepareHiringRoleSource,
} from "@/lib/hiring-role-draft";
import { jsonError, readJsonBody } from "@/lib/http";
import { getLlmProvider, hostedAgentAvailable } from "@/lib/llm";
import { boundedText } from "@/lib/validation";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hostedAgentAvailable()) {
    return Response.json(
      { error: "Sage role drafting is temporarily unavailable." },
      { status: 503 },
    );
  }

  try {
    let burst: Awaited<ReturnType<typeof distributedRateLimit>>;
    let daily: Awaited<ReturnType<typeof distributedRateLimit>>;
    try {
      [burst, daily] = await Promise.all([
        distributedRateLimit(`hiring-role-draft:${user.id}`, 12),
        distributedRateLimit(
          `hiring-role-draft:daily:${user.id}`,
          60,
          24 * 60 * 60 * 1_000,
        ),
      ]);
    } catch {
      return Response.json(
        { error: "Sage role drafting is temporarily unavailable." },
        { status: 503, headers: { "Retry-After": "5" } },
      );
    }
    if (!burst.ok || !daily.ok) {
      const retryAfterSec = Math.max(
        burst.ok ? 0 : burst.retryAfterSec,
        daily.ok ? 0 : daily.retryAfterSec,
      );
      return Response.json(
        { error: "Sage role drafting limit reached.", retryAfterSec },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSec) },
        },
      );
    }

    const body = await readJsonBody(request);
    const sourceUrl = boundedText(body.sourceUrl, "sourceUrl", 2_048);
    const description = boundedText(body.description, "description", 16_000);
    if (!sourceUrl && !description) {
      throw new AgentApiError(400, "Paste a job URL or job description.");
    }
    const source = await prepareHiringRoleSource({ sourceUrl, description });
    const completion = await getLlmProvider().complete({
      ...buildHiringRoleDraftRequest(source),
      budget: { userId: user.id },
      signal: request.signal,
    });
    const toolCall = completion.toolCalls[0];
    if (
      completion.toolCalls.length !== 1 ||
      toolCall?.name !== hiringRoleDraftToolName()
    ) {
      throw new AgentApiError(
        422,
        "Sage could not turn that source into a structured role. Try pasting the description.",
      );
    }
    return Response.json({
      draft: parseHiringRoleDraft(toolCall.args, source.text),
      source: {
        kind: source.kind,
        label: source.label,
        warning: source.warning,
      },
    });
  } catch (error) {
    return jsonError(error, "Sage could not draft this role.");
  }
}
