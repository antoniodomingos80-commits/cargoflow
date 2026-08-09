import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand-500 text-white hover:bg-brand-600',
        secondary: 'bg-navy-600 text-white hover:bg-navy-700',
        outline: 'border border-slate-300 bg-white text-navy-600 hover:bg-slate-50',
        ghost: 'text-navy-600 hover:bg-slate-100',
        accent: 'bg-accent-500 text-white hover:bg-accent-600',
        danger: 'bg-red-600 text-white hover:bg-red-700',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-5 text-sm',
        lg: 'h-12 px-7 text-base',
        icon: 'h-10 w-10',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

/**
 * Classes do botão, para aplicar a um elemento que não é um `<button>`.
 *
 * Uma ligação de navegação deve ser um `<a>`, não um botão — leitores de ecrã
 * anunciam-nos de forma diferente e só o `<a>` permite abrir noutro separador.
 * Isto dá-lhe o aspeto de botão sem lhe roubar a semântica.
 */
export function classesBotao(
  opcoes: VariantProps<typeof buttonVariants> = {},
  extra?: string,
) {
  return cn(buttonVariants(opcoes), extra);
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
