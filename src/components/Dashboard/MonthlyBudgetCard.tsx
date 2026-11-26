import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { monthString, type Expense, type MonthlyBudget, type SalaryCredit } from "@/lib/api-contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

function monthlyTotalInPaise(entries: readonly Expense[], month: string) {
  return entries.reduce((total, entry) => (
    entry.transactionDate.slice(0, 7) === month ? total + Math.round(entry.amount * 100) : total
  ), 0);
}

function BudgetForm({ budget, saving, onSave }: {
  budget: MonthlyBudget;
  saving: boolean;
  onSave: (amount: number | null) => void;
}) {
  const [draft, setDraft] = useState(budget.amount?.toString() ?? "");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft !== "") onSave(Number(draft));
      }}
    >
      <div className="w-full space-y-1 sm:w-44">
        <Label htmlFor="budget-amount">Budget limit (₹)</Label>
        <Input
          id="budget-amount"
          type="number"
          min="0"
          step="0.01"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          required
          disabled={saving}
        />
      </div>
      <Button type="submit" disabled={saving}>Save budget</Button>
      {budget.amount !== null && (
        <Button type="button" variant="ghost" onClick={() => onSave(null)} disabled={saving}>Clear budget</Button>
      )}
    </form>
  );
}

export function MonthlyBudgetCard({ expenses, credits }: {
  expenses: Expense[];
  credits: SalaryCredit[];
}) {
  const [month, selectMonth] = useState<string>();
  const [budget, setBudget] = useState<MonthlyBudget | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, retry] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void api.getMonthlyBudget(month, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setBudget(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [month, attempt]);

  const current = budget && (!month || month === budget.month) ? budget : null;

  async function saveBudget(amount: number | null) {
    if (!current) return;
    setSaving(true);
    try {
      setBudget(await api.setMonthlyBudget(current.month, amount));
      toast.success(amount === null ? "Monthly budget cleared" : "Monthly budget saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save monthly budget");
    } finally {
      setSaving(false);
    }
  }

  const spent = current ? monthlyTotalInPaise(expenses, current.month) : 0;
  const salary = current ? monthlyTotalInPaise(credits, current.month) : 0;
  const limit = current?.amount == null ? null : Math.round(current.amount * 100);
  const remaining = limit === null ? null : limit - spent;
  const percentage = limit ? Math.min(100, Math.max(0, spent / limit * 100)) : spent > 0 ? 100 : 0;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <CardTitle className="text-lg">Monthly budget</CardTitle>
        <div className="space-y-1">
          <Label htmlFor="budget-month">Budget month</Label>
          <Input
            id="budget-month"
            type="month"
            value={month ?? budget?.month ?? ""}
            disabled={saving}
            onChange={(event) => {
              const parsed = monthString.safeParse(event.target.value);
              if (parsed.success && parsed.data !== (month ?? budget?.month)) {
                setLoadError(false);
                setBudget(null);
                selectMonth(parsed.data);
              }
            }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? (
          <div className="flex items-center gap-2">
            <p role="alert" className="text-sm text-destructive">Could not load this month’s budget.</p>
            <Button variant="outline" size="sm" onClick={() => { setLoadError(false); retry(attempt + 1); }}>Retry</Button>
          </div>
        ) : !current ? (
          <p className="text-sm text-muted-foreground" role="status">Loading monthly budget…</p>
        ) : (
          <>
            <dl className="grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-muted-foreground">Salary received</dt>
                <dd className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{currency.format(salary / 100)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Spent</dt>
                <dd className="text-lg font-semibold">{currency.format(spent / 100)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{remaining !== null && remaining < 0 ? "Over budget" : "Budget remaining"}</dt>
                <dd className={remaining !== null && remaining < 0 ? "text-lg font-semibold text-destructive" : "text-lg font-semibold"}>
                  {remaining === null ? "No limit set" : currency.format(Math.abs(remaining) / 100)}
                </dd>
              </div>
            </dl>
            {limit !== null && <Progress value={percentage} aria-label="Monthly budget used" />}
            <BudgetForm key={`${current.month}:${current.amount}`} budget={current} saving={saving} onSave={saveBudget} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
