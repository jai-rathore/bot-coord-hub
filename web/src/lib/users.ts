import { cache } from "react";
import { eq } from "drizzle-orm";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { users, type User } from "@/db/schema";
import { AgentApiError } from "@/lib/agent-errors";
import {
  isNotifyChannel,
  normalizePhoneE164,
  parseNotifyChannel,
  wantsSms,
  type NotifyChannel,
} from "@/lib/phone";
import { smsOffered } from "@/lib/sms-flag";
import { timed } from "@/lib/perf";

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505",
  );
}

function clerkPhoneE164(clerkUser: {
  primaryPhoneNumber?: { phoneNumber?: string | null } | null;
  phoneNumbers?: Array<{ phoneNumber?: string | null }>;
}): string | null {
  const raw =
    clerkUser.primaryPhoneNumber?.phoneNumber ??
    clerkUser.phoneNumbers?.[0]?.phoneNumber ??
    null;
  return raw ? normalizePhoneE164(raw) : null;
}

export async function syncUserIdentity(identity: {
  clerkUserId: string;
  email: string;
  name: string | null;
  phoneE164?: string | null;
}): Promise<User> {
  const email = identity.email.trim().toLowerCase();
  const db = getDb();
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, identity.clerkUserId))
    .limit(1);

  if (existing) {
    const nextPhone =
      existing.phoneE164 || identity.phoneE164 || null;
    const phoneChanged = !existing.phoneE164 && Boolean(identity.phoneE164);
    if (
      existing.email !== email ||
      existing.name !== identity.name ||
      phoneChanged
    ) {
      try {
        const [updated] = await db
          .update(users)
          .set({
            email,
            name: identity.name,
            ...(phoneChanged ? { phoneE164: nextPhone } : {}),
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing.id))
          .returning();
        return updated;
      } catch (error) {
        // A Clerk number that already belongs to someone else must not
        // block sign-in. Keep the local profile as-is besides email/name.
        if (phoneChanged && isUniqueViolation(error)) {
          const [updated] = await db
            .update(users)
            .set({ email, name: identity.name, updatedAt: new Date() })
            .where(eq(users.id, existing.id))
            .returning();
          return updated;
        }
        throw error;
      }
    }
    return existing;
  }

  // A verified email may already exist after changing Clerk instances. Keep
  // the HoneyMatcha user and its links/tasks, but attach the current Clerk ID.
  // A Clerk phone that already belongs to someone else must not block signup.
  const values = {
    clerkUserId: identity.clerkUserId,
    email,
    name: identity.name,
  };
  try {
    const [reconciled] = await db
      .insert(users)
      .values({
        ...values,
        ...(identity.phoneE164 ? { phoneE164: identity.phoneE164 } : {}),
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
  } catch (error) {
    if (!identity.phoneE164 || !isUniqueViolation(error)) throw error;
    const [reconciled] = await db
      .insert(users)
      .values(values)
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
}

export async function updateNotificationPrefs(
  user: User,
  input: { channel?: unknown; phone?: unknown },
): Promise<User> {
  let channel: NotifyChannel = parseNotifyChannel(user.notifyChannel);
  if (input.channel !== undefined) {
    if (input.channel === "text") {
      channel = "sms";
    } else if (isNotifyChannel(input.channel)) {
      channel = input.channel;
    } else {
      throw new AgentApiError(400, "Choose email, text, or both.");
    }
  }

  let phoneE164 = user.phoneE164;
  if (input.phone !== undefined) {
    const raw = typeof input.phone === "string" ? input.phone.trim() : "";
    if (!raw) {
      phoneE164 = null;
    } else {
      phoneE164 = normalizePhoneE164(raw);
      if (!phoneE164) {
        throw new AgentApiError(
          400,
          "That doesn't look like a mobile number.",
        );
      }
    }
  }

  if (wantsSms(channel) && !smsOffered()) {
    throw new AgentApiError(400, "Text notifications are not available yet.");
  }

  if (wantsSms(channel) && !phoneE164) {
    throw new AgentApiError(400, "Add a mobile number to get texts.");
  }

  const db = getDb();
  try {
    const [updated] = await db
      .update(users)
      .set({
        notifyChannel: channel,
        phoneE164,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();
    return updated ?? user;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AgentApiError(
        409,
        "That number is already on another account.",
      );
    }
    throw error;
  }
}

/**
 * The signed-in user, synced into Postgres.
 *
 * Request-scoped: the /app layout and the page under it both need this, and
 * they render concurrently, so without memoisation every authenticated
 * navigation made two round trips to Clerk's Backend API and wrote to `users`
 * twice. React's cache() collapses that to one per request.
 */
export const ensureCurrentUser = cache(loadCurrentUser);

/**
 * How long a locally-stored identity is trusted before being re-read from
 * Clerk. Email and display name can change in Clerk without this app hearing
 * about it (there is no webhook wired up), so the row is refreshed
 * periodically rather than never.
 */
const IDENTITY_REFRESH_MS = Number(
  process.env.IDENTITY_REFRESH_MS ?? 10 * 60 * 1000,
);

function identityIsStale(user: User): boolean {
  return Date.now() - user.updatedAt.getTime() > IDENTITY_REFRESH_MS;
}

async function loadCurrentUser(): Promise<User | null> {
  // auth() verifies the session cookie locally against cached JWKS; currentUser()
  // is a round trip to Clerk's Backend API. Every authenticated request used to
  // pay that round trip, including the ~100 route handlers, where React's
  // cache() cannot help because route handlers are not React renders.
  const { userId } = await auth();
  if (!userId) return null;

  const [existing] = await getDb()
    .select()
    .from(users)
    .where(eq(users.clerkUserId, userId))
    .limit(1);
  if (existing && !identityIsStale(existing)) return existing;

  // First sight of this Clerk user, or the local copy is due a refresh.
  const clerkUser = await timed("clerk.currentUser", () => currentUser());
  if (!clerkUser) return existing ?? null;

  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) return existing ?? null;

  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    clerkUser.username ||
    null;

  return syncUserIdentity({
    clerkUserId: clerkUser.id,
    email,
    name,
    phoneE164: clerkPhoneE164(clerkUser),
  });
}
