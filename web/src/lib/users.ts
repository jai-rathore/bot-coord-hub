import { eq } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { users, type User } from "@/db/schema";

export async function syncUserIdentity(identity: {
  clerkUserId: string;
  email: string;
  name: string | null;
}): Promise<User> {
  const email = identity.email.trim().toLowerCase();
  const db = getDb();
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, identity.clerkUserId))
    .limit(1);

  if (existing) {
    if (existing.email !== email || existing.name !== identity.name) {
      const [updated] = await db
        .update(users)
        .set({ email, name: identity.name, updatedAt: new Date() })
        .where(eq(users.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }

  // A verified email may already exist after changing Clerk instances. Keep
  // the HoneyMatcha user and its links/tasks, but attach the current Clerk ID.
  const [reconciled] = await db
    .insert(users)
    .values({
      clerkUserId: identity.clerkUserId,
      email,
      name: identity.name,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        clerkUserId: identity.clerkUserId,
        name: identity.name,
        updatedAt: new Date(),
      },
    })
    .returning();
  return reconciled;
}

export async function ensureCurrentUser(): Promise<User | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    clerkUser.username ||
    null;

  return syncUserIdentity({
    clerkUserId: clerkUser.id,
    email,
    name,
  });
}
