import { cleanupExpiredDiscoveryData } from "@/lib/discovery-service";
import { assertTriageSecret } from "@/lib/triage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!assertTriageSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json({
    ok: true,
    ...(await cleanupExpiredDiscoveryData()),
  });
}
