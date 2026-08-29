import { useState } from 'react';
import { Header } from './Header.jsx';
import { Nav } from './Nav.jsx';
import { OverviewTab } from './OverviewTab.jsx';
import { AppsTab } from './AppsTab.jsx';
import { DesignerTab } from './DesignerTab.jsx';
import { BotTab } from './BotTab.jsx';
import { TerminalTab } from './TerminalTab.jsx';
import { useMetrics, useIdleLogout } from './hooks.js';
import { OrganicGlow } from '../components/OrganicGlow.jsx';
import { Fireflies } from '../components/Fireflies.jsx';

// All four tab sections stay mounted the whole time (toggled with the
// `hidden` attribute, not conditional rendering) so the live terminal
// and bot-log WebSocket connections survive switching tabs — matching
// the original dashboard.html's always-in-DOM `.tab` sections exactly.
export default function DashboardApp() {
  const [tab, setTab] = useState('overview');
  const metrics = useMetrics();
  useIdleLogout();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <OrganicGlow />
      <Fireflies />
      <Header hostname={metrics?.hostname} />
      <Nav tab={tab} onChange={setTab} />
      <main className="relative mx-auto max-w-[1200px] px-5 py-6 pb-10 sm:px-7">
        <section hidden={tab !== 'overview'} className={tab === 'overview' ? 'rise' : ''}>
          <OverviewTab metrics={metrics} />
        </section>
        <section hidden={tab !== 'apps'} className={tab === 'apps' ? 'rise' : ''}>
          <AppsTab />
        </section>
        <section hidden={tab !== 'designer'} className={tab === 'designer' ? 'rise' : ''}>
          <DesignerTab />
        </section>
        <section hidden={tab !== 'bot'} className={tab === 'bot' ? 'rise' : ''}>
          <BotTab active={tab === 'bot'} />
        </section>
        <section hidden={tab !== 'terminal'} className={tab === 'terminal' ? 'rise' : ''}>
          <TerminalTab active={tab === 'terminal'} />
        </section>
      </main>
    </div>
  );
}
