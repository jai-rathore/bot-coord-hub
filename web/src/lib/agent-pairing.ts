import { createHash, randomBytes } from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { agentPairings, apiKeys, type User } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { AgentApiError } from "@/lib/agent-errors";
import { generateApiKey } from "@/lib/keys";
import {
  normalizeAgentScopes,
  PAIRING_AGENT_SCOPES,
} from "@/lib/scopes";
import { boundedText } from "@/lib/validation";

const PAIRING_TTL_MS = 10 * 60 * 1_000;

function hashDeviceCode(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function generateUserCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += alphabet[bytes[index]! % alphabet.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function startAgentPairing(opts: {
  agentName: unknown;
  requestedScopes?: unknown;
  origin: string;
}) {
  const agentName = boundedText(opts.agentName, "agentName", 80, {
    required: true,
  })!;
  const requestedScopes = normalizeAgentScopes(
    opts.requestedScopes,
    PAIRING_AGENT_SCOPES,
  );
  const deviceCode = `hp_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
  const db = getDb();

  let created;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const userCode = generateUserCode();
    try {
      [created] = await db
        .insert(agentPairings)
        .values({
          deviceCodeHash: hashDeviceCode(deviceCode),
          userCode,
          agentName,
          requestedScopes,
          expiresAt,
        })
        .returning();
      break;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
  if (!created) throw new AgentApiError(503, "Could not start agent connection");

  const origin = opts.origin.replace(/\/$/, "");
  return {
    deviceCode,
    userCode: created.userCode,
    verificationUrl: `${origin}/connect/${created.userCode}`,
    expiresIn: Math.floor(PAIRING_TTL_MS / 1_000),
    interval: 5,
    requestedScopes,
  };
}

export async function getPairingForHuman(userCode: string) {
  const [pairing] = await getDb()
    .select({
      userCode: agentPairings.userCode,
      agentName: agentPairings.agentName,
      requestedScopes: agentPairings.requestedScopes,
      status: agentPairings.status,
      expiresAt: agentPairings.expiresAt,
    })
    .from(agentPairings)
    .where(eq(agentPairings.userCode, userCode.trim().toUpperCase()))
    .limit(1);
  return pairing ?? null;
}

export async function decideAgentPairing(opts: {
  user: User;
  userCode: string;
  decision: "approved" | "denied";
}) {
  const now = new Date();
  const [updated] = await getDb()
    .update(agentPairings)
    .set({
      status: opts.decision,
      userId: opts.user.id,
      approvedAt: opts.decision === "approved" ? now : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(agentPairings.userCode, opts.userCode.trim().toUpperCase()),
        eq(agentPairings.status, "pending"),
        gt(agentPairings.expiresAt, now),
      ),
    )
    .returning();
  if (!updated) {
    throw new AgentApiError(
      404,
      "This connection code is invalid, expired, or already decided",
    );
  }
  await writeAudit({
    actorUserId: opts.user.id,
    actorKind: "user",
    action:
      opts.decision === "approved"
        ? "agent_pairing.approved"
        : "agent_pairing.denied",
    entityType: "agent_pairing",
    entityId: updated.id,
    metadata: {
      agentName: updated.agentName,
      requestedScopes: updated.requestedScopes,
    },
  });
  return {
    status: updated.status,
    agentName: updated.agentName,
  };
}

export async function exchangeAgentPairing(deviceCode: unknown) {
  const code = boundedText(deviceCode, "deviceCode", 128, {
    required: true,
  })!;
  if (!code.startsWith("hp_")) {
    throw new AgentApiError(400, "Invalid device code");
  }

  const db = getDb();
  const [pairing] = await db
    .select()
    .from(agentPairings)
    .where(eq(agentPairings.deviceCodeHash, hashDeviceCode(code)))
    .limit(1);
  if (!pairing) throw new AgentApiError(404, "Connection request not found");
  if (pairing.expiresAt <= new Date() || pairing.status === "expired") {
    if (pairing.status === "pending") {
      await db
        .update(agentPairings)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(agentPairings.id, pairing.id));
    }
    throw new AgentApiError(410, "Connection request expired", {
      code: "expired_token",
    });
  }
  if (pairing.status === "pending") {
    throw new AgentApiError(428, "Waiting for the human to approve", {
      code: "authorization_pending",
      interval: 5,
    });
  }
  if (pairing.status === "denied") {
    throw new AgentApiError(403, "The human declined this connection", {
      code: "access_denied",
    });
  }
  if (pairing.status === "consumed") {
    throw new AgentApiError(409, "This connection credential was already issued");
  }
  if (!pairing.userId) {
    throw new AgentApiError(409, "Connection approval has no user");
  }

  const { rawKey, keyHash, keyPrefix } = generateApiKey();
  const result = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(agentPairings)
      .set({ status: "consumed", consumedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(agentPairings.id, pairing.id),
          eq(agentPairings.status, "approved"),
        ),
      )
      .returning();
    if (!claimed) {
      throw new AgentApiError(
        409,
        "This connection credential was already issued",
      );
    }
    const [key] = await tx
      .insert(apiKeys)
      .values({
        userId: pairing.userId!,
        name: pairing.agentName,
        keyHash,
        keyPrefix,
        scopes: pairing.requestedScopes,
      })
      .returning();
    await tx
      .update(agentPairings)
      .set({ apiKeyId: key.id })
      .where(eq(agentPairings.id, pairing.id));
    return key;
  });

  await writeAudit({
    actorUserId: pairing.userId,
    actorApiKeyId: result.id,
    actorKind: "system",
    action: "agent_pairing.consumed",
    entityType: "api_key",
    entityId: result.id,
    metadata: {
      agentName: pairing.agentName,
      scopes: pairing.requestedScopes,
    },
  });

  return {
    accessToken: rawKey,
    tokenType: "Bearer",
    scopes: pairing.requestedScopes,
    agentName: pairing.agentName,
  };
}
