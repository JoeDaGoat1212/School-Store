"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2Icon, LockIcon } from "lucide-react";
import { signIn } from "./actions";

/** Name + 4-digit time clock PIN. */
export function SignIn({ manager }: { manager: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Type your name.");
    if (!/^\d{4}$/.test(pin)) return setError("Your PIN is the 4 numbers you use on the time clock.");
    start(async () => {
      const r = await signIn(name, pin);
      if (r.error) {
        setError(r.error);
        setPin("");
      } else router.refresh();
    });
  };

  const field =
    "h-14 w-full rounded-2xl border bg-background px-4 text-lg outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-3xl border bg-card p-6 shadow-soft">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-wide uppercase">{manager ? "Also work a shift?" : "Sign in"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use your name and the PIN you clock in with. You stay signed in on this phone.</p>
      </div>
      <label className="grid gap-1.5 text-sm font-semibold">
        Your name
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoCapitalize="words" placeholder="Maya R" maxLength={40} />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold">
        PIN
        <input
          className={`${field} font-receipt tracking-[0.5em]`}
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="••••"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary font-heading text-2xl font-bold tracking-wide text-primary-foreground uppercase disabled:opacity-60"
      >
        {pending && <Loader2Icon className="size-5 animate-spin" />} Sign in
      </button>
      <p className="text-center text-sm text-muted-foreground">
        New? Tap <strong>Create account</strong> on the store&apos;s time clock first.
      </p>
      {!manager && (
        <Link href="/login?next=/work" className="flex items-center justify-center gap-1.5 text-sm font-semibold text-ember-ink underline-offset-4 hover:underline">
          <LockIcon className="size-3.5" /> Manager sign-in
        </Link>
      )}
    </form>
  );
}
