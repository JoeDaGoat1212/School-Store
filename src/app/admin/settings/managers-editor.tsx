"use client";

import { useState, useTransition } from "react";
import { KeyRoundIcon, Loader2Icon, Trash2Icon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDay } from "@/lib/format";
import type { Manager } from "@/lib/managers";
import { createManager, deleteManager, resetManagerPassword } from "./manager-actions";

/** Owner only: add managers (name + password), change their password, remove them. */
export function ManagersEditor({ managers, ready }: { managers: Manager[]; ready: boolean }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pending, start] = useTransition();

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await createManager(name, password);
      if (r.error) return void toast.error(r.error);
      toast.success(`${name.trim()} can now sign in at /login with their name and that password.`);
      setName("");
      setPassword("");
    });
  };

  return (
    <section id="managers" className="scroll-mt-24 rounded-xl border bg-card p-5">
      <h2 className="text-lg font-semibold">Managers</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Managers sign in at <strong className="font-medium text-foreground">/login</strong> with their name and their own password. They can use the whole dashboard except this
        section. Only you (the owner) can add or remove them.
      </p>

      {!ready && (
        <p className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          Run database update 23 first (Supabase → SQL Editor → <code>20261112000023_managers.sql</code>).
        </p>
      )}

      {managers.length > 0 && (
        <ul className="mt-4 divide-y rounded-lg border">
          {managers.map((m) => (
            <li key={m.userId} className="grid gap-3 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">Manager since {formatDay(m.createdAt.slice(0, 10))}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setResetFor(resetFor === m.userId ? null : m.userId)}>
                    <KeyRoundIcon /> New password
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(`Remove ${m.name} as a manager? They won't be able to sign in anymore.`)) return;
                      start(async () => {
                        const r = await deleteManager(m.userId);
                        if (r.error) toast.error(r.error);
                        else toast.success(`${m.name} was removed.`);
                      });
                    }}
                  >
                    <Trash2Icon /> Remove
                  </Button>
                </div>
              </div>
              {resetFor === m.userId && (
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    start(async () => {
                      const r = await resetManagerPassword(m.userId, newPassword);
                      if (r.error) return void toast.error(r.error);
                      toast.success(`${m.name}'s password was changed.`);
                      setResetFor(null);
                      setNewPassword("");
                    });
                  }}
                >
                  <div className="grid flex-1 gap-1.5">
                    <Label htmlFor={`pw-${m.userId}`}>New password for {m.name}</Label>
                    <Input id={`pw-${m.userId}`} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  </div>
                  <Button type="submit" disabled={pending}>
                    Save
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="manager-name">Name</Label>
          <Input id="manager-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Matthew" autoComplete="off" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="manager-password">Password</Label>
          <Input id="manager-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
        </div>
        <Button type="submit" disabled={pending || !ready}>
          {pending ? <Loader2Icon className="animate-spin" /> : <UserPlusIcon />} Add manager
        </Button>
      </form>
    </section>
  );
}
