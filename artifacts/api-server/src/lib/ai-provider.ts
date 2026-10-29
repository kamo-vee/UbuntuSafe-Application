export class ProviderError extends Error {
  readonly expose = true;
  constructor(message: string, readonly code: string, readonly statusCode = 503, readonly upstreamStatus?: number) { super(message); }
}

/** Stores only public status codes, never the provider's raw diagnostic text. */
export class GeminiHttpError extends Error {
  constructor(readonly status: number, readonly providerCode: string) { super("Gemini request failed."); }
}

export function aiModels() {
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite";
  return {
    scan: process.env.GEMINI_SCAN_MODEL?.trim() || model,
    vision: process.env.GEMINI_VISION_MODEL?.trim() || model,
    transcription: process.env.GEMINI_TRANSCRIPTION_MODEL?.trim() || model,
  };
}

type GenerateInput = {
  model: string;
  prompt: string;
  instruction?: string;
  media?: { mimeType: string; data: string };
  schema?: Record<string, unknown>;
};
type GeminiResponse = {
  error?: { status?: string; details?: { reason?: string }[] };
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
};

export function createAIClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new ProviderError(
    "AI is not configured. Set GEMINI_API_KEY in the backend's private .env file and restart the API. No AI result was saved.",
    "AI_NOT_CONFIGURED",
  );
  // Credentials always go to Google's official endpoint, except isolated loopback tests.
  let base = "https://generativelanguage.googleapis.com/v1beta";
  if (process.env.NODE_ENV === "test" && process.env.GEMINI_TEST_BASE_URL) {
    const url = new URL(process.env.GEMINI_TEST_BASE_URL);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password)
      throw new ProviderError("Invalid isolated AI test endpoint.", "AI_TEST_CONFIGURATION");
    base = url.toString().replace(/\/$/, "");
  }
  return {
    async generate(input: GenerateInput): Promise<string> {
      try {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(input.model))
          throw new ProviderError("Check the server's Gemini model name.", "AI_MODEL_ACCESS");
        const response = await fetch(`${base}/models/${encodeURIComponent(input.model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          signal: AbortSignal.timeout(45000),
          redirect: "error",
          body: JSON.stringify({
            contents: [{ role: "user", parts: [
              { text: input.prompt },
              ...(input.media ? [{ inlineData: input.media }] : []),
            ] }],
            ...(input.instruction ? { systemInstruction: { parts: [{ text: input.instruction }] } } : {}),
            generationConfig: {
              maxOutputTokens: 4096,
              ...(input.schema ? { responseMimeType: "application/json", responseSchema: input.schema } : {}),
            },
          }),
        });
        const body = await response.json() as GeminiResponse;
        if (!response.ok) {
          const keyReason = body?.error?.details?.find((item) => item.reason?.startsWith("API_KEY_"))?.reason;
          throw new GeminiHttpError(response.status, keyReason || body?.error?.status || "REQUEST_FAILED");
        }
        const candidate = body?.candidates?.[0];
        if (body?.promptFeedback?.blockReason || ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"].includes(candidate?.finishReason || ""))
          throw new ProviderError("Gemini blocked this content. No scan or extraction was saved.", "AI_RESPONSE_BLOCKED", 422);
        if (!candidate || candidate.finishReason !== "STOP")
          throw new ProviderError("Gemini did not return a complete result. Try a shorter input later. No result was saved.", "AI_INCOMPLETE_RESPONSE");
        return (candidate.content?.parts || []).filter((part) => !part.thought && typeof part.text === "string")
          .map((part) => part.text).join("").trim();
      } catch (error) { throw aiFailure(error); }
    },
  };
}

/** Never forward provider error messages: they may contain private credentials. */
export function aiFailure(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof GeminiHttpError) {
    if (error.status === 401 || error.providerCode.startsWith("API_KEY_"))
      return new ProviderError("Gemini rejected the backend API key. Check GEMINI_API_KEY in the private .env and restart the API. No AI result was saved.", "AI_KEY_REJECTED", 503, error.status);
    if (error.status === 403 || error.status === 404)
      return new ProviderError("Gemini access is unavailable for this project, region or model. Check Google AI Studio and the server's model settings. No AI result was saved.", "AI_MODEL_ACCESS", 503, error.status);
    if (error.status === 429)
      return new ProviderError("Gemini request or token quota is unavailable. Check your free-tier limits in Google AI Studio and wait for limits to reset. No paid fallback or AI result was used.", "AI_RATE_LIMITED", 503, error.status);
    if (error.status === 400)
      return new ProviderError("Gemini could not accept the request. Check the model and supported input format. No result was saved.", "AI_REQUEST_INVALID", 503, error.status);
    if (error.status >= 500)
      return new ProviderError("Gemini is temporarily unavailable. Please try again later. No result was saved.", "AI_UNAVAILABLE", 503, error.status);
  }
  if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))
    return new ProviderError("The Gemini request timed out. Please try again later. No result was saved.", "AI_TIMEOUT");
  return new ProviderError("The AI service could not complete this request. Check the connection and provider configuration. No AI result was saved.", "AI_REQUEST_FAILED");
}
