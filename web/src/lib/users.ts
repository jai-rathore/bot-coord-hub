import { eq } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { users, type User } from "@/db/schema";

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

  const db = getDb();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUser.id))
    .limit(1);

  if (existing[0]) {
    if (existing[0].email !== email || existing[0].name !== name) {
      const [updated] = await db
        .update(users)
        .set({ email, name, updatedAt: new Date() })
        .where(eq(users.id, existing[0].id))
        .returning();
      return updated;
    }
    return existing[0];
  }

  const [created] = await db
    .insert(users)
    .values({
      clerkUserId: clerkUser.id,
      email,
      name,
    })
    .returning();

  return created;
}
