import type { Metadata } from "next";
import { isGoogleSignInEnabled } from "@/server/google-auth";
import Login from "./login-form";

export const metadata: Metadata = { title: "Sign In" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <Login googleSignInEnabled={isGoogleSignInEnabled()} />;
}
