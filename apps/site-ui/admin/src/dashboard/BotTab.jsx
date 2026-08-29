import { Card, CardContent } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { TerminalPane } from './Terminal.jsx';
import { useBotStatus } from './hooks.js';
import { fmtSince } from './format.js';

const STATUS_TEXT = { active: 'Running', failed: 'Failed' };
const STATUS_TONE = { active: 'var(--good)', failed: 'var(--bad)' };

export function BotTab({ active }) {
  const [status, runCommand] = useBotStatus();
  return (
    <div>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent>
            <div className="mb-2 text-[0.76rem] font-medium uppercase tracking-wider text-[var(--text-faint)]">
              Status
            </div>
            <div
              className="text-[1.7rem] font-semibold tracking-tight"
              style={{ color: status ? STATUS_TONE[status.active] || 'var(--text-dim)' : undefined }}
            >
              {status ? STATUS_TEXT[status.active] || 'Stopped' : '–'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="mb-2 text-[0.76rem] font-medium uppercase tracking-wider text-[var(--text-faint)]">
              Running since
            </div>
            <div className="text-[1.05rem] font-semibold">
              {status?.active === 'active' ? fmtSince(status.since) : '–'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="mb-2 text-[0.76rem] font-medium uppercase tracking-wider text-[var(--text-faint)]">
              Controls
            </div>
            <div className="mt-1 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => runCommand('start')}>
                Start
              </Button>
              <Button variant="outline" size="sm" onClick={() => runCommand('stop')}>
                Stop
              </Button>
              <Button variant="outline" size="sm" onClick={() => runCommand('restart')}>
                Restart
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="mb-2 flex items-center gap-2 font-mono text-[0.76rem] text-[var(--text-faint)]">
        <span className="size-[7px] rounded-full bg-[var(--good)]" />
        trading-bot.service &mdash; live log (read-only)
      </div>
      <div className="h-[68vh] rounded-2xl border border-[var(--border)] bg-[var(--panel-solid-2)] p-2.5">
        <TerminalPane wsPath="/bot-logs" interactive={false} active={active} className="h-full" />
      </div>
    </div>
  );
}
