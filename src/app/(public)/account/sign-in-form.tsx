"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2Icon, MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendCode, verifyCode, type SignInState } from "./actions";

/**
 * Two steps on one card: type your email → type the 6-digit code from it.
 * No passwords to forget.
 */
export function SignInForm({ next = "/account" }: { next?: string }) {
  const [sent, sendAction, sending] = useActionState<SignInState, FormData>(sendCode, { step: "email" });
  const [checked, verifyAction, verifying] = useActionState<SignInState, FormData>(verifyCode, { step: "code" });
  const codeRef = useRef<HTMLInputElement>(null);

  // Show the code step once a code went out (and stay there while checking it).
  const onCodeStep = sent.step === "code";
  const email = sent.email ?? "";

  useEffect(() => {
    if (onCodeStep) codeRef.current?.focus();
  }, [onCodeStep, sent.sentAt]);

  if (!onCodeStep) {
    return (
      <form action={sendAction} className="grid gap-4" noValidate>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            defaultValue={sent.email}
            placeholder="you@school.org"
            required
            aria-invalid={Boolean(sent.message)}
            aria-describedby={sent.message ? "email-error" : "email-help"}
            className="h-12 text-base"
          />
          {sent.message ? (
            <p id="email-error" className="text-sm font-medium text-destructive">
              {sent.message}
            </p>
          ) : (
            <p id="email-help" className="text-sm text-muted-foreground">
              We&apos;ll email you a 6-digit code. No password needed.
            </p>
          )}
        </div>
        <Button type="submit" size="xl" disabled={sending}>
          {sending ? <Loader2Icon className="animate-spin" /> : <MailIcon />}
          {sending ? "Sending…" : "Email me a code"}
        </Button>
      </form>
    );
  }

  const error = checked.message;

  return (
    <div className="grid gap-4">
      <form action={verifyAction} className="grid gap-4" noValidate>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <div className="grid gap-2">
          <Label htmlFor="code">Code from your email</Label>
          <Input
            ref={codeRef}
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            required
            aria-invalid={Boolean(error)}
            aria-describedby="code-help"
            className="h-16 text-center font-heading text-4xl font-extrabold tracking-[0.35em] tabular-nums placeholder:text-muted-foreground/40"
          />
          <p id="code-help" className={error ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
            {error ?? (
              <>
                Sent to <strong className="font-semibold text-foreground">{email}</strong>. It can take a minute, and
                check your spam folder too.
              </>
            )}
          </p>
        </div>
        <Button type="submit" size="xl" disabled={verifying}>
          {verifying && <Loader2Icon className="animate-spin" />}
          {verifying ? "Checking…" : "Sign in"}
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <form action={sendAction}>
          <input type="hidden" name="email" value={email} />
          <button type="submit" disabled={sending} className="font-semibold text-ember-ink underline-offset-4 hover:underline">
            {sending ? "Sending…" : "Send a new code"}
          </button>
        </form>
        <button
          type="button"
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={() => window.location.reload()}
        >
          Use a different email
        </button>
      </div>
    </div>
  );
}
