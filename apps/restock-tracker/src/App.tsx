import { createContext, useContext, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import {
  createReport, fetchRadar, fetchReports, fetchSets, fetchStores,
  type PokemonSet, type StockReport, type Store,
} from '@/lib/api';
import {
  ArrowRight, Bell, Check, ChevronDown, CircleAlert, Crosshair, Flag,
  LocateFixed, MapPin, Menu, Navigation, Phone, Radio, Search, ShieldCheck,
  SlidersHorizontal, Sparkles, Target, X,
} from 'lucide-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import ShimmerText from '@/components/ShimmerText';
import './index.css';

const queryClient = new QueryClient();
const DEFAULT_LOCATION = { lat: 40.7128, lng: -74.006, label: 'New York, NY' };
const SetContext = createContext({
  selectedSetId: '',
  selectSet: (_id: string): void => undefined,
});

const ago = (date?: string | null) => {
  if (!date) return 'No confirmation yet';
  const minutes = Math.floor(Math.max(0, Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 2) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
};
const chainName = (chain: Store['chain']) => ({
  target: 'Target', best_buy: 'Best Buy', walmart: 'Walmart',
  dollar_general: 'Dollar General', local: 'Local shop',
}[chain]);

function HomeButton() {
  return (
    <a href="/" title="Back to all apps" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sidebar-border text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M3 9.5 12 3l9 6.5"></path>
        <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"></path>
      </svg>
    </a>
  );
}

// This app is deployed at a subpath (the VPS, /apps/restock-tracker/) and
// at a domain root (Cloudflare Pages), so the router base can't be a
// build-time constant — it's derived from the current URL by stripping off
// whichever known route suffix is present. Without this, wouter's routes
// never match on the subpath deployment (it compares against the full
// pathname) and every page silently renders the NotFound fallback instead —
// same bug already hit and fixed in election-tracker's App.tsx.
function computeBase() {
  const path = window.location.pathname;
  for (const suffix of ['/sets', '/stores', '/report']) {
    if (path.endsWith(suffix)) return path.slice(0, -suffix.length) || '';
  }
  return path.replace(/\/$/, '');
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={computeBase()}>
          <Switch>
            <Route path="/" component={DashboardRoute} />
            <Route path="/sets" component={SetsRoute} />
            <Route path="/stores" component={StoresRoute} />
            <Route path="/report" component={ReportRoute} />
            <Route component={NotFound} />
          </Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

const DashboardRoute = () => <Frame><Dashboard /></Frame>;
const SetsRoute = () => <Frame><SetsPage /></Frame>;
const StoresRoute = () => <Frame><StoresPage /></Frame>;
const ReportRoute = () => <Frame><ReportPage /></Frame>;

function Frame({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const [menu, setMenu] = useState(false);
  const query = useQuery({ queryKey: ['sets'], queryFn: fetchSets });
  const availableSets = query.data || [];
  const [selectedSetId, setSelectedSetId] = useState(() => localStorage.getItem('radar-set') || '');
  const selected = availableSets.find((item) => item.id === selectedSetId) || availableSets[0];
  const selectSet = (id: string) => {
    setSelectedSetId(id);
    localStorage.setItem('radar-set', id);
    setMenu(false);
  };
  const [place, setPlace] = useState(DEFAULT_LOCATION);
  const locate = () => navigator.geolocation?.getCurrentPosition(
    ({ coords }) => setPlace({ lat: coords.latitude, lng: coords.longitude, label: 'Current location' }),
    () => setPlace(DEFAULT_LOCATION),
  );
  return (
    <SetContext.Provider value={{ selectedSetId, selectSet }}>
      <div className="min-h-[100dvh] bg-background">
        <aside className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:translate-x-0 ${menu ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center justify-between border-b border-sidebar-border px-6 py-5">
            <div className="flex items-center gap-2">
              <HomeButton />
              <Link href="/" onClick={() => setMenu(false)} className="flex items-center gap-3" data-testid="link-brand">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Radio size={21} /></span>
                <span><ShimmerText text="Restock Radar" className="block text-[13px] tracking-tight" /><small className="font-mono text-[9px] uppercase tracking-[.2em] text-sidebar-foreground/50">field guide / 01</small></span>
              </Link>
            </div>
            <button onClick={() => setMenu(false)} className="rounded-lg p-2 lg:hidden" data-testid="button-close-menu"><X size={18} /></button>
          </div>
          <nav className="space-y-1 px-4 py-6">
            <p className="px-3 pb-3 font-mono text-[10px] uppercase tracking-[.22em] text-sidebar-foreground/45">Navigate</p>
            <Nav href="/" active={path === '/'} onClick={() => setMenu(false)} icon={<Target size={17} />} label="Radar" />
            <Nav href="/sets" active={path === '/sets'} onClick={() => setMenu(false)} icon={<Sparkles size={17} />} label="Set catalog" />
            <Nav href="/stores" active={path === '/stores'} onClick={() => setMenu(false)} icon={<MapPin size={17} />} label="Nearby stores" />
            <Nav href="/report" active={path === '/report'} onClick={() => setMenu(false)} icon={<Flag size={17} />} label="Submit sighting" />
          </nav>
          <div className="mt-auto px-5 pb-5">
            <div className="rounded-2xl border border-sidebar-border bg-sidebar-accent/55 p-4">
              <div className="mb-3 flex items-center gap-2 text-sidebar-primary"><Crosshair size={15} /><span className="font-mono text-[10px] uppercase tracking-[.18em]">Your watch zone</span></div>
              <p className="text-sm font-semibold">{place.label}</p><p className="mt-1 text-xs text-sidebar-foreground/55">25 mile sweep radius</p>
              <button onClick={locate} className="mt-4 flex items-center gap-2 text-xs font-bold text-sidebar-primary hover:underline" data-testid="button-update-location"><LocateFixed size={13} /> Update location</button>
            </div>
            <p className="mt-5 px-1 font-mono text-[9px] uppercase tracking-[.16em] text-sidebar-foreground/30">Community signal, made useful.</p>
          </div>
        </aside>
        {menu && <button onClick={() => setMenu(false)} className="fixed inset-0 z-30 bg-sidebar/45 lg:hidden" aria-label="Close menu" data-testid="button-menu-overlay" />}
        <div className="lg:pl-[264px]">
          <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 backdrop-blur-md">
            <div className="flex min-h-[72px] items-center gap-4 px-5 sm:px-8">
              <button onClick={() => setMenu(true)} className="rounded-xl border border-border bg-card p-2.5 lg:hidden" data-testid="button-open-menu"><Menu size={19} /></button>
              <div className="min-w-0 flex-1 text-xs text-muted-foreground"><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#3f9e68]" />Live collection zone <span className="mx-1 text-border">/</span> {place.label}</div>
              <label className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 sm:flex"><Search size={15} className="text-muted-foreground" /><select value={selected?.id || ''} onChange={(event) => selectSet(event.target.value)} className="max-w-[190px] bg-transparent text-xs font-bold outline-none" data-testid="select-header-set">{availableSets.length === 0 && <option value="">Loading sets…</option>}{availableSets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={14} className="text-muted-foreground" /></label>
              <button className="relative rounded-xl border border-border bg-card p-2.5 text-muted-foreground" data-testid="button-notifications"><Bell size={17} /><i className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" /></button>
            </div>
          </header>
          <main className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10">{children}</main>
        </div>
      </div>
    </SetContext.Provider>
  );
}

function Nav({ href, label, icon, active, onClick }: { href: string; label: string; icon: ReactNode; active: boolean; onClick: () => void }) {
  return <Link href={href} onClick={onClick} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>{icon}<span>{label}</span>{active && <ArrowRight size={14} className="ml-auto" />}</Link>;
}
function Intro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end rise-in"><div><p className="mb-2 font-mono text-[10px] uppercase tracking-[.24em] text-accent">{eyebrow}</p><h1 className="text-3xl font-extrabold tracking-[-.04em] sm:text-[42px]">{title}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p></div>{action}</div>;
}
function Metric({ label, value, color = 'text-foreground' }: { label: string; value: string | number; color?: string }) { return <div><p className={`font-mono text-base ${color}`}>{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{label}</p></div>; }
function Empty({ title, description, action, compact = false }: { title: string; description: string; action?: ReactNode; compact?: boolean }) {
  return <div className={`text-center ${compact ? 'px-6 py-10' : 'rounded-[24px] border border-dashed border-border bg-card px-6 py-16'}`}><div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><Navigation size={18} /></div><h3 className="mt-4 font-extrabold">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}
function Status({ value }: { value: StockReport['status'] }) {
  const labels = { in_stock: 'In stock', limited: 'Limited', sold_out: 'Sold out', unknown: 'Unknown' };
  const styles = { in_stock: 'bg-[#dff1e5] text-[#287748]', limited: 'bg-primary/20 text-[#896615]', sold_out: 'bg-accent/10 text-accent', unknown: 'bg-muted text-muted-foreground' };
  return <span className={`rounded-md px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide ${styles[value]}`}>{labels[value]}</span>;
}
function Worth({ value }: { value: Store['callWorthiness'] }) {
  const styles = { high: 'bg-[#dff1e5] text-[#287748]', medium: 'bg-primary/20 text-[#896615]', low: 'bg-muted text-muted-foreground' };
  return <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-extrabold ${styles[value]}`}>{value === 'high' ? 'Call first' : value === 'medium' ? 'Maybe' : 'Low'}</span>;
}

function Dashboard() {
  const { selectedSetId } = useContext(SetContext);
  const setsQuery = useQuery({ queryKey: ['sets'], queryFn: fetchSets });
  const sets = setsQuery.data || [];
  const active = sets.find((item) => item.id === selectedSetId) || sets[0];
  const [place, setPlace] = useState(DEFAULT_LOCATION);
  const [radius, setRadius] = useState(25);
  const params = useMemo(() => ({ setId: active?.id || '', lat: place.lat, lng: place.lng, radius }), [active?.id, place.lat, place.lng, radius]);
  const reportsParams = useMemo(() => ({ ...params, limit: 8 }), [params]);
  const radar = useQuery({ queryKey: ['radar', params], queryFn: () => fetchRadar(params), enabled: Boolean(active?.id), refetchInterval: 60_000, refetchOnWindowFocus: true });
  const reports = useQuery({ queryKey: ['reports', reportsParams], queryFn: () => fetchReports(reportsParams), enabled: Boolean(active?.id), refetchInterval: 60_000, refetchOnWindowFocus: true });
  const stores = useQuery({ queryKey: ['stores', { lat: place.lat, lng: place.lng, radius }], queryFn: () => fetchStores({ lat: place.lat, lng: place.lng, radius }) });
  const locate = () => navigator.geolocation?.getCurrentPosition(({ coords }) => setPlace({ lat: coords.latitude, lng: coords.longitude, label: 'Current location' }));
  return <><Intro eyebrow="Signal dashboard" title="Where should you look next?" description="A live read on community sightings, retailer signals, and the stores inside your watch zone." action={<Link href="/report" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground" data-testid="link-submit-sighting"><Flag size={16} /> Submit a sighting</Link>} /><div className="mb-6 flex flex-wrap items-center gap-2"><div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2"><MapPin size={15} className="text-accent" /><span className="text-xs font-bold">{place.label}</span><button onClick={locate} className="ml-1 text-muted-foreground" data-testid="button-dashboard-location"><LocateFixed size={14} /></button></div><label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold"><SlidersHorizontal size={14} className="text-muted-foreground" /> Radius <select value={radius} onChange={(event) => setRadius(Number(event.target.value))} className="bg-transparent font-mono outline-none" data-testid="select-dashboard-radius"><option value={10}>10 mi</option><option value={25}>25 mi</option><option value={50}>50 mi</option><option value={75}>75 mi</option></select></label><span className="ml-auto font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">{radar.data ? `Updated ${ago(radar.data.updatedAt)}` : 'Connecting to radar'}</span></div>{setsQuery.isError ? <Empty title="Set catalog missed the signal" description="Radar needs the official set feed before it can scan." action={<button onClick={() => setsQuery.refetch()} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold" data-testid="button-retry-dashboard">Retry feed</button>} /> : !active ? <div className="space-y-6"><div className="h-[310px] animate-pulse rounded-[24px] bg-muted" /><div className="h-48 animate-pulse rounded-[24px] bg-muted" /></div> : <div className="space-y-6"><section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]"><div className="relative min-h-[310px] overflow-hidden rounded-[24px] bg-sidebar p-6 text-sidebar-foreground shadow-lg sm:p-8"><div className="absolute inset-0 radar-grid opacity-30" /><div className="absolute -right-12 -top-20 h-64 w-64 rounded-full border border-sidebar-primary/25" /><div className="relative z-10 flex h-full flex-col justify-between"><div className="flex justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.22em] text-sidebar-primary">Selected set</p><h2 className="mt-3 text-3xl font-extrabold tracking-[-.05em] sm:text-5xl">{active.name}</h2><p className="mt-2 text-sm text-sidebar-foreground/60">{active.series} <span className="mx-2">•</span> Released {active.releaseDate}</p></div><div className="hidden h-14 w-14 place-items-center rounded-2xl border border-sidebar-primary/30 bg-sidebar-primary/10 sm:grid"><Target size={24} className="text-sidebar-primary" /></div></div><div className="mt-12 flex items-end justify-between gap-4"><div><div className="flex items-center gap-2 text-sidebar-primary"><span className="h-2 w-2 rounded-full bg-sidebar-primary signal-pulse" /><span className="font-mono text-[11px] uppercase tracking-[.18em]">{radar.data?.inStockCount ? 'Signal found' : 'Quiet zone'}</span></div><p className="mt-2 max-w-sm text-sm leading-6 text-sidebar-foreground/58">{radar.data?.topSignal || 'No fresh signal has crossed your watch zone yet.'}</p></div><div className="text-right"><p className="font-mono text-4xl text-sidebar-primary">{radar.data?.activeReports ?? '—'}</p><p className="font-mono text-[9px] uppercase tracking-[.17em] text-sidebar-foreground/45">active reports</p></div></div></div></div><Signal radar={radar.data} loading={radar.isLoading} error={radar.isError} retry={() => radar.refetch()} /></section><section className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]"><Reports reports={reports.data || []} stores={stores.data || []} sets={sets} loading={reports.isLoading} /><Nearby stores={stores.data || []} loading={stores.isLoading} /></section></div>}</>;
}
function Signal({ radar, loading, error, retry }: { radar?: { inStockCount: number; limitedCount: number; soldOutCount: number; lastConfirmedAt: string | null }; loading: boolean; error: boolean; retry: () => void }) {
  return <div className="rounded-[24px] border border-border bg-card p-6 shadow-sm"><div className="flex justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Radar readout</p><h3 className="mt-1 text-lg font-extrabold">Signal strength</h3></div><div className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-secondary-foreground"><Radio size={18} /></div></div>{loading ? <div className="mt-8 space-y-4"><div className="h-10 w-28 animate-pulse rounded bg-muted" /><div className="h-2 animate-pulse rounded bg-muted" /><div className="h-2 w-3/4 animate-pulse rounded bg-muted" /></div> : error ? <div className="mt-8 rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm font-bold"><CircleAlert size={16} className="mr-2 inline text-accent" />Radar unavailable<button onClick={retry} className="ml-3 text-xs text-accent underline" data-testid="button-retry-radar">Retry</button></div> : <><div className="mt-7 flex items-end gap-2"><span className="font-mono text-5xl tracking-[-.08em]">{radar?.inStockCount ?? 0}</span><span className="pb-1 text-sm font-semibold text-muted-foreground">in stock reports</span></div><div className="mt-5 flex h-2 overflow-hidden rounded-full bg-muted"><span className="bg-[#3f9e68]" style={{ width: `${Math.min(100, (radar?.inStockCount || 0) * 18)}%` }} /><span className="bg-primary" style={{ width: `${Math.min(100, (radar?.limitedCount || 0) * 14)}%` }} /><span className="bg-accent" style={{ width: `${Math.min(100, (radar?.soldOutCount || 0) * 10)}%` }} /></div><div className="mt-4 grid grid-cols-3 gap-2"><Metric label="Limited" value={radar?.limitedCount ?? 0} color="text-primary" /><Metric label="Sold out" value={radar?.soldOutCount ?? 0} color="text-accent" /><Metric label="Confirmed" value={ago(radar?.lastConfirmedAt)} /></div></>}</div>;
}
function Reports({ reports, stores, sets, loading }: { reports: StockReport[]; stores: Store[]; sets: PokemonSet[]; loading: boolean }) {
  return <div className="rounded-[24px] border border-border bg-card shadow-sm"><div className="flex justify-between border-b border-border px-6 py-5"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Fresh sightings</p><h3 className="mt-1 text-lg font-extrabold">Community signal</h3></div><Link href="/report" className="text-xs font-bold text-accent" data-testid="link-view-report-form">Add report <ArrowRight size={13} className="inline" /></Link></div>{loading ? <div className="space-y-4 p-6">{[1, 2, 3].map((n) => <div key={n} className="h-12 animate-pulse rounded bg-muted" />)}</div> : reports.length === 0 ? <Empty compact title="No sightings in this zone" description="Be the first collector to leave a useful signal." action={<Link href="/report" className="text-xs font-bold text-accent underline" data-testid="link-empty-report">Report a sighting</Link>} /> : <div className="divide-y divide-border">{reports.slice(0, 5).map((report) => { const store = stores.find((item) => item.id === report.storeId); const set = sets.find((item) => item.id === report.setId); return <div className="flex gap-3 px-6 py-4" key={report.id} data-testid={`row-report-${report.id}`}><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground"><Radio size={15} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b className="truncate text-sm">{store?.name || 'Nearby store'}</b><Status value={report.status} /></div><p className="mt-1 truncate text-xs text-muted-foreground">{report.productType} {set ? `• ${set.name}` : ''} {report.note ? `• ${report.note}` : ''}</p><small className="mt-2 block font-mono text-[9px] uppercase tracking-[.12em] text-muted-foreground">{ago(report.reportedAt)} / {report.source.replace('_', ' ')}</small></div><div className="font-mono text-xs">{report.confidence}%<small className="block text-[9px] text-muted-foreground">confidence</small></div></div>; })}</div>}</div>;
}
function Nearby({ stores, loading }: { stores: Store[]; loading: boolean }) {
  return <div className="rounded-[24px] border border-border bg-card shadow-sm"><div className="flex justify-between border-b border-border px-6 py-5"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">In your sweep</p><h3 className="mt-1 text-lg font-extrabold">Call-worthy stores</h3></div><Link href="/stores" className="text-xs font-bold text-accent" data-testid="link-view-stores">View all <ArrowRight size={13} className="inline" /></Link></div>{loading ? <div className="space-y-4 p-6">{[1, 2, 3].map((n) => <div key={n} className="h-12 animate-pulse rounded bg-muted" />)}</div> : stores.length === 0 ? <Empty compact title="No stores found" description="Expand your radius to scan farther." /> : <div className="divide-y divide-border">{stores.slice(0, 4).map((store) => <div className="flex items-center gap-3 px-6 py-4" key={store.id} data-testid={`row-store-${store.id}`}><div className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-secondary-foreground"><MapPin size={16} /></div><div className="min-w-0 flex-1"><b className="block truncate text-sm">{store.name}</b><small className="text-xs text-muted-foreground">{chainName(store.chain)} • {store.distanceMiles.toFixed(1)} mi</small></div><Worth value={store.callWorthiness} /></div>)}</div>}</div>;
}

function SetsPage() {
  const query = useQuery({ queryKey: ['sets'], queryFn: fetchSets });
  const sets = query.data || [];
  const { selectedSetId, selectSet } = useContext(SetContext);
  const active = sets.find((item) => item.id === selectedSetId) || sets[0];
  return <><Intro eyebrow="Official catalog" title="Choose your chase." description="Keep one set on the radar at a time. Every signal, store read, and report stays grounded in this selection." action={<span className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-xs font-bold text-secondary-foreground"><ShieldCheck size={15} /> Official set data</span>} />{query.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((n) => <div key={n} className="h-48 animate-pulse rounded-[22px] bg-muted" />)}</div> : query.isError ? <Empty title="Set catalog missed the signal" description="We couldn't load official sets right now." action={<button onClick={() => query.refetch()} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold" data-testid="button-retry-sets">Try again</button>} /> : <><div className="mb-6 rounded-[22px] border border-primary/35 bg-primary/10 p-5 sm:flex sm:items-center sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#896615]">Currently watching</p><p className="mt-1 text-xl font-extrabold">{active?.name || 'Pick a set below'}</p><p className="mt-1 text-xs text-muted-foreground">{active?.series || 'The radar follows your selection.'}</p></div><Link href="/" className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-accent sm:mt-0" data-testid="link-open-selected-radar">Open radar <ArrowRight size={15} /></Link></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{sets.map((set) => <button onClick={() => selectSet(set.id)} className={`group relative min-h-[190px] overflow-hidden rounded-[22px] border p-5 text-left transition-all hover:-translate-y-1 hover:shadow-md ${active?.id === set.id ? 'border-primary shadow-sm' : 'border-border'} bg-card`} key={set.id} data-testid={`button-select-set-${set.id}`}><div className="absolute right-0 top-0 h-28 w-28 rounded-bl-[80px] opacity-20" style={{ background: set.accent || '#e1ae36' }} /><div className="relative flex h-full flex-col justify-between"><div><div className="mb-5 flex justify-between"><span className="font-mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">{set.series}</span>{active?.id === set.id && <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground"><Check size={13} /></span>}</div><h3 className="max-w-[210px] text-xl font-extrabold tracking-[-.04em]">{set.name}</h3></div><div className="flex justify-between text-xs text-muted-foreground"><span>Released {set.releaseDate}</span><span className="font-mono text-[10px]">{set.productTypes.length} formats</span></div></div></button>)}</div></>}</>;
}

function StoresPage() {
  const [place, setPlace] = useState(DEFAULT_LOCATION);
  const [radius, setRadius] = useState(25);
  const [filter, setFilter] = useState<'all' | Store['callWorthiness']>('all');
  const params = useMemo(() => ({ lat: place.lat, lng: place.lng, radius }), [place.lat, place.lng, radius]);
  const query = useQuery({ queryKey: ['stores', params], queryFn: () => fetchStores(params) });
  const stores = (query.data || []).filter((store) => filter === 'all' || store.callWorthiness === filter);
  return <><Intro eyebrow="Store directory" title="Your next stops, sorted." description="Distance is useful. Call-worthiness is better. Start with stores where a quick check has the best chance of paying off." action={<Link href="/report" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground" data-testid="link-store-report"><Flag size={16} /> Log a sighting</Link>} /><div className="mb-5 flex flex-wrap gap-2"><div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold"><MapPin size={15} className="text-accent" />{place.label}<button onClick={() => navigator.geolocation?.getCurrentPosition(({ coords }) => setPlace({ lat: coords.latitude, lng: coords.longitude, label: 'Current location' }))} className="ml-1 text-muted-foreground" data-testid="button-stores-location"><LocateFixed size={14} /></button></div><label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold"><SlidersHorizontal size={14} /><select value={radius} onChange={(event) => setRadius(Number(event.target.value))} className="bg-transparent outline-none" data-testid="select-stores-radius"><option value={10}>10 mile radius</option><option value={25}>25 mile radius</option><option value={50}>50 mile radius</option><option value={75}>75 mile radius</option></select></label><div className="ml-auto flex rounded-xl border border-border bg-card p-1">{(['all', 'high', 'medium'] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-extrabold ${filter === value ? 'bg-sidebar text-sidebar-foreground' : 'text-muted-foreground'}`} data-testid={`button-filter-stores-${value}`}>{value === 'all' ? 'All' : value === 'high' ? 'Call first' : 'Maybe'}</button>)}</div></div>{query.isLoading ? <div className="grid gap-4 md:grid-cols-2">{[1, 2, 3, 4].map((n) => <div key={n} className="h-44 animate-pulse rounded-[22px] bg-muted" />)}</div> : query.isError ? <Empty title="Store scan interrupted" description="We couldn't locate nearby stores." action={<button onClick={() => query.refetch()} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold" data-testid="button-retry-stores">Retry scan</button>} /> : stores.length === 0 ? <Empty title="No stores match this filter" description="Try a wider radius or another call-worthiness tier." action={<button onClick={() => setFilter('all')} className="text-sm font-bold text-accent underline" data-testid="button-clear-store-filter">Show all stores</button>} /> : <div className="grid gap-4 md:grid-cols-2">{stores.map((store) => <article className="group rounded-[22px] border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md" key={store.id} data-testid={`card-store-${store.id}`}><div className="flex justify-between gap-4"><div className="flex gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><MapPin size={19} /></div><div><h3 className="font-extrabold">{store.name}</h3><p className="mt-1 text-xs text-muted-foreground">{chainName(store.chain)} • {store.distanceMiles.toFixed(1)} miles</p></div></div><Worth value={store.callWorthiness} /></div><div className="mt-5 grid gap-2 text-xs text-muted-foreground"><p>{store.address}, {store.city}, {store.state}</p>{store.notes && <p className="rounded-lg bg-muted/70 px-3 py-2">{store.notes}</p>}</div><div className="mt-5 flex justify-between border-t border-border pt-4"><span className="font-mono text-[10px] text-muted-foreground">{store.phone}</span><a href={`tel:${store.phone}`} className="inline-flex items-center gap-2 rounded-lg bg-sidebar px-3 py-2 text-xs font-bold text-sidebar-foreground" data-testid={`link-call-store-${store.id}`}><Phone size={13} /> Call store</a></div></article>)}</div>}</>;
}

function ReportPage() {
  const sets = useQuery({ queryKey: ['sets'], queryFn: fetchSets }).data || [];
  const [setId, setSetId] = useState(() => localStorage.getItem('radar-set') || '');
  const [storeId, setStoreId] = useState('');
  const [status, setStatus] = useState<'in_stock' | 'limited' | 'sold_out' | 'unknown'>('in_stock');
  const [productType, setProductType] = useState('');
  const [note, setNote] = useState('');
  const [reporter, setReporter] = useState('');
  const [done, setDone] = useState(false);
  const storesQuery = useQuery({ queryKey: ['stores', { lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng, radius: 50 }], queryFn: () => fetchStores({ lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng, radius: 50 }) });
  const mutation = useMutation({ mutationFn: createReport });
  const active = sets.find((set) => set.id === setId);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!setId || !storeId || !productType || !note.trim()) return;
    mutation.mutate({ setId, storeId, status, productType, note: note.trim(), reporter: reporter.trim() || undefined }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reports'] }); queryClient.invalidateQueries({ queryKey: ['radar'] }); setDone(true); } });
  };
  if (done) return <div className="mx-auto max-w-2xl py-12 rise-in"><div className="rounded-[28px] border border-[#a7d8b7] bg-[#f2fbf4] p-8 text-center sm:p-12"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#dff1e5] text-[#287748]"><Check size={30} /></div><p className="mt-6 font-mono text-[10px] uppercase tracking-[.22em] text-[#287748]">Signal received</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.05em] text-[#1f5331]">That helps the whole route.</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#4e7058]">Your sighting is now part of the radar. Fresh, specific notes make the next stop smarter.</p><div className="mt-8 flex justify-center gap-3"><Link href="/" className="rounded-xl bg-sidebar px-4 py-3 text-sm font-extrabold text-sidebar-foreground" data-testid="link-report-success-radar">Back to radar</Link><button onClick={() => setDone(false)} className="rounded-xl border border-[#a7d8b7] px-4 py-3 text-sm font-extrabold text-[#287748]" data-testid="button-submit-another">Submit another</button></div></div></div>;
  return <><Intro eyebrow="Community signal" title="Leave a useful trace." description="A good sighting is specific, recent, and honest about confidence. It takes under a minute." action={<span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground"><ShieldCheck size={15} className="text-[#3f9e68]" /> No account required</span>} /><div className="grid gap-5 lg:grid-cols-[1fr_.62fr]"><form onSubmit={submit} className="rounded-[24px] border border-border bg-card p-6 shadow-sm sm:p-8"><Field label="Which set?"><select value={setId} onChange={(event) => { setSetId(event.target.value); setProductType(''); localStorage.setItem('radar-set', event.target.value); }} className="field-control" data-testid="select-report-set"><option value="">Select an official set</option>{sets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}</select></Field><Field label="Where?"><select value={storeId} onChange={(event) => setStoreId(event.target.value)} className="field-control" data-testid="select-report-store"><option value="">Select a store</option>{(storesQuery.data || []).map((store) => <option key={store.id} value={store.id}>{store.name} · {store.distanceMiles.toFixed(1)} mi</option>)}</select></Field><Field label="What did you find?"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(active?.productTypes || ['Booster packs', 'Elite Trainer Box', 'Collection box', 'Other']).map((item) => <button type="button" key={item} onClick={() => setProductType(item)} className={`rounded-xl border px-3 py-3 text-left text-xs font-bold ${productType === item ? 'border-primary bg-primary/15 text-[#896615]' : 'border-border bg-background'}`} data-testid={`button-product-type-${item.toLowerCase().replaceAll(' ', '-')}`}>{item}</button>)}</div></Field><Field label="Shelf status"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[['in_stock', 'In stock'], ['limited', 'Limited'], ['sold_out', 'Sold out'], ['unknown', 'Not sure']].map(([value, label]) => <button type="button" key={value} onClick={() => setStatus(value as typeof status)} className={`rounded-xl border px-3 py-3 text-left text-xs font-bold ${status === value ? 'border-primary bg-primary/15 text-[#896615]' : 'border-border bg-background'}`} data-testid={`button-report-status-${value}`}>{label}</button>)}</div></Field><Field label="Collector note" hint="Mention aisle, quantity, or timing"><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="Example: Two ETBs behind the service desk around 4:20pm." className="field-control resize-none" data-testid="textarea-report-note" /></Field><div className="grid gap-5 sm:grid-cols-2"><Field label="Your name (optional)"><input value={reporter} onChange={(event) => setReporter(event.target.value)} maxLength={80} placeholder="Collector handle" className="field-control" data-testid="input-report-reporter" /></Field><div className="flex items-end"><button type="submit" disabled={!setId || !storeId || !productType || !note.trim() || mutation.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-extrabold text-primary-foreground disabled:opacity-45" data-testid="button-submit-report">{mutation.isPending ? 'Sending signal…' : 'Send to radar'}<ArrowRight size={16} /></button></div></div>{mutation.isError && <p className="mt-4 text-sm font-semibold text-accent"><CircleAlert size={15} className="mr-1 inline" />This report could not be sent. Try again.</p>}</form><div className="space-y-4"><div className="rounded-[24px] bg-sidebar p-6 text-sidebar-foreground shadow-md"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-sidebar-primary">Signal standard</p><h2 className="mt-3 text-2xl font-extrabold">Specific beats loud.</h2><p className="mt-3 text-sm leading-6 text-sidebar-foreground/60">Reports are weighted by freshness, source, and detail. A calm “sold out at 4:20” is more valuable than a vague “gone.”</p><div className="mt-6 space-y-3">{['Fresh timestamp', 'Exact product type', 'Shelf-level detail'].map((item) => <div className="flex items-center gap-2 text-xs font-semibold" key={item}><span className="grid h-5 w-5 place-items-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground"><Check size={12} /></span>{item}</div>)}</div></div><div className="rounded-[24px] border border-border bg-card p-6 text-sm"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Your context</p><div className="mt-4 space-y-3"><div className="flex justify-between"><span className="text-muted-foreground">Set</span><strong>{active?.name || 'Not selected'}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Location</span><strong>{DEFAULT_LOCATION.label}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Status</span><strong>{status.replace('_', ' ')}</strong></div></div></div></div></div></>;
}
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="mt-5 block first:mt-0"><span className="flex items-baseline justify-between gap-3 text-sm font-extrabold"><span>{label}</span>{hint && <small className="text-[10px] font-medium text-muted-foreground">{hint}</small>}</span><div className="mt-2">{children}</div></label>; }

export default App;
