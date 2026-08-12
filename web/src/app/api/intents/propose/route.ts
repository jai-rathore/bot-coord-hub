import { getDb } from "@/db";
import { intentProposals } from "@/db/schema";
import {
  findDedupeHits,
  isExactDedupeConflict,
} from "@/lib/intents";
import { normalizeIntentName, slugify } from "@/lib/slug";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to propose an intent" }, { status: 401 });
  }

  let body: {
    name?: string;
    slug?: string;
    description?: string;
    force?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = normalizeIntentName(body.name ?? "");
  if (!name || name.length < 3) {
    return Response.json(
      { error: "Name must be at least 3 characters" },
      { status: 400 },
    );
  }

  const slug = slugify(body.slug || name);
  if (!slug) {
    return Response.json({ error: "Invalid slug" }, { status: 400 });
  }

  const description = body.description?.trim() || null;
  const hits = await findDedupeHits(name, slug);
  const exact = isExactDedupeConflict(hits, name, slug);

  if (exact) {
    return Response.json(
      {
        error: "An intent with this name or slug already exists",
        hits,
      },
      { status: 409 },
    );
  }

  if (hits.length > 0 && !body.force) {
    return Response.json(
      {
        error:
          "Similar intents found. Review matches or resubmit with force=true.",
        hits,
        requiresForce: true,
      },
      { status: 409 },
    );
  }

  try {
    const db = getDb();
    const [proposal] = await db
      .insert(intentProposals)
      .values({
        name,
        slug,
        description,
        status: "pending",
        proposedByUserId: user.id,
        proposedByEmail: user.email,
        triageQueuedAt: new Date(),
      })
      .returning();

    return Response.json(
      { proposal, triage: { queued: true } },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.includes("unique") || message.includes("duplicate")) {
      return Response.json(
        { error: "Slug already taken", hits },
        { status: 409 },
      );
    }
    return Response.json({ error: message }, { status: 503 });
  }
}
