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
