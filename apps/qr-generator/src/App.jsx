import { useState } from 'react';
import { Link2, Wifi } from 'lucide-react';
import ShimmerText from './components/ShimmerText.jsx';
import { TabList, TabTrigger } from './components/ui/Tabs.jsx';
import LinkPanel from './components/LinkPanel.jsx';
import WifiPanel from './components/WifiPanel.jsx';

export default function App() {
  const [mode, setMode] = useState('link');

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <a
            href="/"
            title="Back to all apps"
            className="home-btn"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9.5 12 3l9 6.5"></path>
              <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"></path>
            </svg>
          </a>
          <ShimmerText text="QR Studio" className="text-lg sm:text-xl" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <p className="mb-8 max-w-xl text-[var(--text-dim)]">
          Turn a link into a scannable code, or build one guests can scan to join your Wi-Fi
          instantly — no typing, no app, nothing leaves your browser.
        </p>

        <TabList className="mb-8">
          <TabTrigger active={mode === 'link'} layoutId="qr-mode" onClick={() => setMode('link')}>
            <Link2 className="size-4" /> Link / Text
          </TabTrigger>
          <TabTrigger active={mode === 'wifi'} layoutId="qr-mode" onClick={() => setMode('wifi')}>
            <Wifi className="size-4" /> Wi-Fi
          </TabTrigger>
        </TabList>

        <div className="rounded-2xl border border-[var(--border)] bg-white/60 p-6 shadow-sm backdrop-blur sm:p-8">
          {mode === 'link' ? <LinkPanel /> : <WifiPanel />}
        </div>
      </main>
    </div>
  );
}
