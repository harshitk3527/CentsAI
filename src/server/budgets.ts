import "server-only";

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

async function getBudgetContext(request: Request, context: UserContext) {
  const { userId } = await context.params;
  const db = await authorize(request, userId);
  const param = new URL(request.url).searchParams.get("month");
  const month = monthString.parse(param ?? formatDate(new Date()).slice(0, 7));
  const budgets = db.collection<BudgetRecord>("monthlyBudgets");
  return { month, userId, budgets, filter: { _id: `${userId}:${month}` } };
}

export const getMonthlyBudget = apiRoute(async (request: Request, context: UserContext) => {
  const { month, budgets, filter } = await getBudgetContext(request, context);
  const budget = await budgets.findOne(filter);
  return Response.json({ month, amount: budget?.amount ?? null } satisfies MonthlyBudget, { headers: budgetHeaders });
});

export const setMonthlyBudget = apiRoute(async (request: Request, context: UserContext) => {
  const { month, userId, budgets, filter } = await getBudgetContext(request, context);
  const { amount } = await readBody(request, updateSchema);
  if (amount === null) {
    await budgets.deleteOne(filter);
  } else {
    await budgets.updateOne(filter, { $set: { amount }, $setOnInsert: { userId, month } }, { upsert: true });
  }
  return Response.json({ month, amount } satisfies MonthlyBudget, { headers: budgetHeaders });
});
