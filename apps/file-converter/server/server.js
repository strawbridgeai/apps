// file-converter backend. Public, unauthenticated by design (matches the
// rest of the apps on this landing page) — so every conversion runs through
// hardened, unprivileged tooling: this process runs as the `fileconv`
// system user (no login, no home), ImageMagick's policy.xml is locked to
// only the raster coders this app uses with no delegates, and LibreOffice's
// `--convert-to` batch mode does not execute embedded macros (a deliberate
// LibreOffice hardening, not something this app configures) — combined with
// an ephemeral per-request profile/temp dir that's deleted immediately
// after the response, and a strict 100MB/1-at-a-time conversion limit so a
// single small VPS core can't be knocked over by concurrent requests.
const path = require('path');
const fs = require('fs');
const https = require('https');
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { convertAudio, convertImage, convertDocument } = require('./convert');

const PORT = 2011;
const TMP_ROOT = '/var/lib/file-converter/tmp';
fs.mkdirSync(TMP_ROOT, { recursive: true });

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB

// ---------- conversion catalog (single source of truth for the API and the frontend) ----------
const AUDIO_TARGETS = [
  { key: 'mp3', label: 'MP3', ext: 'mp3' },
  { key: 'wav', label: 'WAV', ext: 'wav' },
  { key: 'm4a', label: 'M4A (iPhone / AAC)', ext: 'm4a' },
  { key: 'aac', label: 'AAC', ext: 'aac' },
  { key: 'ogg', label: 'OGG (Android)', ext: 'ogg' },
  { key: 'flac', label: 'FLAC', ext: 'flac' },
];
const AUDIO_SOURCE_EXTS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'wma', 'aiff', 'aif'];

const IMAGE_TARGETS = [
  { key: 'png', label: 'PNG', ext: 'png' },
  { key: 'jpg', label: 'JPEG / JPG', ext: 'jpg' },
  { key: 'webp', label: 'WEBP', ext: 'webp' },
  { key: 'gif', label: 'GIF', ext: 'gif' },
  { key: 'bmp', label: 'BMP', ext: 'bmp' },
  { key: 'tiff', label: 'TIFF', ext: 'tiff' },
  { key: 'pdf', label: 'PDF', ext: 'pdf' },
];
const IMAGE_SOURCE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'heic', 'heif'];

const DOC_GROUPS = {
  word: {
    exts: ['doc', 'docx'],
    targets: [
      { key: 'google-docs', label: 'Google Docs (.odt)', ext: 'odt' },
      { key: 'apple-pages', label: 'Apple Pages (.odt)', ext: 'odt' },
      { key: 'pdf', label: 'PDF', ext: 'pdf' },
    ],
  },
  sheet: {
    exts: ['xls', 'xlsx'],
    targets: [
      { key: 'google-sheets', label: 'Google Sheets (.ods)', ext: 'ods' },
      { key: 'apple-numbers', label: 'Apple Numbers (.ods)', ext: 'ods' },
      { key: 'pdf', label: 'PDF', ext: 'pdf' },
    ],
  },
  slide: {
    exts: ['ppt', 'pptx'],
    targets: [
      { key: 'google-slides', label: 'Google Slides (.odp)', ext: 'odp' },
      { key: 'apple-keynote', label: 'Apple Keynote (.odp)', ext: 'odp' },
      { key: 'pdf', label: 'PDF', ext: 'pdf' },
    ],
  },
};
const DOC_SOURCE_EXTS = Object.values(DOC_GROUPS).flatMap((g) => g.exts);

function findDocGroup(ext) {
  return Object.values(DOC_GROUPS).find((g) => g.exts.includes(ext));
}
function targetsFor(category, sourceExt) {
  if (category === 'audio') return AUDIO_TARGETS;
  if (category === 'image') return IMAGE_TARGETS;
  if (category === 'document') return findDocGroup(sourceExt)?.targets || [];
  return [];
}
function sourceExtsFor(category) {
  if (category === 'audio') return AUDIO_SOURCE_EXTS;
  if (category === 'image') return IMAGE_SOURCE_EXTS;
  if (category === 'document') return DOC_SOURCE_EXTS;
  return [];
}

function badRequest(msg) {
  const e = new Error(msg);
  e.statusCode = 400;
  return e;
}

// ---------- app ----------
const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/options', (req, res) => {
  res.json({
    audio: { sourceExts: AUDIO_SOURCE_EXTS, targets: AUDIO_TARGETS },
    image: { sourceExts: IMAGE_SOURCE_EXTS, targets: IMAGE_TARGETS },
    document: {
      sourceExts: DOC_SOURCE_EXTS,
      groups: Object.fromEntries(
        Object.entries(DOC_GROUPS).map(([k, g]) => [k, { exts: g.exts, targets: g.targets }])
      ),
    },
    limits: { maxFileBytes: MAX_FILE_BYTES },
  });
});

const convertLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many conversions from this address — try again in a few minutes.' },
});

// Only one heavy conversion (ffmpeg/soffice/imagemagick) runs at a time —
// this box has a single CPU core, and LibreOffice in particular doesn't
// handle concurrent headless invocations gracefully.
let busy = false;
const queue = [];
function withConversionSlot(fn) {
  return new Promise((resolve, reject) => {
    const task = () =>
      fn()
        .then(resolve, reject)
        .finally(() => {
          busy = false;
          const next = queue.shift();
          if (next) {
            busy = true;
            next();
          }
        });
    if (busy) queue.push(task);
    else {
      busy = true;
      task();
    }
  });
}

