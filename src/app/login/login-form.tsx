"use client";

import { useActionState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, type LoginState } from "./actions";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, { error: initialError });

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="next" value={next} />

      <div className="grid gap-2">
        <Label htmlFor="password">Admin password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus className="h-11" />
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" size="xl" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        Open dashboard
      </Button>
    </form>
  );
}
