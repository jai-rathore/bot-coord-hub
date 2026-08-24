import {
  and,
  count,
  eq,
  sql,
  sum,
} from "drizzle-orm";
import { getDb } from "@/db";
import {
  llmDailyUsage,
  llmProviderCircuits,
  llmProviderLeases,
} from "@/db/schema";
import {
  LlmBudgetExceededError,
  LlmCapacityError,
  LlmCircuitOpenError,
  LlmProviderError,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
} from "./provider";

type ProviderReservation = {
  id: string;
  providerKey: string;
  usageDay: string;
  userId: string;
  inputTokensReserved: number;
  outputTokensReserved: number;
};

type ProviderRates = {
  inputPerMillion: number;
  outputPerMillion: number;
};

function positiveInteger(name: string, fallback: number, maximum: number) {
  const configured = Number(process.env[name]);
  return Number.isInteger(configured) && configured > 0
    ? Math.min(configured, maximum)
    : fallback;
}

function positiveNumber(name: string): number | null {
  const configured = Number(process.env[name]);
  return Number.isFinite(configured) && configured > 0 ? configured : null;
}

function configuredRates(): ProviderRates | null {
  const inputPerMillion = positiveNumber("SAGE_INPUT_COST_PER_MILLION_USD");
  const outputPerMillion = positiveNumber("SAGE_OUTPUT_COST_PER_MILLION_USD");
  return inputPerMillion !== null && outputPerMillion !== null
    ? { inputPerMillion, outputPerMillion }
    : null;
}

function estimatedCostUsd(
  inputTokens: number,
  outputTokens: number,
  rates: ProviderRates,
) {
  return (
    (inputTokens * rates.inputPerMillion +
      outputTokens * rates.outputPerMillion) /
    1_000_000
  );
}

function requestTokenReservation(request: LlmRequest) {
  const inputCharacters =
    request.system.length +
    request.messages.reduce((total, message) => total + message.text.length, 0) +
    JSON.stringify(request.tools).length;
  const maximumAttempts = positiveInteger(
    "SAGE_PROVIDER_MAX_ATTEMPTS",
    3,
    5,
  );
  return {
    // Three characters per token deliberately over-reserves most English text.
    input: Math.max(1, Math.ceil(inputCharacters / 3)) * maximumAttempts,
    output:
      Math.max(1, Math.floor(request.maxOutputTokens ?? 512)) * maximumAttempts,
  };
}

function providerKey(provider: LlmProvider) {
  return `${provider.name}:${provider.model}`.slice(0, 280);
}

function utcUsageDay(now: Date) {
  return now.toISOString().slice(0, 10);
}

function cleanProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 1_000);
}

export function isRetryableProviderError(error: unknown) {
  return error instanceof LlmProviderError && error.retryable;
}

export function providerRetryDelayMs(attempt: number) {
  const baseMs = positiveInteger("SAGE_PROVIDER_RETRY_BASE_MS", 500, 10_000);
  return Math.min(4_000, baseMs * 2 ** Math.max(0, attempt - 1));
}

