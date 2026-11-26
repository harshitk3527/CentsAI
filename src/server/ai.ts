import "server-only";

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGroq } from "@langchain/groq";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { dateString, transactionTypeSchema } from "@/lib/api-contracts";
import { formatDate, HttpError } from "./http";

const categories = ["food", "entertainment", "bills", "shopping", "travel", "health", "education", "others", "salary"] as const;
const positiveAmount = z.number().finite().positive();
const modelExpense = z.object({
  amount: z.number(),
  currency: z.string(),
  transactionDate: z.string(),
  category: z.enum(categories),
});
const modelOutput = z.object({ transactions: z.array(modelExpense) });
type ModelOutput = z.infer<typeof modelOutput>;
const validatedTransactions = z.array(modelExpense.extend({
  amount: z.number().finite().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  transactionDate: dateString,
})).max(50);

const state = new StateSchema({
  prompt: z.string(),
  transactions: validatedTransactions.optional(),
  entries: z.array(z.object({
    amount: positiveAmount,
    date: dateString,
    category: z.string(),
    type: transactionTypeSchema,
  })).optional(),
});

async function getInrRate(currency: string) {
  const url = new URL(currency, "https://open.er-api.com/v6/latest/");
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5_000),
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new HttpError(502, "Currency conversion is temporarily unavailable");

  const rate = z.object({ rates: z.object({ INR: positiveAmount }) })
    .safeParse(await response.json());
  if (!rate.success) throw new HttpError(502, "Currency conversion is temporarily unavailable");
  return rate.data.rates.INR;
}

const workflow = new StateGraph(state)
  .addNode("extractTransactions", async ({ prompt }) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new HttpError(503, "AI service is unavailable");

    const model = new ChatGroq({
      apiKey,
      model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
      timeout: 20_000,
      maxRetries: 0,
      maxTokens: 4096,
    }).withStructuredOutput<ModelOutput>(modelOutput, { name: "extract_expenses", method: "jsonSchema" });

    const today = formatDate(new Date());
    const result = await model.invoke([
      new SystemMessage([
        "Extract actual expenses and salary payments the user received. Today is " + today + ".",
        "Return at most 50 entries, one per purchase, payment, or salary deposit. Ignore planned or expected transactions.",
        "Use category salary only for salary or wages the user has already received. Payroll the user paid out is an expense.",
        "Use 0 for a missing amount. Return an empty array if none of the supported transactions occurred.",
        "Report each amount in its original currency using the ISO 4217 code. Default to INR if no currency is specified. Do not convert currencies.",
        "Use YYYY-MM-DD dates. Resolve relative dates and expressions such as aaj (today) or kal (yesterday in past-tense text) using today's date. Default to today for expenses with no date.",
        "Use the closest category from the response schema. Use others when no category fits.",
      ].join("\n")),
      new HumanMessage(prompt),
    ]);
    return { transactions: validatedTransactions.parse(result.transactions) };
  })
  .addNode("convertToInr", async ({ transactions = [] }) => {
    const entries = transactions.filter(({ amount }) => amount > 0);
    const currencies = new Set(entries.map(({ currency }) => currency));
    currencies.delete("INR");

    const rates = new Map(await Promise.all(
      Array.from(currencies, async (currency) => [currency, await getInrRate(currency)] as const),
    ));
    rates.set("INR", 1);

    return {
      entries: entries.map(({ amount, currency, transactionDate, category }) => ({
        amount: positiveAmount.parse(amount * (rates.get(currency) ?? 0)),
        date: transactionDate,
        category: category.charAt(0).toUpperCase() + category.slice(1),
        type: category === "salary" ? "credit" : "expense",
      })),
    };
  })
  .addEdge(START, "extractTransactions")
  .addEdge("extractTransactions", "convertToInr")
  .addEdge("convertToInr", END)
  .compile();

export async function extractTransactions(prompt: string) {
  try {
    const { entries } = await workflow.invoke({ prompt });
    return entries ?? [];
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error("Groq expense workflow failed", error instanceof Error ? error.name : "Unknown error");
    throw new HttpError(502, "AI service could not process your request");
  }
}
