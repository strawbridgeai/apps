import { MetricCard } from './MetricCard.jsx';
import { fmtBytes, fmtUptime } from './format.js';

export function OverviewTab({ metrics: m }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard label="CPU" value={m ? m.cpu.percent.toFixed(1) + '%' : '–'} percent={m?.cpu.percent} />
      <MetricCard
        label="Memory"
        value={m ? `${fmtBytes(m.mem.used)} / ${fmtBytes(m.mem.total)}` : '–'}
        percent={m?.mem.percent}
      />
      {m?.disk ? (
        <MetricCard
          label="Disk"
          value={`${fmtBytes(m.disk.used)} / ${fmtBytes(m.disk.total)}`}
          percent={m.disk.percent}
        />
      ) : (
        <MetricCard label="Disk" value="–" />
      )}
      <MetricCard label="Uptime" value={m ? fmtUptime(m.uptimeSeconds) : '–'} />
    </div>
  );
}
