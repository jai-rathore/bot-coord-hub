/**
 * Gemini via the AI Studio REST API: the same model and key the
 * personal-web-agent project uses (CHAT_MODEL / GEMINI_API_KEY), called with
 * plain fetch so HoneyMatcha takes on no new dependency.
 */

import { fetchWithTimeout } from "@/lib/fetch-timeout";

/** A model turn is bounded so a Sage worker lease can recover promptly. */
const GEMINI_TIMEOUT_MS = 25_000;
import {
  LlmUnavailableError,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
  type LlmToolCall,
} from "./provider";

const DEFAULT_MODEL = "gemini-3.7-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiPart = {
  text?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

/** Gemini accepts an OpenAPI schema subset and rejects additionalProperties. */
function geminiToolSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(geminiToolSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "additionalProperties")
      .map(([key, nested]) => [key, geminiToolSchema(nested)]),
  );
}

export function geminiApiKey(): string | null {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    null
  );
}

export function hostedAgentModel(): string {
  return process.env.HOSTED_AGENT_MODEL?.trim() || DEFAULT_MODEL;
}

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey?: string, model?: string) {
    const key = apiKey ?? geminiApiKey();
    if (!key) throw new LlmUnavailableError("GEMINI_API_KEY is not configured");
    this.apiKey = key;
    this.model = model ?? hostedAgentModel();
  }

  async complete(request: LlmRequest): Promise<LlmResult> {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: request.messages.map((message) => ({
        role: message.role,
        parts: [{ text: message.text }],
      })),
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        maxOutputTokens: request.maxOutputTokens ?? 512,
      },
    };
    if (request.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: request.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: geminiToolSchema(tool.parameters),
          })),
        },
      ];
      if (request.requiredToolName) {
        const advertised = request.tools.some(
          (tool) => tool.name === request.requiredToolName,
        );
        if (!advertised) {
          throw new Error("Required tool must be present in the advertised tool set");
        }
        body.toolConfig = {
          functionCallingConfig: {
            mode: "ANY",
            allowedFunctionNames: [request.requiredToolName],
          },
        };
      }
    }

    const res = await fetchWithTimeout(
      `${ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(body),
        signal: request.signal,
      },
      GEMINI_TIMEOUT_MS,
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini ${res.status}: ${detail.slice(0, 300)}`);
    }

    const data = (await res.json()) as GeminiResponse;
    const parts = data.candidates?.[0]?.content?.parts ?? [];

    const texts: string[] = [];
    const toolCalls: LlmToolCall[] = [];
    for (const part of parts) {
      if (typeof part.text === "string" && part.text.trim()) {
        texts.push(part.text);
      }
      if (part.functionCall?.name) {
        toolCalls.push({
          name: part.functionCall.name,
          args: part.functionCall.args ?? {},
        });
      }
    }

    return {
      text: texts.length > 0 ? texts.join("\n").trim() : null,
      toolCalls,
      tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
      tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
      provider: this.name,
      model: this.model,
    };
  }
}
