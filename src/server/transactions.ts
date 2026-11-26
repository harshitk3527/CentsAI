import "server-only";

import { ObjectId } from "mongodb";
import { z } from "zod";
import {
  dateString,
  type AllTransactionsResponse,
  type ApiMessageResponse,
  type Expense,
  type TransactionResponse,
} from "@/lib/api-contracts";
import { authorize } from "./auth";
import { extractExpenses } from "./ai";
import { mongoIds, type ExpenseRecord } from "./db";
import { apiRoute, formatDate, HttpError, readBody } from "./http";

const transactionFields = z.object({
  amount: z.number().finite().positive(),
  category: z.string().nullish(),
  date: dateString.nullish(),
});
const transactionPatch = transactionFields.partial().extend({
  amount: transactionFields.shape.amount.nullish(),
});
const promptSchema = z.object({ prompt: z.string().trim().min(1).max(4_000) });

type UserContext = { params: Promise<{ userId: string }> };
type TransactionContext = { params: Promise<{ userId: string; transactionId: string }> };

function toExpense({ _id, amount, category, date }: ExpenseRecord): Expense {
  return {
    id: _id.toString(),
    amount,
    category: category ?? "Other",
    transactionDate: typeof date === "string"
      ? date
      : formatDate(date, process.env.LEGACY_MONGO_TIME_ZONE || process.env.APP_TIME_ZONE || "Asia/Kolkata"),
  };
}

export const listTransactions = apiRoute(async (request: Request, context: UserContext) => {
  const { userId } = await context.params;
  const db = await authorize(request, userId);
  const expenses = await db.collection<ExpenseRecord>("expenses").find({ userId }).toArray();
  return Response.json({ userId, allExpenses: expenses.map(toExpense) } satisfies AllTransactionsResponse, {
    headers: { "Cache-Control": "private, no-store" },
  });
});

export const addTransaction = apiRoute(async (request: Request, context: UserContext) => {
  const { userId } = await context.params;
  const db = await authorize(request, userId);
  const { amount, category, date } = await readBody(request, transactionFields);
  const expense: ExpenseRecord = { _id: new ObjectId(), userId, amount, category, date: date ?? formatDate(new Date()) };
  await db.collection<ExpenseRecord>("expenses").insertOne(expense);
  return Response.json({ userId, expenses: [toExpense(expense)] } satisfies TransactionResponse);
});

export const addAiTransactions = apiRoute(async (request: Request, context: UserContext) => {
  const { userId } = await context.params;
  const db = await authorize(request, userId);
  const { prompt } = await readBody(request, promptSchema);
  const extracted = await extractExpenses(prompt);
  if (!extracted.length) throw new HttpError(400, "No expenses with a positive amount were found");

  const expenses = extracted.map((expense) => ({ _id: new ObjectId(), userId, ...expense }));
  await db.collection<ExpenseRecord>("expenses").insertMany(expenses);
  return Response.json({ userId, expenses: expenses.map(toExpense) } satisfies TransactionResponse, { status: 201 });
});

async function ownedTransaction(request: Request, context: TransactionContext) {
  const { userId, transactionId } = await context.params;
  const db = await authorize(request, userId);
  const expenses = db.collection<ExpenseRecord>("expenses");
  const existing = await expenses.findOne({ _id: mongoIds(transactionId) });
  if (!existing) throw new HttpError(404, "Transaction not found");
  if (existing.userId !== userId) throw new HttpError(403, "Access denied");
  return { expenses, filter: { _id: existing._id, userId } };
}

export const updateTransaction = apiRoute(async (request: Request, context: TransactionContext) => {
  const { expenses, filter } = await ownedTransaction(request, context);
  const { amount, category, date } = await readBody(request, transactionPatch);
  const update: Partial<Pick<ExpenseRecord, "amount" | "category" | "date">> = {
    ...(amount != null ? { amount } : {}),
    ...(category != null ? { category } : {}),
    ...(date != null ? { date } : {}),
  };
  if (Object.keys(update).length) {
    const result = await expenses.updateOne(filter, { $set: update });
    if (!result.matchedCount) throw new HttpError(404, "Transaction not found");
  }
  return Response.json({ message: "Transaction updated successfully" } satisfies ApiMessageResponse);
});

export const deleteTransaction = apiRoute(async (request: Request, context: TransactionContext) => {
  const { expenses, filter } = await ownedTransaction(request, context);
  const result = await expenses.deleteOne(filter);
  if (!result.deletedCount) throw new HttpError(404, "Transaction not found");
  return Response.json({ message: "Transaction deleted successfully" } satisfies ApiMessageResponse);
});
