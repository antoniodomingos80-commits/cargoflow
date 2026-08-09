import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const generatedId = React.useId();
    const areaId = id ?? generatedId;
    const errorId = `${areaId}-erro`;
    const hintId = `${areaId}-ajuda`;

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={areaId} className="block text-sm font-medium text-navy-600">
            {label}
            {props.required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={areaId}
          rows={props.rows ?? 3}
          aria-invalid={!!error}
          aria-describedby={cn(error && errorId, hint && hintId) || undefined}
          className={cn(
            'w-full resize-y rounded-lg border bg-white px-3.5 py-2.5 text-sm text-navy-700',
            'placeholder:text-slate-400',
            'focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500',
            error ? 'border-red-400' : 'border-slate-300',
            className,
          )}
          {...props}
        />
        {hint && !error && (
          <p id={hintId} className="text-xs text-slate-500">{hint}</p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';
