import "server-only";

import type { Db } from "mongodb";
import { z } from "zod";
import { budgetAmountSchema, monthString, type MonthlyBudget } from "@/lib/api-contracts";
import { authorize } from "./auth";
import { apiRoute, formatDate, readBody } from "./http";

interface BudgetRecord {
  _id: string;
  userId: string;
  month: string;
  amount: number;
}

type UserContext = { params: Promise<{ userId: string }> };
const updateSchema = z.object({ amount: budgetAmountSchema.nullable() });
const budgetHeaders = { "Cache-Control": "private, no-store" };

export async function readBudgetAmount(db: Db, userId: string, month: string) {
  const budget = await db.collection<BudgetRecord>("monthlyBudgets").findOne({ _id: `${userId}:${month}` });
  return budget?.amount ?? null;
}

async function getBudgetContext(request: Request, context: UserContext) {
  const { userId } = await context.params;
  const db = await authorize(request, userId);
  const param = new URL(request.url).searchParams.get("month");
  const month = monthString.parse(param ?? formatDate(new Date()).slice(0, 7));
  return { db, month, userId };
}

export const getMonthlyBudget = apiRoute(async (request: Request, context: UserContext) => {
  const { db, month, userId } = await getBudgetContext(request, context);
  const amount = await readBudgetAmount(db, userId, month);
  return Response.json({ month, amount } satisfies MonthlyBudget, { headers: budgetHeaders });
});

export const setMonthlyBudget = apiRoute(async (request: Request, context: UserContext) => {
  const { db, month, userId } = await getBudgetContext(request, context);
  const { amount } = await readBody(request, updateSchema);
  const budgets = db.collection<BudgetRecord>("monthlyBudgets");
  const filter = { _id: `${userId}:${month}` };
  if (amount === null) {
    await budgets.deleteOne(filter);
  } else {
    await budgets.updateOne(filter, { $set: { amount }, $setOnInsert: { userId, month } }, { upsert: true });
  }
  return Response.json({ month, amount } satisfies MonthlyBudget, { headers: budgetHeaders });
});
