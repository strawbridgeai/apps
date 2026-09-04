import { PDFDocument } from 'pdf-lib';

// Images become real one-page PDFs before they enter the app, so everything
// downstream — thumbnails, reordering, rotation, annotations, extraction,
// export — treats them as ordinary pages with no special-casing anywhere.
const LETTER_SHORT = 612;
const LETTER_LONG = 792;
const MARGIN = 18;

export function isImageFile(file) {
  return file.type.startsWith('image/');
}

// pdf-lib can only embed JPEG and PNG directly. Anything else (WebP, GIF,
// BMP, AVIF…) is decoded by the browser itself and re-encoded as PNG, which
// also means an unsupported or corrupt image fails here rather than producing
// a broken page.
function reencodeToPng(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('could not encode image'));
          return;
        }
        blob.arrayBuffer().then(resolve, reject);
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unsupported or corrupt image'));
    };
    img.src = url;
  });
}

async function embedImage(pdfDoc, file, bytes) {
  if (file.type === 'image/jpeg' || file.type === 'image/jpg') return pdfDoc.embedJpg(bytes);
  if (file.type === 'image/png') return pdfDoc.embedPng(bytes);
  return pdfDoc.embedPng(await reencodeToPng(file));
}

export async function imageToPdfBytes(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdfDoc = await PDFDocument.create();
  const image = await embedImage(pdfDoc, file, bytes);

  // Page orientation follows the image, so a landscape photo isn't letterboxed
  // into a portrait page. Sizing to a real paper size rather than the image's
  // own pixel dimensions keeps the result printable — a 4000px-wide photo
  // would otherwise become a 55-inch page.
  const landscape = image.width > image.height;
  const pageWidth = landscape ? LETTER_LONG : LETTER_SHORT;
  const pageHeight = landscape ? LETTER_SHORT : LETTER_LONG;
  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  const scale = Math.min(
    (pageWidth - MARGIN * 2) / image.width,
    (pageHeight - MARGIN * 2) / image.height
  );
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  });

  return pdfDoc.save();
}
