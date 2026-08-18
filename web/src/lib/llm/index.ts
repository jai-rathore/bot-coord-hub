import { GeminiProvider, geminiApiKey } from "./gemini";
import { LlmUnavailableError, type LlmProvider } from "./provider";

export * from "./provider";
export { GeminiProvider, geminiApiKey, hostedAgentModel } from "./gemini";

/** True when a hosted agent can actually run. */
export function hostedAgentAvailable(): boolean {
  const provider = (process.env.HOSTED_AGENT_PROVIDER?.trim() || "gemini").toLowerCase();
  if (provider === "gemini") return Boolean(geminiApiKey());
  return false;
}

/**
 * Resolve the configured provider. Throws LlmUnavailableError when nothing is
 * configured; callers degrade to the tap-only UI rather than failing the page.
 */
export function getLlmProvider(): LlmProvider {
  const provider = (process.env.HOSTED_AGENT_PROVIDER?.trim() || "gemini").toLowerCase();
  if (provider === "gemini") return new GeminiProvider();
  throw new LlmUnavailableError(`Unknown HOSTED_AGENT_PROVIDER: ${provider}`);
}
