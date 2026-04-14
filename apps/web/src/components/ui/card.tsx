import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

// Ivory surface + Border Cream + whisper shadow (DESIGN.md Level 3)
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-card border border-border-cream bg-ivory p-6 shadow-whisper',
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 flex items-center justify-between', className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('font-serif text-feature text-near', className)}
      {...rest}
    />
  );
}
