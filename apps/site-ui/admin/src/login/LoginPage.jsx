import { useState } from 'react';
import { Input, Label } from '../components/ui/input.jsx';
import { Button } from '../components/ui/button.jsx';
import { Fireflies } from '../components/Fireflies.jsx';

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]">
    <path d="M3 9.5 12 3l9 6.5" />
    <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
  </svg>
);

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, totp }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'login failed');
        setBusy(false);
        return;
      }
      window.location.href = '/';
    } catch {
      setError('network error');
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <a
        href="https://strawbridgeai.com/"
        title="Back to home"
        className="fixed left-5 top-5 flex size-9 items-center justify-center rounded-[9px] border border-[var(--border)] bg-[var(--panel-solid-2)] text-[var(--text-dim)] outline-none transition-colors hover:border-[var(--accent)] hover:bg-[rgba(111,174,82,0.14)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
      >
        <HomeIcon />
      </a>
      <div
        className="glow absolute left-1/2 top-[20%] size-[380px] -translate-x-[70%] -translate-y-1/2 rounded-full opacity-[0.16] blur-[100px]"
        style={{ background: 'var(--gold)' }}
      />
      <div
        className="glow absolute left-1/2 top-[60%] size-[340px] translate-x-[40%] -translate-y-1/2 rounded-full opacity-[0.14] blur-[100px]"
        style={{ background: 'var(--accent)' }}
      />
      <Fireflies />
      <div className="relative w-full max-w-[380px]">
        <div className="mb-[34px] flex items-center justify-center">
          <span className="wordmark text-[22px]">StrawbridgeAI</span>
        </div>
        <form onSubmit={onSubmit} className="glass flex flex-col gap-4 rounded-[20px] p-[34px_30px]">
          <div>
            <h1 className="serif m-0 text-[26px] font-normal">Sign in to Dashboard</h1>
            <p className="m-0 mt-1 text-[13px] text-[var(--text-dim)]">VPS control panel &mdash; restricted access</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="totp">Authenticator code</Label>
            <Input
              id="totp"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="000000"
              required
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>
          <div className="min-h-[1em] text-[12.5px] text-[var(--danger)]">{error}</div>
          <Button type="submit" disabled={busy} className="mt-1 h-11 w-full rounded-[10px]">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <footer className="mt-[22px] text-center text-[11.5px] text-[var(--text-faint)]">
          StrawbridgeAI Dashboard
        </footer>
      </div>
    </div>
  );
}
