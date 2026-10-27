"use client";

import { useActionState, useEffect } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { SettingsState } from "./actions";

/** A settings card: title, description, fields, and a Save button that shows a toast. */
export function SectionForm({
  id,
  title,
  description,
  action,
  saveLabel = "Save",
  children,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  action: (prev: SettingsState, formData: FormData) => Promise<SettingsState>;
  saveLabel?: string;
  /** Gets the field errors and, after a failed save, what was typed (to put back in the fields). */
  children: (errors: Record<string, string>, typed: Record<string, string>) => React.ReactNode;
}) {
  // `version` changes after every save, which rebuilds the form so the
  // fields show either the saved values or (after an error) what was typed.
  const [state, formAction, saving] = useActionState<SettingsState & { version?: number; typed?: Record<string, string> }, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      const typed = result.ok ? {} : (Object.fromEntries([...formData].filter(([k]) => !k.startsWith("$"))) as Record<string, string>);
      return { ...result, typed, version: (prev.version ?? 0) + 1 };
    },
    {},
  );

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (state.message) toast.error(state.message);
  }, [state]);

  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border bg-card shadow-soft" aria-labelledby={`${id}-title`}>
      <form action={formAction} noValidate key={state.version ?? 0}>
        <div className="border-b px-5 py-4">
          <h2 id={`${id}-title`} className="font-heading text-lg font-semibold">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="grid gap-5 px-5 py-5">{children(state.errors ?? {}, state.typed ?? {})}</div>
        <div className="flex justify-end border-t px-5 py-3">
          <Button type="submit" disabled={saving}>
            {saving && <Loader2Icon className="animate-spin" />}
            {saveLabel}
          </Button>
        </div>
      </form>
    </section>
  );
}

/** One labeled input with an optional hint and an error message. */
export function SettingField({
  name,
  label,
  hint,
  error,
  className,
  suffix,
  ...input
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  suffix?: string;
} & React.ComponentProps<"input">) {
  const id = `setting-${name}`;
  return (
    <div className={cn("grid content-start gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? `${id}-help` : undefined}
          className={cn("h-10", suffix && "pr-16")}
          {...input}
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {(error || hint) && (
        <p id={`${id}-help`} className={cn("text-xs", error ? "font-medium text-destructive" : "text-muted-foreground")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
