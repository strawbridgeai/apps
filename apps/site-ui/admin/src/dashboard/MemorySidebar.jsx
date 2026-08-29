import { useState } from 'react';
import { useMemory } from './hooks.js';

const BADGE_TONE = {
  user: 'text-[var(--sky)] bg-[rgba(111,179,174,0.14)]',
  feedback: 'text-[var(--gold)] bg-[rgba(224,219,63,0.14)]',
  project: 'text-[var(--good)] bg-[rgba(111,174,82,0.14)]',
  reference: 'text-[var(--clay)] bg-[rgba(201,114,74,0.14)]',
};

function MemoryItem({ entry }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen((o) => !o)}
      className="cursor-pointer rounded-[10px] border border-[var(--border)] bg-black/15 p-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[0.78rem] font-semibold leading-tight">{entry.name}</div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${BADGE_TONE[entry.type] || BADGE_TONE.reference}`}>
          {entry.type}
        </span>
      </div>
      <div className="text-[0.72rem] leading-snug text-[var(--text-faint)]">{entry.description}</div>
      {open && (
        <div className="mt-2 whitespace-pre-wrap border-t border-[var(--border)] pt-2 text-[0.72rem] leading-relaxed text-[var(--text)]">
          {entry.body}
        </div>
      )}
    </div>
  );
}

export function MemorySidebar({ active, className }) {
  const [entries, reload] = useMemory(active);
  return (
    <div className={`flex w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel-solid)] lg:w-[300px] ${className || ''}`}>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5">
        <div>
          <div className="text-[0.82rem] font-semibold">Learned preferences</div>
          <div className="mt-0.5 text-[0.7rem] text-[var(--text-faint)]">Auto-saved by Claude across sessions</div>
        </div>
        <button
          onClick={() => reload()}
          className="rounded-lg border border-[var(--border)] px-2 py-1 text-[0.7rem] text-[var(--text-dim)] outline-none hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
        >
          Refresh
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2.5">
        <div className="flex flex-col gap-2">
          {entries === undefined && <p className="p-2 text-sm text-[var(--text-faint)]">Loading&hellip;</p>}
          {entries === null && (
            <p className="p-2 text-sm text-[var(--text-faint)]">Couldn&rsquo;t load preferences.</p>
          )}
          {entries && entries.length === 0 && (
            <p className="p-2 text-sm text-[var(--text-faint)]">Nothing learned yet.</p>
          )}
          {entries?.map((e) => (
            <MemoryItem key={e.name} entry={e} />
          ))}
        </div>
      </div>
    </div>
  );
}
