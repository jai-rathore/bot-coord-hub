import { cleanupExpiredDiscoveryData } from "@/lib/discovery-service";
import { cleanupSageOperations } from "@/lib/sage/operations";
import { assertTriageSecret } from "@/lib/triage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!assertTriageSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [discovery, sageOperations] = await Promise.all([
    cleanupExpiredDiscoveryData(),
    cleanupSageOperations(),
  ]);
  return Response.json({ ok: true, discovery, sageOperations });
}
