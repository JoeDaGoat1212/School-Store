"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { EyeIcon, EyeOffIcon, Loader2Icon, LogInIcon, MailIcon, UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  confirmSignUp,
  resendSignUpCode,
  sendCode,
  signInWithPassword,
  signUp,
  verifyCode,
  type AuthState,
  type SignInState,
} from "./actions";

/**
 * The rewards account card: "Sign in" (username or email + password) and
 * "Create account" (username, email, password, then a code from the email to
 * confirm it). "Forgot password?" signs in with an emailed code instead.
 */
export function SignInForm({ next = "/account", startOn = "signin" }: { next?: string; startOn?: "signin" | "signup" }) {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(startOn);
  const [signedIn, signInAction, signingIn] = useActionState<AuthState, FormData>(signInWithPassword, { view: "signin" });
  const [made, signUpAction, signingUp] = useActionState<AuthState, FormData>(signUp, { view: "signup" });

  // Either form can lead to "type the code we emailed you".
  const confirmFrom = made.view === "confirm" ? made : signedIn.view === "confirm" ? signedIn : null;
  if (confirmFrom?.email && mode !== "forgot") {
    return <ConfirmStep email={confirmFrom.email} next={next} note={confirmFrom.message} />;
  }
  if (mode === "forgot") return <CodeSignIn next={next} onBack={() => setMode("signin")} />;

  return (
    <div className="grid gap-5">
      <div role="tablist" aria-label="Sign in or create an account" className="grid grid-cols-2 rounded-xl bg-muted p-1">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "h-10 rounded-lg text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              mode === m ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      {mode === "signin" ? (
        <form action={signInAction} className="grid gap-4" noValidate>
          <input type="hidden" name="next" value={next} />
          <Field label="Username or email" name="login" autoComplete="username" defaultValue={signedIn.values?.login} error={signedIn.errors?.login} />
          <PasswordField autoComplete="current-password" error={signedIn.errors?.password} />
          {signedIn.message && <p className="text-sm font-medium text-destructive">{signedIn.message}</p>}
          <Button type="submit" size="xl" disabled={signingIn}>
            {signingIn ? <Loader2Icon className="animate-spin" /> : <LogInIcon />}
            {signingIn ? "Signing in…" : "Sign in"}
          </Button>
          <button
            type="button"
            onClick={() => setMode("forgot")}
            className="justify-self-start text-sm font-semibold text-ember-ink underline-offset-4 hover:underline"
          >
            Forgot password? Get a code by email
          </button>
        </form>
      ) : (
        <form action={signUpAction} className="grid gap-4" noValidate>
          <input type="hidden" name="next" value={next} />
          <Field
            label="Pick a username"
            name="username"
            autoComplete="username"
            defaultValue={made.values?.username}
            error={made.errors?.username}
            help="3–20 letters, numbers, dots or underscores. You'll sign in with it."
          />
          <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={made.values?.email} error={made.errors?.email} help="We'll send a code to confirm it, and use it if you forget your password." />
          <PasswordField autoComplete="new-password" error={made.errors?.password} help="At least 8 characters." />
          {made.message && <p className="text-sm font-medium text-destructive">{made.message}</p>}
          <Button type="submit" size="xl" disabled={signingUp}>
            {signingUp ? <Loader2Icon className="animate-spin" /> : <UserPlusIcon />}
            {signingUp ? "Making your account…" : "Create account"}
          </Button>
        </form>
      )}
    </div>
  );
}

export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  defaultValue,
  error,
  help,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  error?: string;
  help?: string;
}) {
  const note = error ?? help;
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        autoCapitalize="off"
        spellCheck={false}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        aria-describedby={note ? `${name}-note` : undefined}
        className="h-12 text-base"
      />
      {note && (
        <p id={`${name}-note`} className={error ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
          {note}
        </p>
      )}
    </div>
  );
}

