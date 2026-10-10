import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

export type Candidate = { name: string; model: LanguageModel };

// Ordered fallback chain built from whichever API keys exist.
export function modelChain(): Candidate[] {
  const chain: Candidate[] = [];

  // Groq first: fast and reliable at multi-step tool calling. Free routers are fallbacks only.
  if (process.env.GROQ_API_KEY) {
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    const id = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
    chain.push({ name: `groq:${id}`, model: groq(id) });
  }

  if (process.env.OPENROUTER_API_KEY) {
    const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
    const ids = (process.env.OPENROUTER_MODELS ?? "openrouter/free")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const id of ids) chain.push({ name: `openrouter:${id}`, model: openrouter(id) });
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
    const id = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
    chain.push({ name: `google:${id}`, model: google(id) });
  }
  return chain;
}
