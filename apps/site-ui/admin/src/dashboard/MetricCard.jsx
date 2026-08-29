import { Card, CardContent } from '../components/ui/card.jsx';
import { barTone } from './format.js';

export function MetricCard({ label, value, percent, sub }) {
  return (
    <Card>
      <CardContent>
        <div className="mb-2 text-[0.76rem] font-medium uppercase tracking-wider text-[var(--text-faint)]">
          {label}
        </div>
        <div className="text-[1.7rem] font-semibold tracking-tight">{value}</div>
        {sub}
        {percent != null && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/30">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${percent}%`, background: barTone(percent) }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
