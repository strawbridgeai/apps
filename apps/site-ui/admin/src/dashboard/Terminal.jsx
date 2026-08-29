import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { xtermTheme } from './xtermTheme.js';

function shellQuote(p) {
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

async function uploadFiles(files) {
  const formData = new FormData();
  for (const file of files) formData.append('files', file);
  const res = await fetch('/api/terminal-upload', { method: 'POST', body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `upload failed (${res.status})`);
  }
  return res.json();
}

/**
 * Wraps xterm.js + a WebSocket, matching the original dashboard.html
 * wire protocol exactly: {type:'resize',cols,rows} on open/resize,
 * {type:'input',data} per keystroke (interactive only), raw text
 * frames written straight to the terminal. Lazy-connects the first
 * time `active` goes true, then stays connected across tab switches
 * (same as the original's termStarted/botTermStarted flags) — this is
 * a live shell/log, not something to tear down when you look away.
 *
 * Drag-and-drop file upload (interactive terminals only) lives here in
 * the component rather than as a standalone script injected into
 * public/, so it can't get silently dropped by the next `vite build`
 * overwriting dashboard.html's script tags.
 */
export function TerminalPane({ wsPath, interactive, active, className }) {
  const containerRef = useRef(null);
  const stateRef = useRef({ started: false, term: null, fit: null, socket: null });
  const [dragActive, setDragActive] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    if (!active || stateRef.current.started) return;
    stateRef.current.started = true;

    const term = new XTerm({
      cursorBlink: interactive,
      disableStdin: !interactive,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      theme: xtermTheme,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${proto}://${window.location.host}${wsPath}`);
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    });
    socket.addEventListener('message', (ev) => term.write(ev.data));
    socket.addEventListener('close', () => term.write('\r\n\x1b[31m[connection closed]\x1b[0m\r\n'));
    if (interactive) {
      term.onData((data) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'input', data }));
      });
    }

    stateRef.current = { started: true, term, fit, socket };
  }, [active, wsPath, interactive]);

  useEffect(() => {
    const { fit, term, socket } = stateRef.current;
    if (active && fit) fit.fit();
    const onResize = () => {
      if (!active || !fit) return;
      fit.fit();
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [active]);

  function showToast(message, isError) {
    clearTimeout(toastTimerRef.current);
    setToast({ message, isError });
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  }

  function onDragOver(e) {
    if (!interactive) return;
    e.preventDefault();
    setDragActive(true);
  }

  function onDragLeave(e) {
    if (!interactive) return;
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragActive(false);
  }

  async function onDrop(e) {
    if (!interactive) return;
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    try {
      const { paths } = await uploadFiles(files);
      stateRef.current.term?.paste(paths.map(shellQuote).join(' '));
      showToast(`Uploaded ${paths.length} file${paths.length === 1 ? '' : 's'} to /root/dashboard/uploads`);
    } catch (err) {
      showToast(err.message || 'upload failed', true);
    }
  }

  return (
    <div
      className={`relative min-h-0 ${className || ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        ref={containerRef}
        className={`h-full w-full rounded-lg transition-colors ${
          dragActive ? 'outline outline-2 outline-dashed outline-[var(--gold)] outline-offset-[-2px] bg-[var(--gold)]/[0.08]' : ''
        }`}
      />
      {toast && (
        <div
          className={`pointer-events-none absolute bottom-3 right-3 max-w-[22rem] rounded-lg border px-3.5 py-2 text-[0.8rem] font-medium shadow-[var(--glass-shadow)] backdrop-blur-md ${
            toast.isError
              ? 'border-[var(--bad)] text-[var(--bad)] bg-[var(--panel-solid)]'
              : 'border-[var(--border)] text-[var(--text)] bg-[var(--panel-solid)]'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
