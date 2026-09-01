import { useState } from 'react';
import { Link2 } from 'lucide-react';
import QrPreview from './QrPreview.jsx';

export default function LinkPanel() {
  const [text, setText] = useState('');

  return (
    <div className="grid gap-8 md:grid-cols-2 md:items-start">
      <div className="flex flex-col gap-3">
        <label htmlFor="link-input" className="text-sm font-semibold text-[var(--text)]">
          Link or text
        </label>
        <textarea
          id="link-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="https://example.com or any text…"
          rows={5}
          className="field resize-y"
          autoFocus
        />
        <p className="flex items-center gap-1.5 text-xs text-[var(--text-faint)]">
          <Link2 className="size-3.5" />
          Works with any URL or plain text — the code updates as you type.
        </p>
      </div>

      <QrPreview
        value={text.trim()}
        filename="qr-code"
        emptyHint="Your QR code will appear here once you paste a link or type some text."
      />
    </div>
  );
}
