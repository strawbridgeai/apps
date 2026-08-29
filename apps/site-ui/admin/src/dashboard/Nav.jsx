import { TabList, TabTrigger } from '../components/ui/tabs.jsx';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'apps', label: 'Apps' },
  { id: 'designer', label: 'Site Designer' },
  { id: 'bot', label: 'Trading Bot' },
  { id: 'terminal', label: 'Terminal' },
];

export function Nav({ tab, onChange }) {
  return (
    <TabList className="relative mx-5 mt-[1.1rem] sm:mx-7">
      {TABS.map((t) => (
        <TabTrigger key={t.id} active={tab === t.id} onClick={() => onChange(t.id)}>
          {t.label}
        </TabTrigger>
      ))}
    </TabList>
  );
}
