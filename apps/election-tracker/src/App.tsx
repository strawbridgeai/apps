import { Switch, Route, Router as WouterRouter } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import CalendarPage from "@/pages/calendar";
import About from "@/pages/about";
import { Layout } from "@/components/layout";

// This app is served both at a subpath (the VPS, e.g. /apps/election-tracker/)
// and at a domain root (Cloudflare Pages), so the router base can't be a
// build-time constant — it's derived from the current URL by stripping off
// whichever known route suffix is present.
function computeBase() {
  const path = window.location.pathname;
  for (const suffix of ["/calendar", "/about"]) {
    if (path.endsWith(suffix)) return path.slice(0, -suffix.length) || "";
  }
  return path.replace(/\/$/, "");
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/about" component={About} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={computeBase()}>
        <Router />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
