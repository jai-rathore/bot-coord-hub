/**
 * Minimal LLM interface. Deliberately narrow: one call, tool-calling only,
 * no streaming, no SDK. Mirrors how triage.ts already talks to OpenAI/Grok.
 */

export type LlmRole = "user" | "model";

export type LlmMessage = { role: LlmRole; text: string };

export type LlmToolDef = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type LlmToolCall = { name: string; args: Record<string, unknown> };

export type LlmResult = {
  text: string | null;
  toolCalls: LlmToolCall[];
  tokensIn: number;
  tokensOut: number;
  provider: string;
  model: string;
};

export type LlmRequest = {
  system: string;
  messages: LlmMessage[];
  tools: LlmToolDef[];
  /** Force exactly one call to this advertised tool when the provider supports it. */
  requiredToolName?: string;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Owner used for the shared per-person daily token and cost budget. */
  budget?: { userId: string };
};

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(request: LlmRequest): Promise<LlmResult>;
}

export class LlmUnavailableError extends Error {
  constructor(message = "No language model is configured") {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

export class LlmProviderError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(
    message: string,
    options: { retryable: boolean; status?: number | null; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "LlmProviderError";
    this.retryable = options.retryable;
    this.status = options.status ?? null;
  }
}

export class LlmCircuitOpenError extends Error {
  constructor(message = "The hosted model circuit is temporarily open") {
    super(message);
    this.name = "LlmCircuitOpenError";
  }
}

export class LlmCapacityError extends Error {
  constructor(message = "The hosted model is at its concurrency limit") {
    super(message);
    this.name = "LlmCapacityError";
  }
}

export class LlmBudgetExceededError extends Error {
  constructor(message = "The daily hosted-model budget has been reached") {
    super(message);
    this.name = "LlmBudgetExceededError";
  }
}
