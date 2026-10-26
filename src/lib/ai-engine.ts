import { getGeminiKey } from "./gemini";
import type { Engine } from "./article-ai";

/**
 * Return server engine by default (server-side Gemini 3.8 Flash configured with author style).
 * If user saved an explicit custom Gemini key in settings, support it.
 */
export async function resolveEngine(): Promise<Engine> {
  const key = getGeminiKey();
  if (key) return { kind: "gemini", key };
  return { kind: "server" };
}

