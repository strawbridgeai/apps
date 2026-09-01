// Lightweight stand-in for shadcn's usual clsx+tailwind-merge `cn` helper —
// plain concatenation is enough for how these components stack classes.
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
