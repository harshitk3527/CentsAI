import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getCategoryConfig, categoryList } from "@/lib/categories";
import type { Transaction } from "@/lib/api-contracts";
import { api } from "@/lib/api";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { MoreVertical, Edit2, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface TransactionListProps {
  transactions: Transaction[];
  onUpdate: () => void;
}

export function TransactionList({ transactions, onUpdate }: TransactionListProps) {
  const [editingExpense, setEditingExpense] = useState<Transaction | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDate, setEditDate] = useState("");
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);

  const sortedExpenses = [...transactions].sort(
    (a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
  );

  // Group expenses by date
  const groupedExpenses = sortedExpenses.reduce<Record<string, Transaction[]>>((acc, expense) => {
    (acc[expense.transactionDate] ??= []).push(expense);
    return acc;
  }, {});

  const handleEditClick = (expense: Transaction) => {
    setEditingExpense(expense);
    setEditAmount(expense.amount.toString());
    setEditCategory(expense.category);
    setEditDate(expense.transactionDate);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense?.id || !editAmount || !editCategory || !editDate) {
      toast.error("Please fill all fields");
      return;
    }

    setIsEditLoading(true);
    try {
      await api.updateTransaction(editingExpense.id, parseFloat(editAmount), editCategory, editDate);
      toast.success("Transaction updated!");
      setEditingExpense(null);
      onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update transaction");
    } finally {
      setIsEditLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingExpenseId) return;

    setIsDeleteLoading(true);
    try {
      await api.deleteTransaction(deletingExpenseId);
      toast.success("Transaction deleted!");
      setDeletingExpenseId(null);
      onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete transaction");
    } finally {
      setIsDeleteLoading(false);
    }
  };

  const getDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "EEEE, MMM d, yyyy");
  };

  if (transactions.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">No transactions in this period.</p>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {Object.entries(groupedExpenses).map(([date, dayExpenses]) => {
          const dayTotal = dayExpenses.reduce((sum, entry) => sum + ("type" in entry ? entry.amount : -entry.amount), 0);
          
          return (
            <Card key={date} className="overflow-hidden">
              <div className="bg-secondary/50 px-4 py-3 flex items-center justify-between border-b border-border">
                <h3 className="font-semibold text-sm">{getDateLabel(date)}</h3>
                <span className="text-sm font-medium text-muted-foreground">
                  Net {dayTotal > 0 ? "+" : dayTotal < 0 ? "−" : ""}₹{Math.abs(dayTotal).toFixed(2)}
                </span>
              </div>
              <div className="divide-y divide-border">
                {dayExpenses.map((expense) => {
                  const category = getCategoryConfig(expense.category);
                  const Icon = category.icon;
                  const isCredit = "type" in expense;
                  
                  return (
                    <div
                      key={expense.id}
                      className="flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg ${category.bgColor} flex items-center justify-center`}>
                          <Icon className={`w-5 h-5 ${category.color}`} />
                        </div>
                        <div>
                          <p className="font-medium">{expense.category}</p>
                          <p className="text-sm text-muted-foreground">
                            {isCredit ? "Credit" : "Expense"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className={isCredit ? "text-lg font-semibold text-emerald-600 dark:text-emerald-400" : "text-lg font-semibold"}>
                          {isCredit ? "+" : "−"}₹{expense.amount.toFixed(2)}
                        </p>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${expense.category}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={() => {
                                if (!expense.id) {
                                  toast.error("Transaction ID not found");
                                  return;
                                }
                                handleEditClick(expense);
                              }}
                            >
                              <Edit2 className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                if (!expense.id) {
                                  toast.error("Transaction ID not found");
                                  return;
                                }
                                setDeletingExpenseId(expense.id);
                              }}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingExpense} onOpenChange={(open) => !open && setEditingExpense(null)}>
        <DialogContent className="glass border-border/50">
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
            <DialogDescription>Update your transaction details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-amount">Amount (₹)</Label>
              <Input
                id="edit-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                required
              />
            </div>
            {editingExpense && !("type" in editingExpense) && (
              <div className="space-y-2">
                <Label htmlFor="edit-category">Category</Label>
                <Select value={editCategory} onValueChange={setEditCategory} required>
                  <SelectTrigger id="edit-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {editCategory && !categoryList.includes(editCategory) && (
                      <SelectItem value={editCategory}>{editCategory}</SelectItem>
                    )}
                    {categoryList.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-date">Date</Label>
              <Input
                id="edit-date"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingExpense(null)}
                disabled={isEditLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isEditLoading}>
                {isEditLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingExpenseId} onOpenChange={(open) => !open && setDeletingExpenseId(null)}>
        <AlertDialogContent className="glass border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this transaction? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleteLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleteLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