function makeWorkDir(req, res, next) {
  req.workDir = fs.mkdtempSync(path.join(TMP_ROOT, 'conv-'));
  next();
}

function cleanup(dir) {
  fs.rm(dir, { recursive: true, force: true }, () => {});
}

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, req.workDir);
    },
    filename(req, file, cb) {
      // sourceExt must arrive in the multipart stream before the file part
      // (the frontend appends it to FormData first) so it's already parsed
      // into req.body by the time multer picks a filename for the file part.
      const ext = (req.body.sourceExt || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      cb(null, `input.${ext || 'bin'}`);
    },
  }),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  // Rejects an invalid/mismatched extension DURING the multipart parse, so
  // an unlisted (or spoofed) extension is never written to disk at all —
  // previously this same check ran one middleware later, in the route
  // handler below, which meant multer had already saved the file as
  // `input.<claimed-ext>` before that later check could reject it. Every
  // source format this app accepts is audio/image/document only (see
  // *_SOURCE_EXTS above), so nothing executable can ever be a valid
  // sourceExt regardless — this closes the write-before-validate gap, it
  // doesn't add a new category of blocked type.
  fileFilter(req, file, cb) {
    const category = req.body.category;
    const sourceExt = (req.body.sourceExt || '').toLowerCase();
    const realExt = path.extname(file.originalname || '').slice(1).toLowerCase();
    if (!['audio', 'image', 'document'].includes(category)) return cb(badRequest('Invalid category.'));
    if (!sourceExtsFor(category).includes(sourceExt)) return cb(badRequest('Source file type is not allowed for this category.'));
    // realExt is trusted only as a cross-check against the client's sourceExt
    // claim, not as an independent allowlist — a bare/odd original filename
    // (no extension, or one multer already can't parse) shouldn't block a
    // correctly-claimed upload, but an explicit mismatch (e.g. claiming
    // "mp3" for a file actually named "shell.php") is rejected outright.
    if (realExt && realExt !== sourceExt) return cb(badRequest('File extension does not match the selected source type.'));
    cb(null, true);
  },
});

app.post(
  '/api/convert',
  convertLimiter,
  makeWorkDir,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        cleanup(req.workDir);
        // fileFilter's badRequest() errors carry their own message and a
        // 400 statusCode - surface those as-is; anything else (multer's own
        // errors, e.g. LIMIT_FILE_SIZE) gets a generic message instead of
        // leaking internal detail.
        const msg = err.statusCode === 400 ? err.message : err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (100MB max).' : 'Upload failed.';
        return res.status(400).json({ error: msg });
      }
      next();
    });
  },
  async (req, res) => {
    const workDir = req.workDir;
    try {
      const { category, target } = req.body;
      const sourceExt = (req.body.sourceExt || '').toLowerCase();

      if (!req.file) throw badRequest('No file uploaded.');
      if (!['audio', 'image', 'document'].includes(category)) throw badRequest('Invalid category.');
      if (!sourceExtsFor(category).includes(sourceExt)) throw badRequest('Source file type is not allowed for this category.');

      const targetDef = targetsFor(category, sourceExt).find((t) => t.key === target);
      if (!targetDef) throw badRequest('Invalid target format for this source file.');

      const inputPath = req.file.path;
      let outputPath;

      await withConversionSlot(async () => {
        if (category === 'audio') {
          outputPath = path.join(workDir, `output.${targetDef.ext}`);
          await convertAudio(inputPath, outputPath, targetDef.ext);
        } else if (category === 'image') {
          outputPath = path.join(workDir, `output.${targetDef.ext}`);
          await convertImage(inputPath, outputPath, targetDef.ext, workDir, sourceExt);
        } else {
          const profileDir = path.join(workDir, 'loprofile');
          outputPath = await convertDocument(inputPath, workDir, targetDef.ext, profileDir);
        }
      });

      res.setHeader('Content-Disposition', `attachment; filename="converted.${targetDef.ext}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.sendFile(outputPath, (err) => {
        cleanup(workDir);
        if (err && !res.headersSent) res.status(500).end();
      });
    } catch (err) {
      cleanup(workDir);
      const status = err.statusCode || 500;
      if (status === 500) console.error(err);
      res.status(status).json({
        error: status === 500 ? 'Conversion failed. The file may be corrupt or unsupported.' : err.message,
      });
    }
  }
);

// Safety net: sweep any temp dirs older than 30 minutes in case a request
// crashed before its own cleanup ran.
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const name of fs.readdirSync(TMP_ROOT)) {
    const p = path.join(TMP_ROOT, name);
    try {
      if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { recursive: true, force: true });
    } catch {
      // already gone
    }
  }
}, 10 * 60 * 1000).unref();

// Populated by a root ExecStartPre in the systemd unit (this process itself
// runs as the unprivileged fileconv user, which can't read Webuzo's
// group-restricted cert files directly).
const certDir = '/var/lib/file-converter/certs';
const server = https.createServer(
  {
    cert: fs.readFileSync(path.join(certDir, 'webuzo.crt')),
    key: fs.readFileSync(path.join(certDir, 'webuzo.key')),
  },
  app
);

// Loopback-only: Apache reverse-proxies strawbridgeai.com/apps/
// file-converter/api/ to 127.0.0.1 here (see the vhost conf), so this
// never needs to accept a connection over the public interface directly.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`file-converter-api listening on https://127.0.0.1:${PORT}`);
});
