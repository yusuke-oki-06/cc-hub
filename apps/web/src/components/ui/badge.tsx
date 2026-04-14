import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Badge({
  className,
  tone = 'default',
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: 'default' | 'success' | 'warn' | 'danger' }) {
  const palette = {
    default: 'bg-slate-800 text-slate-200',
    success: 'bg-emerald-500/15 text-emerald-300 border-emerald-700/40',
    warn: 'bg-amber-500/15 text-amber-300 border-amber-700/40',
    danger: 'bg-red-500/15 text-red-300 border-red-700/40',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-[11px] font-medium',
        palette[tone],
        className,
      )}
      {...rest}
    />
  );
}
