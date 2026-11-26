import type { Metadata } from "next";
import { GoogleSignInForm } from "./google-sign-in-form";

export const metadata: Metadata = { title: "Google Sign-In", robots: { index: false } };

export default async function GoogleSignInPage({ searchParams }: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const message = error === "cancelled"
    ? "Google sign-in was cancelled."
    : error === "failed" ? "Google sign-in could not be verified. Please try again." : null;
  return <GoogleSignInForm initialError={message} />;
}
