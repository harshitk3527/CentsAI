import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { SpendingInsightResponse } from "@/lib/api-contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const dateLabel = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" });
const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const dayOptions = [1, 2, 3, 4, 5, 6, 7];

export function AISpendingInsights() {
  const [days, setDays] = useState(7);
  const [result, setResult] = useState<SpendingInsightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      setResult(await api.generateSpendingInsight(days));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to generate AI insights");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            AI spending insights
          </CardTitle>
          <CardDescription>Uses this month’s budget and recorded salary, plus up to seven days of expenses.</CardDescription>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-32 space-y-1">
            <Label htmlFor="insight-range">Expense period</Label>
            <Select
              value={String(days)}
              disabled={loading}
              onValueChange={(value) => {
                setDays(Number(value));
                setResult(null);
                setError(null);
              }}
            >
              <SelectTrigger id="insight-range"><SelectValue /></SelectTrigger>
              <SelectContent>
                {dayOptions.map((day) => (
                  <SelectItem key={day} value={String(day)}>{day === 1 ? "Today" : `Last ${day} days`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={generate} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {loading ? "Generating…" : "Generate insights"}
          </Button>
        </div>
      </CardHeader>
      {(loading || error || result) && (
        <CardContent aria-live="polite" className="space-y-4">
          {loading && <p role="status" className="text-sm text-muted-foreground">Reviewing your recorded spending…</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {result && <InsightResult result={result} />}
        </CardContent>
      )}
    </Card>
  );
}

function InsightResult({ result: { snapshot, insight } }: { result: SpendingInsightResponse }) {
  const { startDate, endDate, budgetMonth, monthlyBudget, salaryReceived, recentExpenses, expenseCount } = snapshot;
  const period = startDate === endDate
    ? dateLabel.format(new Date(endDate))
    : `${dateLabel.format(new Date(startDate))} – ${dateLabel.format(new Date(endDate))}`;
  const month = monthLabel.format(new Date(`${budgetMonth}-01`));

  return (
    <>
      <dl className="grid gap-3 rounded-lg bg-muted/50 p-3 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">Expenses · {period}</dt>
          <dd className="font-semibold">{expenseCount > 0 ? currency.format(recentExpenses) : "None logged"}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Budget · {month}</dt>
          <dd className="font-semibold">{monthlyBudget === null ? "Not set" : currency.format(monthlyBudget)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Salary · {month}</dt>
          <dd className="font-semibold">{salaryReceived === null ? "None logged" : currency.format(salaryReceived)}</dd>
        </div>
      </dl>
      {insight ? (
        <>
          <p className="text-sm leading-relaxed">{insight.summary}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {insight.actions.map((action, index) => <li key={index}>{action}</li>)}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Log an expense or salary credit, or set a monthly budget to generate insights.</p>
      )}
    </>
  );
}
