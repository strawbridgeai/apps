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
      // toCanvas writes QR_OPTS.width as an inline style.width/height, which
      // outranks the responsive classes below and pinned the display size to
      // 320px — wider than its own card on a narrow phone. Clearing the inline
      // pair hands sizing back to CSS; the 320x320 bitmap is untouched, so PNG
      // exports keep their resolution.
      canvas.style.removeProperty('width');
      canvas.style.removeProperty('height');
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
    <div className="flex min-w-0 flex-col items-center gap-4">
      <div className="relative max-w-full rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--card-shadow)]">
        {/* width/height stay at 320 so the exported bitmap keeps its
            resolution; the CSS size is what shrinks. Without the cap the
            canvas laid out at a fixed 320px + padding and pushed the whole
            page off-screen on a 390px phone. */}
        <canvas
          ref={canvasRef}
          width={320}
          height={320}
          className={cn('block h-auto w-full min-w-0 max-w-[320px] rounded-lg', !ready && 'opacity-0')}
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
