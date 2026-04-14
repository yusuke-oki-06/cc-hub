'use client';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { cva, type VariantProps } from 'class-variance-authority';

// DESIGN.md に沿った 5 種: primary (Terracotta), sand (secondary), white, dark, ghost
const styles = cva(
  'inline-flex items-center justify-center gap-2 font-sans font-medium transition-[box-shadow,background-color,color] duration-150 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
  {
    variants: {
      variant: {
        primary:
          'bg-terracotta text-ivory hover:bg-[#b5573a] shadow-[0_0_0_1px_#c96442] rounded-card',
        sand:
          'bg-sand text-charcoal hover:bg-[#ddd8c6] shadow-ring rounded-card',
        white:
          'bg-white text-near hover:bg-sand shadow-ring rounded-card',
        dark:
          'bg-near text-silver hover:bg-dark border border-dark rounded-card',
        ghost:
          'bg-transparent text-charcoal hover:bg-sand rounded-card',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof styles> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, ...rest },
  ref,
) {
  return <button ref={ref} className={cn(styles({ variant, size }), className)} {...rest} />;
});