async function reserveProviderRequest(
  provider: LlmProvider,
  request: LlmRequest,
): Promise<ProviderReservation> {
  if (!request.budget?.userId) {
    throw new LlmBudgetExceededError(
      "Hosted-model calls require an owner for budget enforcement",
    );
  }
  const userId = request.budget.userId;
  const db = getDb();
  const now = new Date();
  const key = providerKey(provider);
  const usageDay = utcUsageDay(now);
  const reserved = requestTokenReservation(request);
  const concurrencyLimit = positiveInteger(
    "SAGE_PROVIDER_MAX_CONCURRENCY",
    8,
    100,
  );
  const dailyTokenLimit = positiveInteger(
    "SAGE_USER_DAILY_TOKEN_LIMIT",
    100_000,
    10_000_000,
  );
  const dailyCostLimit = positiveNumber("SAGE_USER_DAILY_COST_LIMIT_USD");
  const rates = configuredRates();
  const leaseMs = positiveInteger("SAGE_PROVIDER_LEASE_MS", 120_000, 600_000);

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`llm-provider:${key}`}))`,
    );
    await tx
      .delete(llmProviderLeases)
      .where(sql`${llmProviderLeases.expiresAt} <= ${now}`);

    const [circuit] = await tx
      .select()
      .from(llmProviderCircuits)
      .where(eq(llmProviderCircuits.providerKey, key))
      .limit(1);
    if (circuit?.openedUntil && circuit.openedUntil > now) {
      throw new LlmCircuitOpenError(
        `The hosted model circuit is open until ${circuit.openedUntil.toISOString()}`,
      );
    }

    const [[activeRows], [usageRows], [reservedRows]] = await Promise.all([
      tx
        .select({ total: count() })
        .from(llmProviderLeases)
        .where(eq(llmProviderLeases.providerKey, key)),
      tx
        .select({
          input: sum(llmDailyUsage.inputTokens),
          output: sum(llmDailyUsage.outputTokens),
        })
        .from(llmDailyUsage)
        .where(
          and(
            eq(llmDailyUsage.userId, userId),
            eq(llmDailyUsage.providerKey, key),
            eq(llmDailyUsage.usageDay, usageDay),
          ),
        ),
      tx
        .select({
          input: sum(llmProviderLeases.inputTokensReserved),
          output: sum(llmProviderLeases.outputTokensReserved),
        })
        .from(llmProviderLeases)
        .where(
          and(
            eq(llmProviderLeases.userId, userId),
            eq(llmProviderLeases.providerKey, key),
            eq(llmProviderLeases.usageDay, usageDay),
          ),
        ),
    ]);
    if (Number(activeRows?.total ?? 0) >= concurrencyLimit) {
      throw new LlmCapacityError();
    }

    const projectedInput =
      Number(usageRows?.input ?? 0) +
      Number(reservedRows?.input ?? 0) +
      reserved.input;
    const projectedOutput =
      Number(usageRows?.output ?? 0) +
      Number(reservedRows?.output ?? 0) +
      reserved.output;
    if (projectedInput + projectedOutput > dailyTokenLimit) {
      throw new LlmBudgetExceededError(
        `The daily Sage token budget of ${dailyTokenLimit} tokens has been reached`,
      );
    }
    if (
      dailyCostLimit !== null &&
      rates &&
      estimatedCostUsd(projectedInput, projectedOutput, rates) > dailyCostLimit
    ) {
      throw new LlmBudgetExceededError(
        `The daily Sage cost budget of $${dailyCostLimit.toFixed(2)} has been reached`,
      );
    }

    const [lease] = await tx
      .insert(llmProviderLeases)
      .values({
        providerKey: key,
        userId,
        usageDay,
        inputTokensReserved: reserved.input,
        outputTokensReserved: reserved.output,
        expiresAt: new Date(now.getTime() + leaseMs),
      })
      .returning({ id: llmProviderLeases.id });
    return {
      id: lease.id,
      providerKey: key,
      usageDay,
      userId,
      inputTokensReserved: reserved.input,
      outputTokensReserved: reserved.output,
    };
  });
}

async function completeProviderRequest(
  provider: LlmProvider,
  reservation: ProviderReservation,
  result: LlmResult,
) {
  const now = new Date();
  const chargedInputTokens =
    result.tokensIn > 0
      ? Math.floor(result.tokensIn)
      : reservation.inputTokensReserved;
  const chargedOutputTokens =
    result.tokensOut > 0
      ? Math.floor(result.tokensOut)
      : reservation.outputTokensReserved;
  await getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`llm-provider:${reservation.providerKey}`}))`,
    );
    await tx
      .delete(llmProviderLeases)
      .where(eq(llmProviderLeases.id, reservation.id));
    await tx
      .insert(llmDailyUsage)
      .values({
        userId: reservation.userId,
        providerKey: reservation.providerKey,
        usageDay: reservation.usageDay,
        inputTokens: chargedInputTokens,
        outputTokens: chargedOutputTokens,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          llmDailyUsage.userId,
          llmDailyUsage.providerKey,
          llmDailyUsage.usageDay,
        ],
        set: {
          inputTokens: sql`${llmDailyUsage.inputTokens} + ${chargedInputTokens}`,
          outputTokens: sql`${llmDailyUsage.outputTokens} + ${chargedOutputTokens}`,
          updatedAt: now,
        },
      });
    await tx
      .insert(llmProviderCircuits)
      .values({
        providerKey: reservation.providerKey,
        provider: provider.name,
        model: provider.model,
        consecutiveFailures: 0,
        openedUntil: null,
        lastError: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: llmProviderCircuits.providerKey,
        set: {
          consecutiveFailures: 0,
          openedUntil: null,
          lastError: null,
          updatedAt: now,
        },
      });
  });
}

