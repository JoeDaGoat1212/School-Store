"use client";

import { useActionState } from "react";
import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brand } from "@/config/brand";
import { findOrder, type LookupState } from "../actions";

/** Order number + last name → shows the order. */
export function LookupForm({ initialNumber = "" }: { initialNumber?: string }) {
  const [state, formAction, pending] = useActionState<LookupState, FormData>(findOrder, { number: initialNumber });

  return (
    <form action={formAction} className="grid gap-5 rounded-2xl border bg-card p-6 shadow-soft">
      <div className="grid gap-2">
        <Label htmlFor="number">Order number</Label>
        <Input
          id="number"
          name="number"
          // key resets the field to the returned value after a failed attempt
          key={`n-${state.number}`}
          defaultValue={state.number}
          placeholder={`${brand.orderPrefix}-0042`}
          autoComplete="off"
          autoCapitalize="characters"
          required
          className="h-12 font-heading text-lg tracking-wide uppercase"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="last_name">Last name</Label>
        <Input
          id="last_name"
          name="last_name"
          key={`l-${state.last}`}
          defaultValue={state.last}
          autoComplete="family-name"
          required
          className="h-12 text-base"
        />
        <p className="text-xs text-muted-foreground">The last name you ordered with. It keeps your order private.</p>
      </div>

      {state.message && (
        <p role="alert" className="flex gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          {state.message}
        </p>
      )}

      <Button type="submit" size="xl" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        Find my order
      </Button>
    </form>
  );
}
