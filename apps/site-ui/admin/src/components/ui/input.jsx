import { cn } from '../../lib/utils.js';

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'w-full rounded-[10px] border border-[var(--border)] bg-[var(--panel-solid-2)] px-3.5 py-2.5 text-[15px] text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(111,174,82,0.18)]',
        className
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }) {
  return <label className={cn('text-[12.5px] text-[var(--text-dim)]', className)} {...props} />;
}
