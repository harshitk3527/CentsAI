import "server-only";

import { z } from "zod";
import type { ApiErrorResponse } from "@/lib/api-contracts";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class ConfigurationError extends Error {}

export function formatDate(date: Date, timeZone = process.env.APP_TIME_ZONE || "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"].map((name) => parts.find(({ type }) => type === name)?.value).join("-");
}

export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
  return schema.parse(body);
}

export function apiRoute<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ConfigurationError) {
        console.error("CentsAI configuration error:", error.message);
        const message = process.env.NODE_ENV === "development" ? error.message : "Service temporarily unavailable";
        return Response.json({ message } satisfies ApiErrorResponse, { status: 503 });
      }
      if (error instanceof HttpError) {
        return Response.json({ message: error.message } satisfies ApiErrorResponse, { status: error.status });
      }
      if (error instanceof z.ZodError) {
        const errors = Object.fromEntries(error.issues.map(({ path, message }) => [path.join(".") || "body", message]));
        return Response.json({ message: "Validation failed", errors } satisfies ApiErrorResponse, { status: 400 });
      }
      console.error("CentsAI API request failed", error instanceof Error ? error.name : "Unknown error");
      return Response.json({ message: "Something went wrong" } satisfies ApiErrorResponse, { status: 500 });
    }
  };
}
