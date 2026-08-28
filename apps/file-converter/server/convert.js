const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 60_000, maxBuffer: 8 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${stderr || err.message}`));
      else resolve({ stdout, stderr });
    });
  });
}

// ---------- audio (ffmpeg) ----------
const AUDIO_CODEC = {
  mp3: ['-c:a', 'libmp3lame', '-b:a', '192k'],
  wav: ['-c:a', 'pcm_s16le'],
  m4a: ['-c:a', 'aac', '-b:a', '192k'],
  aac: ['-c:a', 'aac', '-b:a', '192k'],
  ogg: ['-c:a', 'libvorbis', '-q:a', '5'],
  flac: ['-c:a', 'flac'],
};

async function convertAudio(inputPath, outputPath, targetExt) {
  const codecArgs = AUDIO_CODEC[targetExt];
  if (!codecArgs) throw new Error(`Unsupported audio target: ${targetExt}`);
  await run('ffmpeg', [
    '-y', '-nostdin', '-threads', '1',
    '-i', inputPath,
    '-vn', ...codecArgs,
    '-t', '3600',
    outputPath,
  ]);
}

// ---------- image (ImageMagick + pdf-lib) ----------
const RASTER_TARGETS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff']);

async function decodeHeicToPng(inputPath, workDir) {
  const out = path.join(workDir, 'heic-decoded.png');
  await run('heif-convert', [inputPath, out], { timeout: 30_000 });
  return out;
}

async function convertImage(inputPath, outputPath, targetExt, workDir, sourceExt) {
  let src = inputPath;
  if (sourceExt === 'heic' || sourceExt === 'heif') {
    src = await decodeHeicToPng(inputPath, workDir);
  }

  if (targetExt === 'pdf') {
    await imageToPdf(src, outputPath, workDir);
    return;
  }

  if (!RASTER_TARGETS.has(targetExt)) throw new Error(`Unsupported image target: ${targetExt}`);
  await run('convert', [
    '-limit', 'memory', '256MiB',
    '-limit', 'map', '256MiB',
    '-limit', 'time', '30',
    src,
    outputPath,
  ], { timeout: 30_000 });
}

async function imageToPdf(src, outputPath, workDir) {
  // pdf-lib only embeds PNG/JPEG directly; anything else gets normalized to
  // PNG via ImageMagick first (still going through our locked-down policy —
  // no Ghostscript/PDF coder involved, IM never touches PDF at all).
  const ext = path.extname(src).toLowerCase();
  let pngOrJpg = src;
  if (ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg') {
    pngOrJpg = path.join(workDir, 'normalized.png');
    await run('convert', [
      '-limit', 'memory', '256MiB',
      '-limit', 'time', '30',
      src,
      pngOrJpg,
    ], { timeout: 30_000 });
  }

  const bytes = fs.readFileSync(pngOrJpg);
  const pdfDoc = await PDFDocument.create();
  const isJpg = pngOrJpg.toLowerCase().endsWith('.jpg') || pngOrJpg.toLowerCase().endsWith('.jpeg');
  const image = isJpg ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);

  // Fit to a max page dimension so a giant photo doesn't become a page the
  // size of a billboard; keep aspect ratio.
  const MAX_DIM = 1000;
  const scale = Math.min(1, MAX_DIM / Math.max(image.width, image.height));
  const w = image.width * scale;
  const h = image.height * scale;

  const page = pdfDoc.addPage([w, h]);
  page.drawImage(image, { x: 0, y: 0, width: w, height: h });
  fs.writeFileSync(outputPath, await pdfDoc.save());
}

// ---------- documents (LibreOffice headless) ----------
async function convertDocument(inputPath, outputDir, targetExt, profileDir) {
  fs.mkdirSync(profileDir, { recursive: true });
  await run('soffice', [
    `-env:UserInstallation=file://${profileDir}`,
    '--headless',
    '--norestore',
    '--convert-to', targetExt,
    '--outdir', outputDir,
    inputPath,
  ], { timeout: 60_000 });

  const base = path.basename(inputPath, path.extname(inputPath));
  const produced = path.join(outputDir, `${base}.${targetExt}`);
  if (!fs.existsSync(produced)) throw new Error('LibreOffice did not produce an output file');
  return produced;
}

module.exports = { convertAudio, convertImage, convertDocument };
