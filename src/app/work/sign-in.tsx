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
    "h-14 w-full rounded-lg border bg-background px-4 text-lg outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <div className="grid gap-5">
      {!manager && (
        <div className="px-1 pt-2">
          <h1 className="font-heading text-6xl leading-[0.88] font-bold">Your shift,<br /><span className="text-ember">on your phone</span></h1>
          <p className="mt-1.5 text-[0.9375rem] text-muted-foreground">Clock in and out, see your store credit and schedule.</p>
        </div>
      )}

      <form onSubmit={submit} className="glass float-in grid gap-4 rounded-[1.75rem] p-5">
        <div>
          <h2 className="text-lg font-semibold">{manager ? "Also work a shift?" : "Sign in"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use your name and the PIN you clock in with. You stay signed in on this phone.</p>
        </div>
        <label className="grid gap-1.5 text-sm font-semibold">
          Your name
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoCapitalize="words" placeholder="Maya R" maxLength={40} />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          PIN
          <input
            className={`${field} font-receipt text-2xl tracking-[0.6em]`}
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
          <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="ember flex h-14 items-center justify-center gap-2 rounded-2xl text-lg font-extrabold transition active:scale-[0.985] disabled:opacity-60"
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
    </div>
  );
}
