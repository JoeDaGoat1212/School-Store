"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/*
 * Big, phone-friendly form pieces used by checkout and the rewards account.
 */

export function TextField({
  id,
  label,
  error,
  autoComplete,
  value,
  onChange,
}: {
  id: string;
  label: string;
  error?: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        maxLength={40}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-12 text-base"
      />
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** A labeled row of big tappable radio buttons. */
export function ChoiceGroup({
  label,
  error,
  grid,
  children,
}: {
  label: string;
  error?: string;
  grid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className={cn(grid ? "grid grid-cols-2 gap-2 sm:grid-cols-4" : "flex flex-wrap gap-2")}>{children}</div>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}

/** One radio button styled as a big chip. Works with the keyboard like a normal radio. */
export function Choice({
  name,
  value,
  checked,
  disabled,
  onChange,
  className,
  children,
}: {
  name: string;
  value: string;
  checked?: boolean;
  disabled?: boolean;
  onChange?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("relative", disabled ? "cursor-not-allowed" : "cursor-pointer", className)}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        className={cn(
          "flex min-h-12 flex-col justify-center rounded-xl border-2 bg-card px-4 py-2 text-sm font-semibold transition-colors",
          "peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground",
          "peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
          "peer-disabled:border-dashed peer-disabled:bg-transparent peer-disabled:text-muted-foreground",
          !disabled && "hover:border-primary/50",
        )}
      >
        {children}
      </span>
    </label>
  );
}
