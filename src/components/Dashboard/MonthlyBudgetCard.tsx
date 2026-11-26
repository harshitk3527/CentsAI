import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { monthString, type Expense, type MonthlyBudget, type SalaryCredit } from "@/lib/api-contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

function monthlyTotalInPaise(entries: readonly Expense[], month: string) {
  return entries.reduce((total, entry) => (
    entry.transactionDate.slice(0, 7) === month ? total + Math.round(entry.amount * 100) : total
  ), 0);
}

export function BudgetEntryDialog({ budget, onSave }: {
  budget: MonthlyBudget | null;
  onSave: (month: string, amount: number | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const editing = budget?.amount != null;
  const title = editing ? "Edit budget" : "Add budget";
  const Icon = editing ? Pencil : Plus;

  async function save(amount: number | null) {
    if (!budget || saving) return;
    setSaving(true);
    try {
      await onSave(budget.month, amount);
      setOpen(false);
      toast.success(amount === null ? "Monthly budget cleared" : "Monthly budget saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save monthly budget");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open && budget !== null}
      onOpenChange={(nextOpen) => {
        if (saving) return;
        if (nextOpen) setDraft(budget?.amount?.toString() ?? "");
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!budget}>
          <Icon className="w-4 h-4 mr-2" aria-hidden="true" />
          {title}
        </Button>
      </DialogTrigger>
      {budget && (
        <DialogContent className="glass border-border/50">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Set a spending limit for {monthLabel.format(new Date(`${budget.month}-01`))}.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => {
            event.preventDefault();
            if (draft !== "") void save(Number(draft));
          }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="budget-amount">Budget limit (₹)</Label>
              <Input
                id="budget-amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                required
                disabled={saving}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline" className="flex-1" disabled={saving}>Cancel</Button>
              </DialogClose>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : "Save budget"}
              </Button>
            </div>
            {editing && (
              <Button type="button" variant="ghost" className="w-full" onClick={() => void save(null)} disabled={saving}>
                Clear budget
              </Button>
            )}
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}

export function useMonthlyBudget(enabled: boolean) {
  const [month, selectMonth] = useState<string>();
  const [budget, setBudget] = useState<MonthlyBudget | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, retry] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void api.getMonthlyBudget(month, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setBudget(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [enabled, month, attempt]);

  const selectedMonth = month ?? budget?.month ?? "";
  const current = budget && budget.month === selectedMonth ? budget : null;

  function changeMonth(value: string) {
    const parsed = monthString.safeParse(value);
    if (!parsed.success || parsed.data === selectedMonth) return;
    setLoadError(false);
    setBudget(null);
    selectMonth(parsed.data);
  }

  function reload() {
    setLoadError(false);
    retry((value) => value + 1);
  }

  async function saveBudget(month: string, amount: number | null) {
    setBudget(await api.setMonthlyBudget(month, amount));
  }

  return { selectedMonth, current, loadError, changeMonth, reload, saveBudget };
}

export function MonthlyBudgetCard({ expenses, credits, budget }: {
  expenses: Expense[];
  credits: SalaryCredit[];
  budget: Pick<ReturnType<typeof useMonthlyBudget>, "selectedMonth" | "current" | "loadError" | "changeMonth" | "reload">;
}) {
  const { selectedMonth, current, loadError, changeMonth, reload } = budget;
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
            value={selectedMonth}
            onChange={(event) => changeMonth(event.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? (
          <div className="flex items-center gap-2">
            <p role="alert" className="text-sm text-destructive">Could not load this month’s budget.</p>
            <Button variant="outline" size="sm" onClick={reload}>Retry</Button>
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
