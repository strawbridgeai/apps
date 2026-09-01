import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download } from 'lucide-react';
import { cn, downloadBlob } from '../lib/utils.js';

const QR_OPTS = {
  errorCorrectionLevel: 'M',
  margin: 2,
  width: 320,
  color: { dark: '#1b2a18', light: '#ffffff' },
};

export default function QrPreview({ value, filename, emptyHint }) {
  const canvasRef = useRef(null);
  const [svgMarkup, setSvgMarkup] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!value) {
      setSvgMarkup('');
      setError('');
      const ctx = canvas?.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    let cancelled = false;

    QRCode.toCanvas(canvas, value, QR_OPTS, (err) => {
      if (cancelled) return;
      setError(err ? err.message : '');
    });

    QRCode.toString(value, { ...QR_OPTS, type: 'svg' }, (err, svg) => {
      if (cancelled || err) return;
      setSvgMarkup(svg);
    });

    return () => {
      cancelled = true;
    };
  }, [value]);

  const downloadPng = () => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${filename}.png`);
    });
  };

  const downloadSvg = () => {
    if (!svgMarkup) return;
    downloadBlob(new Blob([svgMarkup], { type: 'image/svg+xml' }), `${filename}.svg`);
  };

  const ready = Boolean(value) && !error;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--card-shadow)]">
        <canvas
          ref={canvasRef}
          width={320}
          height={320}
          className={cn('block rounded-lg', !ready && 'opacity-0')}
        />
        {!ready && !error && (
          <div className="absolute inset-4 flex items-center justify-center px-6 text-center text-sm text-[var(--text-faint)]">
            {emptyHint}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-[var(--danger)]">Couldn't generate a QR code: {error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={downloadPng} disabled={!ready} className="btn btn-primary">
          <Download className="size-4" /> PNG
        </button>
        <button type="button" onClick={downloadSvg} disabled={!ready || !svgMarkup} className="btn btn-secondary">
          <Download className="size-4" /> SVG
        </button>
      </div>
    </div>
  );
}
