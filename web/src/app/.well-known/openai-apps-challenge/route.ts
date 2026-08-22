export const dynamic = "force-dynamic";

/** OpenAI plugin-domain verification. The portal requires the token verbatim. */
export async function GET() {
  const token = process.env.OPENAI_APPS_CHALLENGE?.trim();
  if (!token) return new Response(null, { status: 404 });
  return new Response(token, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
