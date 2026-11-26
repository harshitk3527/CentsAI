import "server-only";

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import type { Filter } from "mongodb";
import { z } from "zod";
import {
  insightDaysSchema,
  insightNarrativeSchema,
  insightSnapshotSchema,
  insightTextSchema,
  type SpendingInsightResponse,
} from "@/lib/api-contracts";
import { categoryList } from "@/lib/categories";
import { authorize } from "./auth";
import { readBudgetAmount } from "./budgets";
import { formatStoredTransactionDate, getDb, type ExpenseRecord } from "./db";
import { createGroqModel } from "./groq";
import { apiRoute, formatDate, HttpError, readBody } from "./http";

const requestSchema = z.object({ days: insightDaysSchema.default(7) });
const evidenceSchema = insightSnapshotSchema.extend({
  spendingByCategory: z.record(z.string(), z.number()),
  spendingByDate: z.record(z.string(), z.number()),
});
const state = new StateSchema({
  userId: z.string(),
  days: insightDaysSchema,
  evidence: evidenceSchema.optional(),
  insight: insightTextSchema.nullable().optional(),
});

const expenseCategories = new Map(
  [...categoryList, "Bills", "Travel", "Transport"].map((category) => [category.toLowerCase(), category]),
);

function shiftDate(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function storedDateRange(start: string, end: string): Filter<ExpenseRecord> {
  // BSON dates need a UTC buffer for legacy time zones. The exact calendar dates are checked after reading.
  return {
    $or: [
      { date: { $gte: start, $lte: end } },
      { date: { $gte: new Date(shiftDate(start, -1)), $lt: new Date(shiftDate(end, 2)) } },
    ],
  };
}

const workflow = new StateGraph(state)
  .addNode("collectEvidence", async ({ userId, days }) => {
    const db = await getDb();
    const endDate = formatDate(new Date());
    const startDate = shiftDate(endDate, 1 - days);
    const budgetMonth = endDate.slice(0, 7);
    const monthStart = `${budgetMonth}-01`;
    const records = db.collection<ExpenseRecord>("expenses");
    type ExpenseFields = Pick<ExpenseRecord, "amount" | "date" | "category">;
    type SalaryFields = Pick<ExpenseRecord, "amount" | "date">;
    const [monthlyBudget, expenses, salaryCredits] = await Promise.all([
      readBudgetAmount(db, userId, budgetMonth),
      records.find<ExpenseFields>(
        { userId, type: { $ne: "credit" }, ...storedDateRange(startDate, endDate) },
        { projection: { _id: 0, amount: 1, date: 1, category: 1 } },
      ).toArray(),
      records.find<SalaryFields>(
        { userId, type: "credit", ...storedDateRange(monthStart, endDate) },
        { projection: { _id: 0, amount: 1, date: 1 } },
      ).toArray(),
    ]);

    const spendingByCategory = new Map<string, number>();
    const spendingByDate = new Map<string, number>();
    let recentExpenses = 0;
    let currentMonthExpensesInWindow = 0;
    let expenseCount = 0;
    for (const expense of expenses) {
      const day = formatStoredTransactionDate(expense.date);
      if (day < startDate || day > endDate) continue;

      const paise = Math.round(expense.amount * 100);
      const category = expenseCategories.get(expense.category?.trim().toLowerCase() ?? "") ?? "Other";
      spendingByCategory.set(category, (spendingByCategory.get(category) ?? 0) + paise);
      spendingByDate.set(day, (spendingByDate.get(day) ?? 0) + paise);
      recentExpenses += paise;
      if (day >= monthStart) currentMonthExpensesInWindow += paise;
      expenseCount++;
    }

    const salary = salaryCredits.reduce((total, entry) => {
      const day = formatStoredTransactionDate(entry.date);
      return day >= monthStart && day <= endDate ? total + Math.round(entry.amount * 100) : total;
    }, 0);

    return {
      evidence: {
        startDate,
        endDate,
        budgetMonth,
        monthlyBudget,
        salaryReceived: salary > 0 ? salary / 100 : null,
        recentExpenses: recentExpenses / 100,
        expenseCount,
        currentMonthExpensesInWindow: currentMonthExpensesInWindow / 100,
        spendingByCategory: Object.fromEntries(Array.from(spendingByCategory, ([key, paise]) => [key, paise / 100])),
        spendingByDate: Object.fromEntries(Array.from(spendingByDate, ([key, paise]) => [key, paise / 100])),
      },
    };
  })
  .addNode("generateInsight", async ({ evidence }) => {
    if (!evidence || (evidence.expenseCount === 0 && evidence.monthlyBudget === null && evidence.salaryReceived === null)) {
      return { insight: null };
    }
    try {
      const model = createGroqModel(2048)
        .withStructuredOutput<z.infer<typeof insightNarrativeSchema>>(
          insightNarrativeSchema, { name: "spending_insight", method: "jsonSchema" },
        );
      const output = await model.invoke([
        new SystemMessage([
          "Write a brief spending insight and one to three concrete budgeting or expense-tracking actions.",
          "Use only the recorded figures in the supplied JSON. All amounts are in INR.",
          "Expenses only cover the inclusive startDate to endDate window. Use currentMonthExpensesInWindow when comparing spending to the budget month, because the window can cross months.",
          "Never claim to know the full month's expenses, the budget remaining, unrecorded income, or account balances.",
          "A null salary means no salary was logged. A null budget means no limit was set. A zero budget is a real zero-spend limit.",
          "If no expenses were logged, say so rather than inferring that nothing was spent. Keep the summary to two short sentences and each action to one short sentence. Use plain text.",
        ].join("\n")),
        new HumanMessage(JSON.stringify(evidence)),
      ]);
      return { insight: insightTextSchema.parse(output) };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error("Groq spending insight failed", error instanceof Error ? error.name : "Unknown error");
      throw new HttpError(502, "AI insight could not be generated. Please try again.");
    }
  })
  .addEdge(START, "collectEvidence")
  .addEdge("collectEvidence", "generateInsight")
  .addEdge("generateInsight", END)
  .compile();

export const generateSpendingInsight = apiRoute(async (
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) => {
  const { userId } = await params;
  await authorize(request, userId);
  const { days } = await readBody(request, requestSchema);
  const { evidence, insight } = await workflow.invoke({ userId, days });
  const snapshot = insightSnapshotSchema.parse(evidence);
  return Response.json({ snapshot, insight: insight ?? null } satisfies SpendingInsightResponse, {
    headers: { "Cache-Control": "private, no-store" },
  });
});
