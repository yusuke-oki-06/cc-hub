import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Badge({
  className,
  tone = 'default',
  ...rest
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: 'default' | 'success' | 'warn' | 'danger' | 'brand';
}) {
  const palette: Record<string, string> = {
    default: 'bg-sand text-charcoal border-ring-warm',
    success: 'bg-[#eaf1df] text-[#4b6a2a] border-[#c9d9ab]',
    warn: 'bg-[#f4ead3] text-[#7a5a12] border-[#e3d196]',
    danger: 'bg-[#f3d7d7] text-error-crimson border-[#e0a9a9]',
    brand: 'bg-[#f6e0d5] text-terracotta border-[#e4b89a]',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-[1px] font-sans text-[11px] tracking-[0.12px] font-medium',
        palette[tone],
        className,
      )}
      {...rest}
    />
  );
}
