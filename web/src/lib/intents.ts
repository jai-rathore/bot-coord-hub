import { ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { intentProposals, intentTypes } from "@/db/schema";
import { normalizeIntentName, slugify } from "@/lib/slug";

export type IntentRegistryItem = {
  id: string;
  source: "type" | "proposal";
  slug: string;
  name: string;
  description: string | null;
  status: "pending" | "live" | "rejected";
  rejectionReason: string | null;
  createdAt: Date;
};

export async function listRegistryIntents(
  query?: string,
): Promise<IntentRegistryItem[]> {
  const db = getDb();
  const q = query?.trim();

  const types = await db.select().from(intentTypes);
  const proposals = await db.select().from(intentProposals);

  const items: IntentRegistryItem[] = [
    ...types.map((t) => ({
      id: t.id,
      source: "type" as const,
      slug: t.slug,
      name: t.name,
      description: t.description,
      status: t.status,
      rejectionReason: null,
      createdAt: t.createdAt,
    })),
    ...proposals.map((p) => ({
      id: p.id,
      source: "proposal" as const,
      slug: p.slug,
      name: p.name,
      description: p.description,
      status: p.status,
      rejectionReason: p.rejectionReason,
      createdAt: p.createdAt,
    })),
  ];

  const filtered = q
    ? items.filter((item) => {
        const hay = `${item.name} ${item.slug} ${item.description ?? ""}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      })
    : items;

  const statusOrder = { live: 0, pending: 1, rejected: 2 } as const;
  return filtered.sort((a, b) => {
    const byStatus = statusOrder[a.status] - statusOrder[b.status];
    if (byStatus !== 0) return byStatus;
    return a.name.localeCompare(b.name);
  });
}

export type DedupeHit = {
  slug: string;
  name: string;
  status: string;
  source: "type" | "proposal";
};

export async function findDedupeHits(
  name: string,
  slug?: string,
): Promise<DedupeHit[]> {
  const db = getDb();
  const normalizedName = normalizeIntentName(name);
  const resolvedSlug = slugify(slug || normalizedName);
  if (!resolvedSlug) return [];

  const types = await db
    .select()
    .from(intentTypes)
    .where(
      or(
        ilike(intentTypes.slug, resolvedSlug),
        sql`lower(${intentTypes.name}) = ${normalizedName.toLowerCase()}`,
        ilike(intentTypes.slug, `%${resolvedSlug}%`),
        ilike(intentTypes.name, `%${normalizedName}%`),
      ),
    );

  const proposals = await db
    .select()
    .from(intentProposals)
    .where(
      or(
        ilike(intentProposals.slug, resolvedSlug),
        sql`lower(${intentProposals.name}) = ${normalizedName.toLowerCase()}`,
        ilike(intentProposals.slug, `%${resolvedSlug}%`),
        ilike(intentProposals.name, `%${normalizedName}%`),
      ),
    );

  const hits: DedupeHit[] = [
    ...types.map((t) => ({
      slug: t.slug,
      name: t.name,
      status: t.status,
      source: "type" as const,
    })),
    ...proposals.map((p) => ({
      slug: p.slug,
      name: p.name,
      status: p.status,
      source: "proposal" as const,
    })),
  ];

  // Prefer exact matches first
  return hits.sort((a, b) => {
    const aExact =
      a.slug === resolvedSlug ||
      a.name.toLowerCase() === normalizedName.toLowerCase()
        ? 0
        : 1;
    const bExact =
      b.slug === resolvedSlug ||
      b.name.toLowerCase() === normalizedName.toLowerCase()
        ? 0
        : 1;
    return aExact - bExact;
  });
}

export function isExactDedupeConflict(
  hits: DedupeHit[],
  name: string,
  slug: string,
): boolean {
  const n = name.toLowerCase();
  return hits.some(
    (h) => h.slug === slug || h.name.toLowerCase() === n,
  );
}
