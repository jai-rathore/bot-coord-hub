import { extractGuestToken } from "@/lib/guest-tokens";

export function requireGuestToken(request: Request): string | Response {
  const token = extractGuestToken(request.headers.get("authorization"));
  if (!token) {
    return Response.json(
      { error: "Private guest capability required" },
      {
        status: 401,
        headers: { "WWW-Authenticate": 'Guest realm="honeymatcha-guest"' },
      },
    );
  }
  return token;
}

export function isGuestToken(value: string | Response): value is string {
  return typeof value === "string";
}
