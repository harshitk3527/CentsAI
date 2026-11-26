import { z } from "zod";
import {
  allTransactionsResponseSchema,
  apiErrorSchema,
  apiMessageSchema,
  authResponseSchema,
  googleSignInResponseSchema,
  monthlyBudgetResponseSchema,
  spendingInsightResponseSchema,
  transactionResponseSchema,
  type AllTransactionsResponse,
  type ApiMessageResponse,
  type AuthResponse,
  type TransactionResponse,
  type TransactionType,
} from "./api-contracts";

const API_BASE_URL = "/api/v1";
const tokenPayloadSchema = z.object({ exp: z.number() });

const getToken = () => localStorage.getItem("token");
const getUserId = () => localStorage.getItem("userId");

const authHeaders = () => {
  const token = getToken();

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

async function readResponse<T>(res: Response, schema: z.ZodType<T>, fallbackMessage: string): Promise<T> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(fallbackMessage);
  }
  if (!res.ok) {
    const error = apiErrorSchema.safeParse(body);
    if (!error.success) throw new Error(fallbackMessage);

    const validationMessages = Object.values(error.data.errors ?? {}).filter(Boolean);
    throw new Error(validationMessages.join(" | ") || error.data.message || fallbackMessage);
  }

  const result = schema.safeParse(body);
  if (!result.success) throw new Error(fallbackMessage);
  return result.data;
}

export const api = {
  // Auth
  async register(email: string, username: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE_URL}/users/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password }),
    });
    return readResponse(res, authResponseSchema, "Registration failed");
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE_URL}/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return readResponse(res, authResponseSchema, "Invalid email or password");
  },

  async completeGoogleSignIn(password?: string) {
    const res = await fetch("/api/auth/google/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    return readResponse(res, googleSignInResponseSchema, "Google sign-in failed");
  },

  // Transactions
  async getTransactions(): Promise<AllTransactionsResponse> {
    const userId = getUserId();

    if (!userId) {
      throw new Error("User not authenticated");
    }

    const res = await fetch(`${API_BASE_URL}/users/${userId}/transactions`, {
      headers: authHeaders(),
    });
    if (res.status === 401) auth.logout();
    return readResponse(res, allTransactionsResponseSchema, "Failed to fetch transactions");
  },

  async addTransaction(amount: number, category?: string, date?: string, type: TransactionType = "expense"): Promise<TransactionResponse> {
    const userId = getUserId();

    if (!userId) {
      throw new Error("User not authenticated");
    }

    const payload = {
      amount,
      type,
      ...(category ? { category } : {}),
      ...(date ? { date } : {}),
    };

    const res = await fetch(`${API_BASE_URL}/users/${userId}/transaction`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    return readResponse(res, transactionResponseSchema, "Failed to add transaction");
  },

  async addTransactionAI(prompt: string): Promise<TransactionResponse> {
    const userId = getUserId();

    if (!userId) {
      throw new Error("User not authenticated");
    }

    const res = await fetch(`${API_BASE_URL}/users/ai/${userId}/transaction`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ prompt }),
    });
    return readResponse(res, transactionResponseSchema, "Failed to process AI transaction");
  },

  async updateTransaction(
    transactionId: string,
    amount: number,
    category: string,
    date: string
  ): Promise<ApiMessageResponse> {
    const userId = getUserId();

    if (!userId) {
      throw new Error("User not authenticated");
    }

    const res = await fetch(`${API_BASE_URL}/users/${userId}/transaction/${transactionId}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ amount, category, date }),
    });
    return readResponse(res, apiMessageSchema, "Failed to update transaction");
  },

  async deleteTransaction(transactionId: string): Promise<ApiMessageResponse> {
    const userId = getUserId();

    if (!userId) {
      throw new Error("User not authenticated");
    }

    const res = await fetch(`${API_BASE_URL}/users/${userId}/transaction/${transactionId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return readResponse(res, apiMessageSchema, "Failed to delete transaction");
  },

  async getMonthlyBudget(month?: string, signal?: AbortSignal) {
    const userId = getUserId();
    if (!userId) throw new Error("User not authenticated");

    const query = month ? `?${new URLSearchParams({ month })}` : "";
    const res = await fetch(`${API_BASE_URL}/users/${userId}/budget${query}`, { headers: authHeaders(), signal });
    return readResponse(res, monthlyBudgetResponseSchema, "Failed to load monthly budget");
  },

  async setMonthlyBudget(month: string, amount: number | null) {
    const userId = getUserId();
    if (!userId) throw new Error("User not authenticated");

    const query = new URLSearchParams({ month });
    const res = await fetch(`${API_BASE_URL}/users/${userId}/budget?${query}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ amount }),
    });
    return readResponse(res, monthlyBudgetResponseSchema, "Failed to save monthly budget");
  },

  async generateSpendingInsight(days: number) {
    const userId = getUserId();
    if (!userId) throw new Error("User not authenticated");

    const res = await fetch(`${API_BASE_URL}/users/${userId}/insights`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ days }),
    });
    return readResponse(res, spendingInsightResponseSchema, "Failed to generate AI insights");
  },
};

// Decode JWT token to check expiration
export const isTokenExpired = (token: string): boolean => {
  try {
    const [, encodedPayload] = token.split(".");
    if (!encodedPayload) return true;

    const payload: unknown = JSON.parse(atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/")));
    const { exp } = tokenPayloadSchema.parse(payload);
    return Date.now() / 1000 >= exp;
  } catch {
    // If token is malformed, consider it expired
    return true;
  }
};

export const auth = {
  saveAuth(data: AuthResponse) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("userId", data.user_id);
    localStorage.setItem("username", data.username);
  },

  logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
  },

  isAuthenticated() {
    const token = getToken();
    if (!token) {
      return false;
    }
    
    // Check if token is expired
    if (isTokenExpired(token)) {
      // Clear expired token
      this.logout();
      return false;
    }
    
    return true;
  },

  getUsername() {
    return localStorage.getItem("username");
  },

  getUserId() {
    return getUserId();
  },
};

export type { Expense, AuthResponse, TransactionResponse, AllTransactionsResponse } from "./api-contracts";
