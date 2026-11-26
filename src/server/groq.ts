import "server-only";

import { ChatGroq } from "@langchain/groq";
import { HttpError } from "./http";

export function createGroqModel(maxTokens: number) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new HttpError(503, "AI service is unavailable");

  return new ChatGroq({
    apiKey,
    model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
    timeout: 20_000,
    maxRetries: 0,
    maxTokens,
  });
}
