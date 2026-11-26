import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function Navbar({ username }: { username: string | null }) {
  const content = !username ? (
    <>
      <Button variant="ghost" asChild>
        <Link href="/login">Sign In</Link>
      </Button>
      <Button variant="default" asChild>
        <Link href="/register">Get Started</Link>
      </Button>
    </>
  ) : (
    <span className="text-sm hidden md:inline">
      Welcome,{" "}
      <span className="text-foreground font-medium">
        {username}
      </span>
    </span>
  );
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">CentsAI</span>
          </Link>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            {content}
          </div>
        </div>
      </div>
    </nav>
  );
}
