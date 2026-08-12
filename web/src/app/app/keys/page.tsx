import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apiKeys } from "@/db/schema";
import { KeysManager, type KeyRow } from "@/components/keys-manager";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function KeysPage() {
  const user = await ensureCurrentUser();
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }

  let rows: KeyRow[] = [];
  let dbError: string | null = null;

  try {
    const db = getDb();
    const keys = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.userId, user.id));

    rows = keys
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        createdAt: k.createdAt.toISOString(),
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        revokedAt: k.revokedAt?.toISOString() ?? null,
      }));
  } catch (err) {
    dbError =
      err instanceof Error ? err.message : "Database unavailable";
  }

  return (
    <div>
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.02em] text-matcha-deep">
        Agent keys
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        Keys authenticate agent calls via{" "}
        <code className="rounded bg-code-bg px-1.5 py-0.5 text-sm">
          Authorization: Bearer &lt;api_key&gt;
        </code>
        . Secrets are hashed at rest; the raw value is shown only once.
      </p>

      {dbError ? (
        <p className="mt-6 text-sm text-danger" role="alert">
          Could not load keys: {dbError}. Check DATABASE_URL.
        </p>
      ) : (
        <div className="mt-6">
          <KeysManager initialKeys={rows} />
        </div>
      )}
    </div>
  );
}
