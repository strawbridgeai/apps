import { Link, useLocation } from "wouter";
import { CalendarDays, Home, Info, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import ShimmerText from "@/components/ShimmerText";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground font-sans">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center gap-3 justify-between mx-auto px-4 md:px-8">
          <div className="flex items-center gap-3">
            <a
              href="/"
              title="Back to all apps"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-primary hover:border-primary"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M3 9.5 12 3l9 6.5"></path>
                <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"></path>
              </svg>
            </a>

            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="bg-primary text-primary-foreground p-1.5 rounded-sm">
                <Flag size={20} />
              </div>
              <ShimmerText text="VoteReady" className="font-serif font-bold text-xl tracking-tight" />
            </Link>
          </div>

          <nav className="flex items-center gap-6">
            <Link href="/" className={`text-sm font-medium transition-colors hover:text-primary ${location === '/' ? 'text-primary' : 'text-muted-foreground'}`}>
              <span className="hidden md:inline">Browse</span>
              <Home className="md:hidden" size={20} />
            </Link>
            <Link href="/calendar" className={`text-sm font-medium transition-colors hover:text-primary ${location === '/calendar' ? 'text-primary' : 'text-muted-foreground'}`}>
              <span className="hidden md:inline">Calendar</span>
              <CalendarDays className="md:hidden" size={20} />
            </Link>
            <Link href="/about" className={`text-sm font-medium transition-colors hover:text-primary ${location === '/about' ? 'text-primary' : 'text-muted-foreground'}`}>
              <span className="hidden md:inline">About</span>
              <Info className="md:hidden" size={20} />
            </Link>
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <Button asChild variant="default" className="font-semibold shadow-sm">
              <a href="https://vote.gov" target="_blank" rel="noopener noreferrer">Register to Vote</a>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>

      <footer className="border-t py-8 mt-12 bg-muted/30">
        <div className="container mx-auto px-4 md:px-8 text-center text-muted-foreground text-sm space-y-4">
          <div className="flex items-center justify-center gap-2 mb-2">
             <Flag size={16} className="text-primary" />
             <span className="font-serif font-bold text-lg text-primary">VoteReady</span>
          </div>
          <p>A civic tool to help engaged Americans stay informed about upcoming elections.</p>
          <p className="text-xs">Data reflects scheduled 2026 elections. Please verify with your local election office.</p>
        </div>
      </footer>
    </div>
  );
}