async function failProviderRequest(
  provider: LlmProvider,
  reservation: ProviderReservation,
  error: unknown,
) {
  const now = new Date();
  await getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`llm-provider:${reservation.providerKey}`}))`,
    );
    await tx
      .delete(llmProviderLeases)
      .where(eq(llmProviderLeases.id, reservation.id));
    if (!isRetryableProviderError(error)) return;

    const [current] = await tx
      .select({ failures: llmProviderCircuits.consecutiveFailures })
      .from(llmProviderCircuits)
      .where(eq(llmProviderCircuits.providerKey, reservation.providerKey))
      .limit(1);
    const failures = Number(current?.failures ?? 0) + 1;
    const threshold = positiveInteger(
      "SAGE_PROVIDER_CIRCUIT_FAILURES",
      4,
      100,
    );
    const cooldownMs = positiveInteger(
      "SAGE_PROVIDER_CIRCUIT_COOLDOWN_MS",
      60_000,
      3_600_000,
    );
    await tx
      .insert(llmProviderCircuits)
      .values({
        providerKey: reservation.providerKey,
        provider: provider.name,
        model: provider.model,
        consecutiveFailures: failures,
        openedUntil:
          failures >= threshold ? new Date(now.getTime() + cooldownMs) : null,
        lastError: cleanProviderError(error),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: llmProviderCircuits.providerKey,
        set: {
          provider: provider.name,
          model: provider.model,
          consecutiveFailures: failures,
          openedUntil:
            failures >= threshold ? new Date(now.getTime() + cooldownMs) : null,
          lastError: cleanProviderError(error),
          updatedAt: now,
        },
      });
  });
}

function waitForRetry(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Model request cancelled"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error("Model request cancelled"));
      },
      { once: true },
    );
  });
}

/** Fleet-wide concurrency, retry, circuit, and user-budget wrapper. */
export class ResilientLlmProvider implements LlmProvider {
  readonly name: string;
  readonly model: string;

  constructor(private readonly inner: LlmProvider) {
    this.name = inner.name;
    this.model = inner.model;
  }

  async complete(request: LlmRequest): Promise<LlmResult> {
    const reservation = await reserveProviderRequest(this.inner, request);
    const attempts = positiveInteger("SAGE_PROVIDER_MAX_ATTEMPTS", 3, 5);
    let finalError: unknown;
    try {
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          const result = await this.inner.complete(request);
          await completeProviderRequest(this.inner, reservation, result);
          return result;
        } catch (error) {
          finalError = error;
          if (!isRetryableProviderError(error) || attempt === attempts) break;
          await waitForRetry(providerRetryDelayMs(attempt), request.signal);
        }
      }
      await failProviderRequest(this.inner, reservation, finalError);
      throw finalError;
    } catch (error) {
      if (error !== finalError) {
        await failProviderRequest(this.inner, reservation, error);
      }
      throw error;
    }
  }
}