export function PasswordField({ autoComplete, error, help }: { autoComplete: string; error?: string; help?: string }) {
  const [show, setShow] = useState(false);
  const note = error ?? help;
  return (
    <div className="grid gap-2">
      <Label htmlFor="password">Password</Label>
      <div className="relative">
        <Input
          id="password"
          name="password"
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={note ? "password-note" : undefined}
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
      {note && (
        <p id="password-note" className={error ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
          {note}
        </p>
      )}
    </div>
  );
}

/** The big box for a code from an email. */
function CodeInput({ error, inputRef }: { error?: string; inputRef: React.RefObject<HTMLInputElement | null> }) {
  return (
    <Input
      ref={inputRef}
      id="code"
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={10}
      placeholder="••••••"
      required
      aria-invalid={Boolean(error)}
      aria-describedby="code-help"
      className="h-16 text-center font-heading text-4xl font-extrabold tracking-[0.25em] tabular-nums placeholder:text-muted-foreground/40"
    />
  );
}

/** After "Create account": type the code from the confirmation email. */
export function ConfirmStep({
  email,
  next,
  note,
  confirm = confirmSignUp,
}: {
  email: string;
  next: string;
  note?: string;
  /** What checks the code (teachers use their own, which also files their request). */
  confirm?: typeof confirmSignUp;
}) {
  const [checked, confirmAction, confirming] = useActionState<AuthState, FormData>(confirm, { view: "confirm", email });
  const [resent, resendAction, resending] = useActionState<AuthState, FormData>(resendSignUpCode, { view: "confirm", email });
  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => codeRef.current?.focus(), [resent.sentAt]);
  const error = checked.message ?? resent.message;

  return (
    <div className="grid gap-4">
      <div>
        <p className="font-heading text-3xl leading-none font-extrabold">Check your email</p>
        <p className="mt-2 text-sm text-muted-foreground">{note ?? "Type the code we sent to finish making your account."}</p>
      </div>
      <form action={confirmAction} className="grid gap-4" noValidate>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <div className="grid gap-2">
          <Label htmlFor="code">Code from your email</Label>
          <CodeInput error={error} inputRef={codeRef} />
          <p id="code-help" className={error ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
            {error ?? (
              <>
                Sent to <strong className="font-semibold text-foreground">{email}</strong>. It can take a minute; check spam too.
              </>
            )}
          </p>
        </div>
        <Button type="submit" size="xl" disabled={confirming}>
          {confirming && <Loader2Icon className="animate-spin" />}
          {confirming ? "Checking…" : "Confirm and continue"}
        </Button>
      </form>
      <form action={resendAction}>
        <input type="hidden" name="email" value={email} />
        <button type="submit" disabled={resending} className="text-sm font-semibold text-ember-ink underline-offset-4 hover:underline">
          {resending ? "Sending…" : resent.sentAt ? "Sent! Send another code" : "Send a new code"}
        </button>
      </form>
    </div>
  );
}

/** "Forgot password?": email → code → signed in (then they set a new password). */
export function CodeSignIn({ next, onBack }: { next: string; onBack: () => void }) {
  const [sent, sendAction, sending] = useActionState<SignInState, FormData>(sendCode, { step: "email" });
  const [checked, verifyAction, verifying] = useActionState<SignInState, FormData>(verifyCode, { step: "code" });
  const codeRef = useRef<HTMLInputElement>(null);
  const onCodeStep = sent.step === "code";
  const email = sent.email ?? "";

  useEffect(() => {
    if (onCodeStep) codeRef.current?.focus();
  }, [onCodeStep, sent.sentAt]);

  return (
    <div className="grid gap-4">
      <div>
        <p className="font-heading text-3xl leading-none font-extrabold">Forgot your password?</p>
        <p className="mt-2 text-sm text-muted-foreground">We&apos;ll email you a code to sign in. Then you can pick a new password.</p>
      </div>
      {!onCodeStep ? (
        <form action={sendAction} className="grid gap-4" noValidate>
          <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={sent.email} error={sent.message} />
          <Button type="submit" size="xl" disabled={sending}>
            {sending ? <Loader2Icon className="animate-spin" /> : <MailIcon />}
            {sending ? "Sending…" : "Email me a code"}
          </Button>
        </form>
      ) : (
        <form action={verifyAction} className="grid gap-4" noValidate>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={next} />
          <div className="grid gap-2">
            <Label htmlFor="code">Code from your email</Label>
            <CodeInput error={checked.message} inputRef={codeRef} />
            <p id="code-help" className={checked.message ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
              {checked.message ?? (
                <>
                  Sent to <strong className="font-semibold text-foreground">{email}</strong>. It can take a minute; check spam too.
                </>
              )}
            </p>
          </div>
          <Button type="submit" size="xl" disabled={verifying}>
            {verifying && <Loader2Icon className="animate-spin" />}
            {verifying ? "Checking…" : "Sign in"}
          </Button>
        </form>
      )}
      <button type="button" onClick={onBack} className="justify-self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        Back to sign in
      </button>
    </div>
  );
}
