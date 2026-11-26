import { z } from "zod";

export const dateString = z.iso.date();
export const monthString = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a valid month in YYYY-MM format");
export const transactionTypeSchema = z.enum(["expense", "credit"]);
export const budgetAmountSchema = z.number().nonnegative().refine(
  (amount) => Number.isSafeInteger(Math.round(amount * 100)) && Number(amount.toFixed(2)) === amount,
  "Enter a budget amount with at most two decimal places",
);

export const authResponseSchema = z.object({
  user_id: z.string(),
  username: z.string(),
  token: z.string(),
});

export const googleSignInResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("signed_in"), session: authResponseSchema }),
  z.object({ status: z.literal("password_required") }),
]);

export type GoogleSignInResponse = z.infer<typeof googleSignInResponseSchema>;

const expenseSchema = z.object({
  id: z.string(),
  amount: z.number(),
  transactionDate: dateString,
  category: z.string(),
});

const salaryCreditSchema = expenseSchema.extend({
  category: z.literal("Salary"),
  type: z.literal("credit"),
});

export const transactionResponseSchema = z.object({
  userId: z.string(),
  expenses: z.array(expenseSchema),
  credits: z.array(salaryCreditSchema).default([]),
});

export const allTransactionsResponseSchema = z.object({
  userId: z.string(),
  allExpenses: z.array(expenseSchema),
  credits: z.array(salaryCreditSchema).default([]),
});

export const monthlyBudgetResponseSchema = z.object({
  month: monthString,
  amount: budgetAmountSchema.nullable(),
});

export const insightDaysSchema = z.number().int().min(1).max(7);
export const insightNarrativeSchema = z.object({
  summary: z.string(),
  actions: z.array(z.string()),
});
export const insightTextSchema = insightNarrativeSchema.extend({
  summary: z.string().trim().min(1).max(750),
  actions: z.array(z.string().trim().min(1).max(250)).min(1).max(3),
});
export const insightSnapshotSchema = z.object({
  startDate: dateString,
  endDate: dateString,
  budgetMonth: monthString,
  monthlyBudget: budgetAmountSchema.nullable(),
  salaryReceived: z.number().positive().nullable(),
  recentExpenses: z.number(),
  expenseCount: z.number().int().nonnegative(),
  currentMonthExpensesInWindow: z.number(),
});
export const spendingInsightResponseSchema = z.object({
  snapshot: insightSnapshotSchema,
  insight: insightTextSchema.nullable(),
});

export const apiMessageSchema = z.object({ message: z.string() });
export const apiErrorSchema = apiMessageSchema.extend({
  errors: z.record(z.string(), z.string()).optional(),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type SalaryCredit = z.infer<typeof salaryCreditSchema>;
export type Transaction = Expense | SalaryCredit;
export type TransactionType = z.infer<typeof transactionTypeSchema>;
export type MonthlyBudget = z.infer<typeof monthlyBudgetResponseSchema>;
export type SpendingInsightResponse = z.infer<typeof spendingInsightResponseSchema>;
export type TransactionResponse = z.infer<typeof transactionResponseSchema>;
export type AllTransactionsResponse = z.infer<typeof allTransactionsResponseSchema>;
export type ApiMessageResponse = z.infer<typeof apiMessageSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;
