import type { Metadata } from "next";
import { isGoogleSignInEnabled } from "@/server/google-auth";
import Register from "./register-form";

export const metadata: Metadata = { title: "Register" };
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return <Register googleSignInEnabled={isGoogleSignInEnabled()} />;
}
