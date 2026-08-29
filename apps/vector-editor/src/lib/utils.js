// Lightweight stand-in for shadcn's usual clsx+tailwind-merge `cn` helper —
// plain concatenation is enough for how these components stack classes.
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

let counter = 0;
export function uid(prefix = 'obj') {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
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

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
