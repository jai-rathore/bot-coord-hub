import { PRODUCT_VERSION, PROTOCOL_VERSION } from "@/lib/discovery";

export const dynamic = "force-dynamic";

/** Public health — no auth required. */
export async function GET() {
  return Response.json({
    ok: true,
    service: "honeymatcha",
    version: PRODUCT_VERSION,
    protocol: PROTOCOL_VERSION,
  });
}
