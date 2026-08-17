import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getPublicAgentProfile } from "@/lib/agent-profiles";
import { getDiscoveryDocument, prefersJson } from "@/lib/discovery";
import { isPublicHandlePath } from "@/lib/handles";

export default clerkMiddleware(async (auth, req) => {
  // Agent discovery on homepage without breaking human HTML.
  if (
    req.method === "GET" &&
    req.nextUrl.pathname === "/" &&
    prefersJson(req.headers.get("accept"))
  ) {
    const proto =
      req.headers.get("x-forwarded-proto") ??
      req.nextUrl.protocol.replace(":", "");
    const host =
      req.headers.get("x-forwarded-host") ??
      req.headers.get("host") ??
      req.nextUrl.host;
    const baseUrl = `${proto}://${host}`;
    return NextResponse.json(getDiscoveryDocument(baseUrl), {
      headers: {
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  if (
    req.method === "GET" &&
    isPublicHandlePath(req.nextUrl.pathname) &&
    prefersJson(req.headers.get("accept"))
  ) {
    const proto =
      req.headers.get("x-forwarded-proto") ??
      req.nextUrl.protocol.replace(":", "");
    const host =
      req.headers.get("x-forwarded-host") ??
      req.headers.get("host") ??
      req.nextUrl.host;
    const handle = req.nextUrl.pathname.replace(/^\/+|\/+$/g, "");
    const profile = await getPublicAgentProfile(handle, `${proto}://${host}`);
    if (!profile) {
      return NextResponse.json(
        { error: "That public agent page is unavailable" },
        { status: 404 },
      );
    }
    return NextResponse.json(profile, {
      headers: {
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  if (
    req.nextUrl.pathname === "/app" ||
    req.nextUrl.pathname.startsWith("/app/") ||
    req.nextUrl.pathname === "/setup" ||
    req.nextUrl.pathname === "/oauth/authorize"
  ) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
