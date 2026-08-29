import { LockKeyhole } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-5 sm:px-12">
      <span
        data-designer-id="header.wordmark"
        className="wordmark"
        style={{ fontFamily: 'var(--wordmark-font)', fontSize: 'var(--wordmark-size)' }}
      >
        StrawbridgeAI
      </span>
      <a
        href="https://admin.strawbridgeai.com/"
        className="glass flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[var(--text-dim)] transition-colors hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-2)]"
      >
        <LockKeyhole className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Admin</span>
      </a>
    </header>
  );
}
