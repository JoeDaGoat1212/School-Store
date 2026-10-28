"use client";

import { useActionState, useState } from "react";
import { Loader2Icon, LogInIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signInWithPassword, type AuthState } from "@/app/(public)/account/actions";
import { CodeSignIn, ConfirmStep, Field, PasswordField } from "@/app/(public)/account/sign-in-form";
import { confirmTeacherSignUp, saveTeacherDetails, teacherSignUp, type TeacherDetailsState } from "@/app/(public)/teacher/actions";
import { cn } from "@/lib/utils";

/**
 * Teachers: "Sign in" (email + password) or "Request an account" (name, room,
 * email, password). A new account waits for staff to approve it.
 */
export function TeacherSignIn() {
  const [mode, setMode] = useState<"signin" | "request" | "forgot">("signin");
  const [signedIn, signInAction, signingIn] = useActionState<AuthState, FormData>(signInWithPassword, { view: "signin" });
  const [made, requestAction, requesting] = useActionState<AuthState, FormData>(teacherSignUp, { view: "signup" });

  const confirmFrom = made.view === "confirm" ? made : signedIn.view === "confirm" ? signedIn : null;
  if (confirmFrom?.email && mode !== "forgot") {
    return <ConfirmStep email={confirmFrom.email} next="/teacher" note={confirmFrom.message} confirm={confirmTeacherSignUp} />;
  }
  if (mode === "forgot") return <CodeSignIn next="/teacher" onBack={() => setMode("signin")} />;

  return (
    <div className="grid gap-5">
      <div role="tablist" aria-label="Sign in or request an account" className="grid grid-cols-2 rounded-xl bg-muted p-1">
        {(["signin", "request"] as const).map((m) => (
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
            {m === "signin" ? "Sign in" : "Request an account"}
          </button>
        ))}
      </div>

      {mode === "signin" ? (
        <form action={signInAction} className="grid gap-4" noValidate>
          <input type="hidden" name="next" value="/teacher" />
          <Field label="School email" name="login" type="email" autoComplete="email" defaultValue={signedIn.values?.login} error={signedIn.errors?.login} />
          <PasswordField autoComplete="current-password" error={signedIn.errors?.password} />
          {signedIn.message && <p className="text-sm font-medium text-destructive">{signedIn.message}</p>}
          <Button type="submit" size="xl" disabled={signingIn}>
            {signingIn ? <Loader2Icon className="animate-spin" /> : <LogInIcon />}
            {signingIn ? "Signing in…" : "Sign in"}
          </Button>
          <button type="button" onClick={() => setMode("forgot")} className="justify-self-start text-sm font-semibold text-ember-ink underline-offset-4 hover:underline">
            Forgot password? Get a code by email
          </button>
        </form>
      ) : (
        <form action={requestAction} className="grid gap-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" name="first_name" autoComplete="given-name" defaultValue={made.values?.first_name} error={made.errors?.first_name} />
            <Field label="Last name" name="last_name" autoComplete="family-name" defaultValue={made.values?.last_name} error={made.errors?.last_name} />
          </div>
          <Field label="Room number" name="room" defaultValue={made.values?.room} error={made.errors?.room} help="Where room service brings your orders. You can change it later." />
          <Field label="School email" name="email" type="email" autoComplete="email" defaultValue={made.values?.email} error={made.errors?.email} help="Use your school email so staff know it's you." />
          <PasswordField autoComplete="new-password" error={made.errors?.password} help="At least 8 characters." />
          {made.message && <p className="text-sm font-medium text-destructive">{made.message}</p>}
          <Button type="submit" size="xl" disabled={requesting}>
            {requesting ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            {requesting ? "Sending…" : "Request teacher account"}
          </Button>
          <p className="text-sm text-muted-foreground">Store staff check each request. Teacher prices start once you&apos;re approved.</p>
        </form>
      )}
    </div>
  );
}

/** Name and room: asks for teacher access (signed-in account) or updates them. */
export function TeacherDetailsForm({
  initial,
  submitLabel = "Send request",
}: {
  initial: { first_name: string; last_name: string; room: string };
  submitLabel?: string;
}) {
  const [state, action, saving] = useActionState<TeacherDetailsState, FormData>(saveTeacherDetails, {});
  return (
    <form action={action} className="grid gap-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" name="first_name" autoComplete="given-name" defaultValue={initial.first_name} error={state.errors?.first_name} />
        <Field label="Last name" name="last_name" autoComplete="family-name" defaultValue={initial.last_name} error={state.errors?.last_name} />
      </div>
      <Field label="Room number" name="room" defaultValue={initial.room} error={state.errors?.room} />
      {state.message && <p className="text-sm font-medium text-destructive">{state.message}</p>}
      {state.saved && <p className="text-sm font-medium text-teal-ink">Saved.</p>}
      <Button type="submit" size="lg" disabled={saving}>
        {saving && <Loader2Icon className="animate-spin" />}
        {saving ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
