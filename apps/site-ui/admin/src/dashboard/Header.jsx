import { Button } from '../components/ui/button.jsx';

export function Header({ hostname }) {
  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
  }

  return (
    <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-[1.1rem] backdrop-blur-sm sm:px-7">
      <div className="leading-tight">
        <div className="wordmark text-[1.05rem]">StrawbridgeAI</div>
        <div className="text-[0.72rem] text-[var(--text-faint)]">Dashboard</div>
      </div>
      <div className="flex items-center gap-4">
        {hostname && (
          <span className="font-mono text-[0.8rem] text-[var(--text-faint)]">{hostname}</span>
        )}
        <Button as="a" href="https://strawbridgeai.com/" variant="outline" size="sm">
          Home
        </Button>
        <Button variant="outline" size="sm" onClick={logout}>
          Log out
        </Button>
      </div>
    </header>
  );
}
