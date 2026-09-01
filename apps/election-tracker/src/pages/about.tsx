import { Flag, BookOpen, ExternalLink, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function About() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold font-serif text-foreground mb-4">About VoteReady</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          A civic resource designed to help engaged Americans stay informed and prepared for upcoming elections.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 mb-16">
        <Card className="bg-primary/5 border-primary/10 shadow-sm">
          <CardContent className="pt-6">
            <div className="bg-background w-12 h-12 rounded-full flex items-center justify-center mb-4 shadow-sm">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-bold font-serif mb-2">Our Mission</h3>
            <p className="text-muted-foreground">
              We believe democracy works best when participation is high. VoteReady exists to make tracking election dates, deadlines, and ballot information simple, accessible, and reliable.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-secondary/30 border-secondary shadow-sm">
          <CardContent className="pt-6">
            <div className="bg-background w-12 h-12 rounded-full flex items-center justify-center mb-4 shadow-sm">
              <BookOpen className="w-6 h-6 text-foreground" />
            </div>
            <h3 className="text-xl font-bold font-serif mb-2">The Data</h3>
            <p className="text-muted-foreground">
              Our data covers the 2026 primary and general election calendar for all 50 states. We focus on statewide and federal offices to ensure you know when the biggest decisions are being made.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="prose prose-slate dark:prose-invert max-w-none mb-12">
        <h2 className="font-serif text-2xl font-bold border-b pb-2">How to Use This Tool</h2>
        <ul className="space-y-2 mt-4 text-muted-foreground">
          <li><strong>Find Your State:</strong> Use the home page selector to instantly see all upcoming elections for your specific state.</li>
          <li><strong>Browse the Calendar:</strong> Need a broader view? The calendar page provides a month-by-month breakdown of election days across the country.</li>
          <li><strong>Check Deadlines:</strong> Watch for registration warnings on election cards. We'll highlight when a deadline is less than 30 days away.</li>
          <li><strong>Take Action:</strong> Every election card includes direct links to official voter registration resources.</li>
        </ul>
      </div>

      <div className="bg-muted/30 rounded-2xl p-8 text-center border">
        <Flag className="w-12 h-12 mx-auto text-primary mb-4" />
        <h2 className="text-2xl font-bold font-serif mb-4">Ready to participate?</h2>
        <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
          The most important step you can take is ensuring your voter registration is up to date at your current address.
        </p>
        <Button size="lg" className="font-semibold" asChild>
          <a href="https://vote.gov" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
            Visit Vote.gov <ExternalLink className="w-4 h-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}
