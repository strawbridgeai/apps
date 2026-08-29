import { TerminalPane } from './Terminal.jsx';
import { MemorySidebar } from './MemorySidebar.jsx';

export function TerminalTab({ active }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 font-mono text-[0.76rem] text-[var(--text-faint)]">
        <span className="size-[7px] rounded-full bg-[var(--good)]" />
        root@vps &mdash; live shell
      </div>
      <div className="flex flex-col items-stretch gap-4 lg:flex-row">
        <div className="min-w-0 flex-1 rounded-2xl border border-[var(--border)] bg-[var(--panel-solid-2)] p-2.5">
          <TerminalPane wsPath="/terminal" interactive active={active} className="h-[400px]" />
        </div>
        <MemorySidebar active={active} className="h-[400px]" />
      </div>
    </div>
  );
}
