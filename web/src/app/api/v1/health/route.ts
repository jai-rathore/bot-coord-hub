import { PRODUCT_VERSION, PROTOCOL_VERSION } from "@/lib/discovery";

// A constant body and no request input. Route handlers are dynamic by default,
// so this says so explicitly: the Render health probe hits it continuously and
// there is nothing to render.
export const dynamic = "force-static";

/** Public health — no auth required. */
export async function GET() {
  return Response.json({
    ok: true,
    service: "honeymatcha",
    version: PRODUCT_VERSION,
    protocol: PROTOCOL_VERSION,
  });
}
