import { useState, useMemo } from "react";
import { format, differenceInDays, parseISO } from "date-fns";
import { Calendar, Clock, AlertTriangle, ArrowRight, Search, Filter, ChevronDown } from "lucide-react";
import { Election, elections } from "@/data/elections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Home() {
  const [selectedState, setSelectedState] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const today = useMemo(() => new Date(), []);

  const states = useMemo(() => {
    const uniqueStates = Array.from(new Set(elections.map(e => e.state))).sort();
    return uniqueStates;
  }, []);

  const filteredElections = useMemo(() => {
    return elections.filter(e => {
      if (selectedState !== "all" && e.state !== selectedState) return false;
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (searchQuery && !e.state.toLowerCase().includes(searchQuery.toLowerCase()) && !e.offices.some(o => o.toLowerCase().includes(searchQuery.toLowerCase()))) {
        return false;
      }
      return new Date(e.date) >= today;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [selectedState, typeFilter, searchQuery, today]);

  const nextElection = filteredElections.length > 0 ? filteredElections[0] : null;

  return (
    <div className="container mx-auto px-4 md:px-8 py-8 max-w-6xl space-y-8">
      {/* Hero Section */}
      <div className="bg-primary/5 rounded-2xl p-8 border border-primary/10 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
          <Calendar size={200} />
        </div>
        <div className="max-w-3xl relative z-10">
          <h1 className="text-4xl md:text-5xl font-bold font-serif text-primary tracking-tight mb-4">
            Be ready for every ballot.
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            Your comprehensive guide to 2026 state and federal elections. Find your state, check the dates, and make sure your voice is heard.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 max-w-xl">
            <div className="relative w-full sm:w-[280px]">
              <select
                data-testid="select-state"
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                className="w-full h-12 pl-4 pr-10 text-base rounded-md border border-primary/20 bg-background text-foreground shadow-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-colors"
                style={{ WebkitAppearance: "none", MozAppearance: "none" }}
              >
                <option value="all">All States</option>
                {states.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            <Button className="h-12 px-8 font-semibold shadow-sm text-base" asChild>
              <a href="#elections">View Elections</a>
            </Button>
          </div>
        </div>
      </div>

      {/* Next Election Banner */}
      {selectedState !== "all" && nextElection && (
        <div className="bg-primary text-primary-foreground rounded-xl p-6 shadow-md flex flex-col md:flex-row items-center justify-between gap-6 hover-elevate transition-transform duration-300">
          <div className="flex items-center gap-4">
            <div className="bg-background/20 p-3 rounded-full">
              <Clock className="w-8 h-8 text-primary-foreground" />
            </div>
            <div>
              <p className="text-primary-foreground/80 text-sm font-medium uppercase tracking-wider mb-1">Next Election in {selectedState}</p>
              <h2 className="text-2xl font-bold font-serif">{format(parseISO(nextElection.date), "MMMM d, yyyy")}</h2>
              <p className="text-primary-foreground/90 font-medium">{nextElection.type} Election</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <div className="text-3xl font-bold font-mono bg-background/10 px-4 py-2 rounded-lg">
              {differenceInDays(parseISO(nextElection.date), today)} days
            </div>
            <p className="text-sm text-primary-foreground/70">until election day</p>
          </div>
        </div>
      )}

      {/* Filters and List */}
      <div id="elections" className="space-y-6 pt-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
          <h2 className="text-2xl font-bold font-serif tracking-tight text-foreground flex items-center gap-2">
            Upcoming Elections
            <Badge variant="secondary" className="text-sm rounded-full px-3">{filteredElections.length}</Badge>
          </h2>

          <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search state or office..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[160px] bg-background">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Election Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Primary">Primary</SelectItem>
                <SelectItem value="General">General</SelectItem>
                <SelectItem value="Special">Special</SelectItem>
                <SelectItem value="Primary Runoff">Runoff</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredElections.length > 0 ? (
            filteredElections.map(election => (
              <ElectionCard key={election.id} election={election} today={today} />
            ))
          ) : (
            <div className="col-span-full py-12 text-center border-2 border-dashed rounded-xl bg-muted/20">
              <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-foreground mb-2">No elections found</h3>
              <p className="text-muted-foreground">Try adjusting your filters or selecting a different state.</p>
              {(searchQuery || typeFilter !== "all" || selectedState !== "all") && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setSearchQuery("");
                    setTypeFilter("all");
                    setSelectedState("all");
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ElectionCard({ election, today }: { election: Election; today: Date }) {
  const electionDate = parseISO(election.date);
  const daysUntil = differenceInDays(electionDate, today);
  const isSoon = daysUntil <= 30 && daysUntil > 0;
  const isToday = daysUntil === 0;

  const getTypeColor = (type: string) => {
    switch(type) {
      case "Primary": return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800";
      case "General": return "bg-primary/10 text-primary border-primary/20";
      case "Special": return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800";
      case "Primary Runoff": return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800";
      default: return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
    }
  };

  return (
    <Card className="flex flex-col h-full hover-elevate transition-all duration-200 border-border/60 hover:border-primary/30 group">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start mb-2">
          <Badge variant="outline" className={`font-semibold ${getTypeColor(election.type)}`}>
            {election.type}
          </Badge>
          {isToday ? (
            <Badge variant="destructive" className="animate-pulse">Today!</Badge>
          ) : isSoon ? (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/50 dark:text-amber-400 border-none">
              In {daysUntil} days
            </Badge>
          ) : (
            <span className="text-xs font-mono text-muted-foreground">{daysUntil} days away</span>
          )}
        </div>
        <CardTitle className="text-xl font-serif leading-tight group-hover:text-primary transition-colors">
          {election.state}
        </CardTitle>
        <CardDescription className="text-base font-medium text-foreground flex items-center gap-1.5 mt-1">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          {format(electionDate, "MMMM d, yyyy")}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">On the Ballot</p>
            <div className="flex flex-wrap gap-1.5">
              {election.offices.map((office, i) => (
                <Badge key={i} variant="secondary" className="bg-muted/50 font-normal hover:bg-muted/80">
                  {office}
                </Badge>
              ))}
            </div>
          </div>

          {isSoon && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-md p-3 flex gap-3 text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
              <div className="text-amber-800 dark:text-amber-400/90">
                <span className="font-semibold block mb-0.5">Registration deadline approaching</span>
                Check your voter registration status immediately to ensure you can vote.
              </div>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="pt-4 border-t bg-muted/10">
        <Button variant="ghost" className="w-full justify-between hover:bg-primary/5 hover:text-primary" asChild>
          <a href={`https://vote.gov/register/${election.state.toLowerCase().replace(/\s+/g, '-')}`} target="_blank" rel="noopener noreferrer">
            Register or Check Status
            <ArrowRight className="w-4 h-4" />
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
}
