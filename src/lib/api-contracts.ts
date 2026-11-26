import { z } from "zod";

export const dateString = z.iso.date();

export const authResponseSchema = z.object({
  user_id: z.string(),
  username: z.string(),
  token: z.string(),
});

const expenseSchema = z.object({
  id: z.string(),
  amount: z.number(),
  transactionDate: dateString,
  category: z.string(),
});

export const transactionResponseSchema = z.object({
  userId: z.string(),
  expenses: z.array(expenseSchema),
});

export const allTransactionsResponseSchema = z.object({
  userId: z.string(),
  allExpenses: z.array(expenseSchema),
});

export const apiMessageSchema = z.object({ message: z.string() });
export const apiErrorSchema = apiMessageSchema.extend({
  errors: z.record(z.string(), z.string()).optional(),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type TransactionResponse = z.infer<typeof transactionResponseSchema>;
export type AllTransactionsResponse = z.infer<typeof allTransactionsResponseSchema>;
export type ApiMessageResponse = z.infer<typeof apiMessageSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;
