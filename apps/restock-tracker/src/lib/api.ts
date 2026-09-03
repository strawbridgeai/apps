// Plain fetch + TanStack Query client, replacing the Replit prototype's
// Orval-generated @workspace/api-client-react hooks (that codegen pipeline
// doesn't exist outside the pnpm workspace this was ported from). Talks to
// the same /api/* routes this app's own backend serves.
export type Chain = 'target' | 'best_buy' | 'walmart' | 'dollar_general' | 'local';
export type ReportStatus = 'in_stock' | 'limited' | 'sold_out' | 'unknown';
export type ReportSource = 'community' | 'store_call' | 'retailer_signal';
export type CallWorthiness = 'high' | 'medium' | 'low';

export interface PokemonSet {
  id: string;
  name: string;
  series: string;
  releaseDate: string;
  productTypes: string[];
  accent: string;
}

export interface Store {
  id: string;
  name: string;
  chain: Chain;
  address: string;
  city: string;
  state: string;
  phone: string;
  lat: number;
  lng: number;
  distanceMiles: number;
  callWorthiness: CallWorthiness;
  notes: string;
}

export interface StockReport {
  id: string;
  setId: string;
  storeId: string;
  status: ReportStatus;
  productType: string;
  reportedAt: string;
  source: ReportSource;
  confidence: number;
  note: string;
  reporter?: string;
}

export interface RadarSummary {
  setId: string;
  updatedAt: string;
  activeReports: number;
  inStockCount: number;
  limitedCount: number;
  soldOutCount: number;
  lastConfirmedAt: string | null;
  topSignal: string | null;
}

async function getJson<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  // Relative (no leading slash): this app is deployed at a subpath
  // (/apps/restock-tracker/), and Apache only proxies /api/* under that
  // same subpath, not at the domain root - an absolute "/api/..." path
  // would silently 404 by resolving to the wrong origin-root URL.
  const res = await fetch(`api/${path}?${query}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Request failed (${res.status})`);
  return res.json();
}

export const fetchSets = (): Promise<PokemonSet[]> =>
  fetch('api/sets').then((r) => {
    if (!r.ok) throw new Error('Failed to load sets');
    return r.json();
  });

export const fetchStores = (params: { lat: number; lng: number; radius: number }): Promise<Store[]> =>
  getJson('stores', params);

export const fetchReports = (params: { setId: string; lat: number; lng: number; radius: number; limit?: number }): Promise<StockReport[]> =>
  getJson('reports', { ...params, limit: params.limit ?? 20 });

export const fetchRadar = (params: { setId: string; lat: number; lng: number; radius: number }): Promise<RadarSummary> =>
  getJson('radar', params);

export interface CreateReportInput {
  setId: string;
  storeId: string;
  status: ReportStatus;
  productType: string;
  note: string;
  reporter?: string;
}

export const createReport = async (input: CreateReportInput): Promise<StockReport> => {
  const res = await fetch('api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Could not submit report');
  return res.json();
};
