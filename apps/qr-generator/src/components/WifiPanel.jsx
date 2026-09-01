import { useState } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Switch } from './ui/Switch.jsx';
import QrPreview from './QrPreview.jsx';
import { buildWifiPayload } from '../lib/wifiPayload.js';

const SECURITY_OPTIONS = [
  { value: 'WPA', label: 'WPA / WPA2 / WPA3' },
  { value: 'WEP', label: 'WEP' },
  { value: 'nopass', label: 'None (open network)' },
];

export default function WifiPanel() {
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [security, setSecurity] = useState('WPA');
  const [hidden, setHidden] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const open = security === 'nopass';
  const canGenerate = ssid.trim().length > 0 && (open || password.length > 0);

  const payload = canGenerate
    ? buildWifiPayload({ ssid: ssid.trim(), password, security, hidden })
    : '';

  return (
    <div className="grid gap-8 md:grid-cols-2 md:items-start">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="wifi-ssid" className="text-sm font-semibold text-[var(--text)]">
            Network name (SSID)
          </label>
          <input
            id="wifi-ssid"
            type="text"
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            placeholder="Home Wi-Fi"
            className="field"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="wifi-security" className="text-sm font-semibold text-[var(--text)]">
            Security
          </label>
          <select
            id="wifi-security"
            value={security}
            onChange={(e) => setSecurity(e.target.value)}
            className="field"
          >
            {SECURITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {!open && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="wifi-password" className="text-sm font-semibold text-[var(--text)]">
              Password
            </label>
            <div className="relative">
              <input
                id="wifi-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Network password"
                className="field pr-11"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                title={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--text-faint)] hover:text-[var(--text)]"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
        )}

        <Switch id="wifi-hidden" checked={hidden} onChange={setHidden} label="Hidden network" />

        <p className="flex items-start gap-1.5 rounded-lg bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-3 text-xs leading-relaxed text-[var(--accent-dim)]">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          Everything happens in your browser — your password is encoded straight into the QR
          image on your device and is never sent anywhere, logged, or stored.
        </p>
      </div>

      <QrPreview
        value={payload}
        filename={`wifi-${ssid.trim() || 'network'}`}
        emptyHint="Enter a network name (and password, if secured) to generate a scannable Wi-Fi code."
      />
    </div>
  );
}
