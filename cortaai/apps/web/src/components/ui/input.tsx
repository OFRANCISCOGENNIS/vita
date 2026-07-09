"use client";

import { forwardRef, useId, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, error, hint, id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-zinc-300">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={cn(
          "h-10 w-full rounded-xl border bg-surface-2 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
          error ? "border-rose-500/60" : "border-line hover:border-zinc-600",
          className,
        )}
        {...props}
      />
      {hint && !error && <p className="mt-1.5 text-xs text-zinc-500">{hint}</p>}
      {error && (
        <p id={`${inputId}-error`} className="mt-1.5 text-xs text-rose-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, label, id, children, ...props },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-zinc-300">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          "h-10 w-full cursor-pointer rounded-xl border border-line bg-surface-2 px-3 text-sm text-zinc-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 hover:border-zinc-600",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  );
});
