type LlmApiError = {
  status?: number;
  message: string;
};

export function formatLlmApiError(err: LlmApiError): string {
  if (err.status === 403) {
    return "Groq rejected your API key (403 Forbidden). Create a new key at console.groq.com, set LLM_API_KEY in .env.local, and restart pnpm dev.";
  }
  if (err.status === 401) {
    return "Invalid API key. Check LLM_API_KEY in .env.local and restart pnpm dev.";
  }
  return err.message || "Unexpected error contacting the model.";
}
