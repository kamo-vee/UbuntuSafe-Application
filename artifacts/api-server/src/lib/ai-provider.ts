import OpenAI from "openai";

export class ProviderError extends Error {
  readonly expose = true;
  constructor(message: string, readonly code: string, readonly statusCode = 503) { super(message); }
}

export function aiModels() {
  return {
    scan: process.env.OPENAI_SCAN_MODEL?.trim() || "gpt-5-mini",
    vision: process.env.OPENAI_VISION_MODEL?.trim() || "gpt-5-mini",
    transcription: process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "gpt-4o-mini-transcribe",
  };
}

export function createAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ProviderError(
    "AI is not configured. Set OPENAI_API_KEY in the backend's private .env file and restart the API. No AI result was saved.",
    "AI_NOT_CONFIGURED",
  );
  return new OpenAI({ apiKey, timeout: 45000, maxRetries: 0 });
}

/** Never forward provider error messages: they may contain private credentials. */
export function aiFailure(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof OpenAI.APIError) {
    if (error.code === "credit_balance_exhausted" || error.code === "insufficient_quota" || error.type === "insufficient_quota")
      return new ProviderError("OpenAI API credit or quota is unavailable. The account owner must check OpenAI API billing. No AI result was saved.", "AI_CREDIT_REQUIRED");
    if (error.status === 401)
      return new ProviderError("OpenAI rejected the backend API key. Replace OPENAI_API_KEY with a valid OpenAI secret key and restart the API. No AI result was saved.", "AI_KEY_REJECTED");
    if (error.status === 403 || error.status === 404)
      return new ProviderError("The OpenAI project cannot access the requested model. Check its permissions and the server's model settings. No AI result was saved.", "AI_MODEL_ACCESS");
    if (error.status === 429)
      return new ProviderError("OpenAI temporarily limited requests. Please wait before trying again. No AI result was saved.", "AI_RATE_LIMITED");
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError)
    return new ProviderError("The OpenAI request timed out. Please try again later. No AI result was saved.", "AI_TIMEOUT");
  return new ProviderError("The AI service could not complete this request. Check the connection and provider configuration. No AI result was saved.", "AI_REQUEST_FAILED");
}
