"use client";

import { useActionState, useState } from "react";
import { CheckIcon, EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPassword, type PasswordState } from "./actions";

/** Set or change the account's password (after "forgot password", or any time). */
export function PasswordForm({ label = "New password", button = "Save password" }: { label?: string; button?: string }) {
  const [state, action, saving] = useActionState<PasswordState, FormData>(setPassword, {});
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="grid gap-3" noValidate>
      <Label htmlFor="new-password">{label}</Label>
      <div className="relative">
        <Input
          id="new-password"
          name="password"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          aria-invalid={Boolean(state.error)}
          aria-describedby="new-password-note"
          className="h-12 pr-12 text-base"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
        </button>
      </div>
      <p id="new-password-note" role={state.error ? "alert" : undefined} className={state.error ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
        {state.error ?? (state.ok ? "Saved. Use it with your username next time you sign in." : "At least 8 characters.")}
      </p>
      <Button type="submit" size="lg" disabled={saving} className="justify-self-start">
        {saving ? <Loader2Icon className="animate-spin" /> : state.ok ? <CheckIcon /> : null}
        {button}
      </Button>
    </form>
  );
}
