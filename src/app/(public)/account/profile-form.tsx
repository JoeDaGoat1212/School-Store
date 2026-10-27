"use client";

import { useActionState, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Choice, ChoiceGroup, TextField } from "@/components/public/form-fields";
import { Button } from "@/components/ui/button";
import { GRADES } from "@/lib/validation";
import { saveProfile, type ProfileState } from "./actions";

/** First sign-in: name, grade and username (name and grade are filled in at checkout from now on). */
export function ProfileForm({
  initial,
  next = "/account",
  saveLabel = "Start earning points",
}: {
  initial?: { first_name: string; last_name: string; grade: string; username?: string | null };
  next?: string;
  saveLabel?: string;
}) {
  const [state, action, saving] = useActionState<ProfileState, FormData>(saveProfile, {});
  const errors = state.errors ?? {};
  // Controlled, so a failed save doesn't wipe what was typed.
  const [first, setFirst] = useState(initial?.first_name ?? "");
  const [last, setLast] = useState(initial?.last_name ?? "");
  const [grade, setGrade] = useState(initial?.grade ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");

  return (
    <form action={action} className="grid gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="grid grid-cols-2 gap-3">
        <TextField id="first_name" label="First name" autoComplete="given-name" value={first} onChange={setFirst} error={errors.first_name} />
        <TextField id="last_name" label="Last name" autoComplete="family-name" value={last} onChange={setLast} error={errors.last_name} />
      </div>
      <TextField
        id="username"
        label="Username"
        autoComplete="username"
        value={username}
        onChange={setUsername}
        error={errors.username}
        hint="You sign in with this and your password."
      />
      <ChoiceGroup label="Grade" error={errors.grade}>
        {GRADES.map((g) => (
          <Choice key={g} name="grade" value={g} checked={grade === g} onChange={() => setGrade(g)}>
            {g}
          </Choice>
        ))}
      </ChoiceGroup>
      {state.message && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" size="xl" disabled={saving}>
        {saving && <Loader2Icon className="animate-spin" />}
        {saveLabel}
      </Button>
    </form>
  );
}
