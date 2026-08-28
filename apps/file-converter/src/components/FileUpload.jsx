/**
 * Adapted from Kokonut UI's File Upload (https://kokonutui.com), MIT
 * licensed. Original: @dorianbaffier, github.com/kokonut-labs/kokonutui.
 * Converted from TypeScript to plain JSX for this vanilla-JS/Vite app —
 * behavior otherwise unchanged, except uploadDelay defaults to 0 here
 * (this app has no real "upload" step; picking a file just enables the
 * existing Convert button below), and the illustration/progress SVGs are
 * dropped in favor of a plain UploadCloud icon to keep this addition small.
 */
import { UploadCloud, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils.js';

const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024; // matches the backend's 100MB cap

const formatBytes = (bytes, decimals = 1) => {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(decimals))} ${sizes[i] || sizes[sizes.length - 1]}`;
};

export default function FileUpload({
  onUploadSuccess = () => {},
  onUploadError = () => {},
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  onFileRemove = () => {},
  uploadDelay = 0,
  validateFile = () => null,
  acceptAttr = '',
  hintText = '',
  className,
}) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | dragging | uploading | error
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleError = useCallback(
    (err) => {
      setError(err);
      setStatus('error');
      onUploadError?.(err);
      timerRef.current = setTimeout(() => {
        setError(null);
        setStatus('idle');
      }, 3000);
    },
    [onUploadError]
  );

  const handleFileSelect = useCallback(
    (selected) => {
      if (!selected) return;
      setError(null);

      if (selected.size > maxFileSize) {
        handleError({ message: `File size exceeds ${formatBytes(maxFileSize)}` });
        return;
      }
      const customError = validateFile(selected);
      if (customError) {
        handleError(customError);
        return;
      }

      setFile(selected);
      if (uploadDelay > 0) {
        setStatus('uploading');
        timerRef.current = setTimeout(() => {
          setStatus('idle');
          onUploadSuccess(selected);
        }, uploadDelay);
      } else {
        onUploadSuccess(selected);
      }
    },
    [maxFileSize, validateFile, handleError, uploadDelay, onUploadSuccess]
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setStatus((prev) => (prev !== 'uploading' ? 'dragging' : prev));
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setStatus((prev) => (prev === 'dragging' ? 'idle' : prev));
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (status === 'uploading') return;
      setStatus('idle');
      const dropped = e.dataTransfer.files?.[0];
      if (dropped) handleFileSelect(dropped);
    },
    [status, handleFileSelect]
  );

  const triggerFileInput = useCallback(() => {
    if (status === 'uploading') return;
    fileInputRef.current?.click();
  }, [status]);

  const resetState = useCallback(() => {
    setFile(null);
    setStatus('idle');
    onFileRemove();
  }, [onFileRemove]);

  return (
    <div className={cn('relative mx-auto w-full', className || '')}>
      <div className="group relative w-full rounded-xl bg-white p-0.5 ring-1 ring-gray-200">
        <div className="absolute inset-x-0 -top-px h-px w-full bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
        <div className="relative w-full rounded-[10px] bg-gray-50/50 p-1.5">
          <div className={cn('relative mx-auto w-full overflow-hidden rounded-lg border border-gray-100 bg-white', error ? 'border-red-500/50' : '')}>
            <div className={cn('absolute inset-0 transition-opacity duration-300', status === 'dragging' ? 'opacity-100' : 'opacity-0')}>
              <div className="absolute inset-[10%] animate-pulse rounded-lg bg-blue-500/5" />
            </div>

            <div className="relative min-h-[160px]">
              <AnimatePresence mode="wait">
                {file && status !== 'error' ? (
                  <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    className="flex min-h-[160px] flex-col items-center justify-center gap-3 p-6"
                    exit={{ opacity: 0, y: -10 }}
                    initial={{ opacity: 0, y: 10 }}
                    key="picked"
                  >
                    <UploadCloud className="h-8 w-8 text-blue-500" />
                    <div className="space-y-1 text-center">
                      <h3 className="max-w-[220px] truncate font-semibold text-gray-900 text-sm">{file.name}</h3>
                      <p className="text-gray-500 text-xs">{formatBytes(file.size)}</p>
                    </div>
                    <button
                      className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 font-medium text-gray-700 text-xs transition-colors hover:bg-gray-200"
                      onClick={resetState}
                      type="button"
                    >
                      <X className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    animate={{ opacity: status === 'dragging' ? 0.8 : 1, y: 0, scale: status === 'dragging' ? 0.98 : 1 }}
                    className="flex min-h-[160px] flex-col items-center justify-center p-6"
                    exit={{ opacity: 0, y: -10 }}
                    initial={{ opacity: 0, y: 10 }}
                    key="dropzone"
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    transition={{ duration: 0.2 }}
                  >
                    <UploadCloud className="mb-3 h-8 w-8 text-gray-400" />
                    <h3 className="mb-1 font-semibold text-gray-900 text-sm">Drag and drop or</h3>
                    <p className="mb-3 text-gray-500 text-xs">{hintText}</p>
                    <button
                      className="group flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 font-semibold text-gray-900 text-sm transition-colors hover:bg-gray-200"
                      onClick={triggerFileInput}
                      type="button"
                    >
                      <span>Choose File</span>
                      <UploadCloud className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                    </button>
                    <input accept={acceptAttr} className="sr-only" onChange={(e) => handleFileSelect(e.target.files?.[0] || null)} ref={fileInputRef} type="file" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 transform rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2"
                  exit={{ opacity: 0, y: -10 }}
                  initial={{ opacity: 0, y: 10 }}
                >
                  <p className="text-red-500 text-xs">{error.message}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
