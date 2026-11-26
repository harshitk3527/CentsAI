"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Dashboard/Header";
import { AIInput } from "@/components/Dashboard/AIInput";
import { TransactionList } from "@/components/Dashboard/TransactionList";
import { AddTransactionDialog } from "@/components/Dashboard/AddTransactionDialog";
import { ExpenseChart } from "@/components/Dashboard/ExpenseChart";
import { PeriodSelector, type Period } from "@/components/Dashboard/PeriodSelector";
import { SpendingInsights } from "@/components/Dashboard/SpendingInsights";
import { SpendingTrendChart } from "@/components/Dashboard/SpendingTrendChart";
import { CategoryBreakdown } from "@/components/Dashboard/CategoryBreakdown";
import { BudgetEntryDialog, MonthlyBudgetCard, useMonthlyBudget } from "@/components/Dashboard/MonthlyBudgetCard";
import { AISpendingInsights } from "@/components/Dashboard/AISpendingInsights";
import { api, auth } from "@/lib/api";
import type { AllTransactionsResponse, Transaction } from "@/lib/api-contracts";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

function filterTransactionsByPeriod<T extends Transaction>(expenses: T[], period: Period): T[] {
  if (period === "all") return expenses;
  
  const days = period === "7d" ? 7 : period === "15d" ? 15 : 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  
  return expenses.filter((exp) => new Date(exp.transactionDate) >= cutoff);
}

const Dashboard = () => {
  const router = useRouter();
  const [{ allExpenses: expenses, credits }, setTransactions] = useState<Pick<AllTransactionsResponse, "allExpenses" | "credits">>({
    allExpenses: [],
    credits: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("30d");
  const budget = useMonthlyBudget(!isLoading);

  const fetchTransactions = useCallback(() => {
    return api.getTransactions()
      .then(setTransactions)
      .catch(() => {
        if (!auth.isAuthenticated()) {
          router.replace("/login");
          return;
        }
        toast.error("Failed to load transactions");
      })
      .finally(() => setIsLoading(false));
  }, [router]);

  useEffect(() => {
    if (!auth.isAuthenticated()) {
      router.replace("/login");
      return;
    }
    void fetchTransactions();
  }, [fetchTransactions, router]);

  const filteredExpenses = filterTransactionsByPeriod(expenses, period);
  const filteredTransactions = [...filteredExpenses, ...filterTransactionsByPeriod(credits, period)];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 space-y-6">
          {/* Header with Period Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Dashboard</h1>
              <p className="text-muted-foreground">Track your expenses, salary, and monthly budget</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <PeriodSelector value={period} onChange={setPeriod} />
              <AddTransactionDialog onSuccess={fetchTransactions} />
              <BudgetEntryDialog budget={budget.current} onSave={budget.saveBudget} />
            </div>
          </div>

          <MonthlyBudgetCard expenses={expenses} credits={credits} budget={budget} />
          <AISpendingInsights />

          {/* Spending Insights */}
          <SpendingInsights expenses={expenses} period={period} />

          {/* AI Input */}
          <AIInput onSuccess={fetchTransactions} />

          {/* Charts Row */}
          <div className="grid lg:grid-cols-2 gap-6">
            <SpendingTrendChart expenses={expenses} period={period} />
            <CategoryBreakdown expenses={expenses} period={period} />
          </div>

          {/* Transactions and Pie Chart */}
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
              <TransactionList transactions={filteredTransactions} onUpdate={fetchTransactions} />
            </div>
            <div>
              <ExpenseChart expenses={filteredExpenses} />
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default Dashboard;
