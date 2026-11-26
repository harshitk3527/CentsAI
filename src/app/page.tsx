import { Landing } from "@/components/Landing/Landing";
import { Features } from "@/components/Landing/Features";

const Index = () => {
  return (
    <>
      <div className="min-h-screen bg-background">
        <Landing />
        <Features />
        <footer className="py-8 border-t border-border">
          <div className="container px-4 text-center text-muted-foreground text-sm">
            © 2026 CentsAI. Built with intelligence.
          </div>
        </footer>
      </div>
    </>
  );
};

export default Index;
