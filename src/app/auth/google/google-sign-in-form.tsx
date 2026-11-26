"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, auth } from "@/lib/api";

export function GoogleSignInForm({ initialError }: { initialError: string | null }) {
  const router = useRouter();
  const started = useRef(false);
  const [passwordRequired, requirePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(!initialError);
  const [error, setError] = useState(initialError);

  const complete = useCallback((password?: string) => api.completeGoogleSignIn(password)
    .then((result) => {
      if (result.status === "password_required") {
        requirePassword(true);
        setPending(false);
        return;
      }
      auth.saveAuth(result.session);
      router.replace("/dashboard");
    })
    .catch((error: unknown) => {
      setPassword("");
      setError(error instanceof Error ? error.message : "Google sign-in failed");
      setPending(false);
    }), [router]);

  useEffect(() => {
    if (initialError || started.current) return;
    started.current = true;
    void complete();
  }, [complete, initialError]);

  function linkAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    void complete(password);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{passwordRequired ? "Link your Google account" : "Google sign-in"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {passwordRequired ? (
            <form onSubmit={linkAccount} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                A CentsAI account already uses this email. Enter your CentsAI password to link Google and keep your expenses.
              </p>
              <div className="space-y-2">
                <Label htmlFor="link-password">CentsAI password</Label>
                <Input
                  id="link-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <Button type="submit" disabled={pending} className="w-full">Link Google account</Button>
            </form>
          ) : pending ? (
            <p role="status" className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Signing in…
            </p>
          ) : null}
          <Link href="/login" className="inline-block text-sm text-primary hover:underline">Back to sign in</Link>
        </CardContent>
      </Card>
    </main>
  );
}
