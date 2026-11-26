import "server-only";

import { ObjectId } from "mongodb";
import { z } from "zod";
import {
  dateString,
  transactionTypeSchema,
  type AllTransactionsResponse,
  type ApiMessageResponse,
  type Expense,
  type SalaryCredit,
  type TransactionResponse,
} from "@/lib/api-contracts";
import { authorize } from "./auth";
import { extractTransactions } from "./ai";
import { mongoIds, type ExpenseRecord } from "./db";
import { apiRoute, formatDate, HttpError, readBody } from "./http";

const transactionFields = z.object({
  amount: z.number().finite().positive(),
  category: z.string().nullish(),
  date: dateString.nullish(),
});
const transactionCreate = transactionFields.extend({ type: transactionTypeSchema.default("expense") });
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

function splitTransactions(records: ExpenseRecord[]) {
  const expenses: Expense[] = [];
  const credits: SalaryCredit[] = [];
  for (const record of records) {
    const entry = toExpense(record);
    if (record.type === "credit") {
      credits.push({ ...entry, type: "credit", category: "Salary" });
    } else {
      expenses.push(entry);
    }
  }
  return { expenses, credits };
}

export const listTransactions = apiRoute(async (request: Request, context: UserContext) => {
  const { userId } = await context.params;
  const db = await authorize(request, userId);
  const records = await db.collection<ExpenseRecord>("expenses").find({ userId }).toArray();
  const { expenses: allExpenses, credits } = splitTransactions(records);
  return Response.json({ userId, allExpenses, credits } satisfies AllTransactionsResponse, {
    headers: { "Cache-Control": "private, no-store" },
  });
});

export const addTransaction = apiRoute(async (request: Request, context: UserContext) => {
  const { userId } = await context.params;
  const db = await authorize(request, userId);
  const { amount, category, date, type } = await readBody(request, transactionCreate);
  const entry: ExpenseRecord = {
    _id: new ObjectId(),
    userId,
    type,
    amount,
    category: type === "credit" ? "Salary" : category,
    date: date ?? formatDate(new Date()),
  };
  await db.collection<ExpenseRecord>("expenses").insertOne(entry);
  return Response.json({ userId, ...splitTransactions([entry]) } satisfies TransactionResponse);
});

export const addAiTransactions = apiRoute(async (request: Request, context: UserContext) => {
  const { userId } = await context.params;
  const db = await authorize(request, userId);
  const { prompt } = await readBody(request, promptSchema);
  const extracted = await extractTransactions(prompt);
  if (!extracted.length) throw new HttpError(400, "No transactions with a positive amount were found");

  const entries = extracted.map((entry) => ({ _id: new ObjectId(), userId, ...entry }));
  await db.collection<ExpenseRecord>("expenses").insertMany(entries);
  return Response.json({ userId, ...splitTransactions(entries) } satisfies TransactionResponse, { status: 201 });
});

async function ownedTransaction(request: Request, context: TransactionContext) {
  const { userId, transactionId } = await context.params;
  const db = await authorize(request, userId);
  const expenses = db.collection<ExpenseRecord>("expenses");
  const existing = await expenses.findOne({ _id: mongoIds(transactionId) });
  if (!existing) throw new HttpError(404, "Transaction not found");
  if (existing.userId !== userId) throw new HttpError(403, "Access denied");
  return { expenses, filter: { _id: existing._id, userId }, type: existing.type };
}

export const updateTransaction = apiRoute(async (request: Request, context: TransactionContext) => {
  const { expenses, filter, type } = await ownedTransaction(request, context);
  const { amount, category, date } = await readBody(request, transactionPatch);
  const update: Partial<Pick<ExpenseRecord, "amount" | "category" | "date">> = {
    ...(amount != null ? { amount } : {}),
    ...(category != null && type !== "credit" ? { category } : {}),
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
