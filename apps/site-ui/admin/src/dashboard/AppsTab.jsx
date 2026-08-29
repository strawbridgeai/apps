import { Card, CardContent } from '../components/ui/card.jsx';
import { StatusBadge } from '../components/ui/badge.jsx';
import { useApps } from './hooks.js';

const STATUS_LABEL = { live: 'Live', 'in-progress': 'In progress', 'not-published': 'Not published' };

export function AppsTab() {
  const apps = useApps();
  return (
    <div>
      <h2 className="mb-4 text-[0.82rem] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
        Published &amp; in-progress apps
      </h2>
      {apps && apps.length === 0 && (
        <p className="text-sm text-[var(--text-dim)]">No apps found in /root/apps/apps yet.</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(apps || []).map((a) => (
          <Card
            key={a.displayName}
            className="shine overflow-hidden transition-transform duration-150 hover:-translate-y-0.5"
          >
            <CardContent>
              <div className="mb-1 font-semibold">{a.displayName}</div>
              <p className="mb-3 min-h-[1.2em] text-sm text-[var(--text-dim)]">{a.description}</p>
              <StatusBadge status={a.status} label={STATUS_LABEL[a.status] || a.status} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
