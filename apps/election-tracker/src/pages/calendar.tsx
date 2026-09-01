import { useState, useMemo } from "react";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { elections } from "@/data/elections";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const minMonth = new Date(2026, 5, 1); // June 2026
const maxMonth = new Date(2026, 10, 1); // November 2026

function clampToRange(date: Date) {
  if (date < minMonth) return minMonth;
  if (date > maxMonth) return maxMonth;
  return startOfMonth(date);
}

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [currentMonth, setCurrentMonth] = useState<Date>(() => clampToRange(today));
  const [selectedState, setSelectedState] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const states = useMemo(() => {
    return Array.from(new Set(elections.map(e => e.state))).sort();
  }, []);

  const filteredElections = useMemo(() => {
    if (selectedState === "all") return elections;
    return elections.filter(e => e.state === selectedState);
  }, [selectedState]);

  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const getElectionsForDay = (date: Date) => {
    return filteredElections.filter(e => isSameDay(parseISO(e.date), date));
  };

  const selectedDateElections = selectedDate ? getElectionsForDay(selectedDate) : [];

  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));

  const canGoPrev = currentMonth > minMonth;
  const canGoNext = currentMonth < maxMonth;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold font-serif text-foreground mb-2">2026 Election Calendar</h1>
          <p className="text-muted-foreground max-w-2xl">
            Track key election dates across the United States. Select a state to filter, and click on any highlighted date to see details.
          </p>
        </div>

        <Select value={selectedState} onValueChange={setSelectedState}>
          <SelectTrigger className="w-full md:w-[240px] bg-background">
            <SelectValue placeholder="Filter by State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {states.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between bg-card p-4 rounded-xl border shadow-sm">
            <Button variant="outline" size="icon" onClick={handlePrevMonth} disabled={!canGoPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-xl font-bold font-serif">
              {format(currentMonth, "MMMM yyyy")}
            </h2>
            <Button variant="outline" size="icon" onClick={handleNextMonth} disabled={!canGoNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            <div className="grid grid-cols-7 border-b bg-muted/30">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="py-3 text-center text-sm font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 auto-rows-fr">
              {/* Padding days for first week */}
              {Array.from({ length: daysInMonth[0].getDay() }).map((_, i) => (
                <div key={`pad-${i}`} className="border-r border-b border-muted/50 p-2 min-h-[100px] bg-muted/5" />
              ))}

              {daysInMonth.map(date => {
                const dayElections = getElectionsForDay(date);
                const hasElections = dayElections.length > 0;
                const isSelected = selectedDate && isSameDay(selectedDate, date);

                return (
                  <button
                    key={date.toISOString()}
                    onClick={() => setSelectedDate(date)}
                    className={`
                      border-r border-b border-muted/50 p-2 min-h-[100px] flex flex-col items-start transition-colors
                      ${isSelected ? 'bg-primary/5 border-primary/30 ring-1 ring-inset ring-primary/20' : 'hover:bg-muted/30'}
                      ${hasElections ? 'cursor-pointer' : ''}
                    `}
                  >
                    <span className={`text-sm font-medium p-1.5 rounded-full min-w-[28px] text-center ${
                      isSelected ? 'bg-primary text-primary-foreground' :
                      hasElections ? 'bg-muted text-foreground' : 'text-muted-foreground'
                    }`}>
                      {format(date, "d")}
                    </span>

                    <div className="mt-2 w-full space-y-1">
                      {dayElections.slice(0, 3).map((e, i) => (
                        <div key={i} className="text-[10px] leading-tight truncate px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium w-full text-left">
                          {e.stateCode} {e.type === "General" ? "Gen" : "Pri"}
                        </div>
                      ))}
                      {dayElections.length > 3 && (
                        <div className="text-[10px] text-muted-foreground px-1 font-medium">
                          +{dayElections.length - 3} more
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Padding days for last week */}
              {Array.from({ length: 6 - daysInMonth[daysInMonth.length - 1].getDay() }).map((_, i) => (
                <div key={`pad-end-${i}`} className="border-r border-b border-muted/50 p-2 min-h-[100px] bg-muted/5" />
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-card rounded-xl border shadow-sm h-full flex flex-col max-h-[800px] sticky top-24">
            <div className="p-6 border-b bg-muted/10 rounded-t-xl">
              <h3 className="text-lg font-bold font-serif">
                {selectedDate ? format(selectedDate, "MMMM d, yyyy") : "Select a date"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedDateElections.length} {selectedDateElections.length === 1 ? 'election' : 'elections'} scheduled
              </p>
            </div>

            <ScrollArea className="flex-1 p-6">
              {!selectedDate ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MapPin className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>Click any highlighted date on the calendar to see detailed election information.</p>
                </div>
              ) : selectedDateElections.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No elections scheduled for this date matching your filters.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {selectedDateElections.map(election => (
                    <div key={election.id} className="border rounded-lg p-4 space-y-3 bg-background shadow-sm hover:border-primary/30 transition-colors">
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-base">{election.state}</h4>
                        <Badge variant="outline" className={
                          election.type === "General" ? "text-primary border-primary/20" : "text-blue-600 border-blue-200"
                        }>
                          {election.type}
                        </Badge>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Offices on Ballot</p>
                        <ul className="text-sm space-y-1">
                          {election.offices.map((office, i) => (
                            <li key={i} className="flex items-center gap-2">
                              <div className="w-1 h-1 rounded-full bg-primary/40" />
                              {office}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <Button variant="secondary" size="sm" className="w-full mt-2" asChild>
                         <a href={`https://vote.gov/register/${election.state.toLowerCase().replace(/\s+/g, '-')}`} target="_blank" rel="noopener noreferrer">
                           Voter Information
                         </a>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
