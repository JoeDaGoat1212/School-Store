"use client";

import { useState, useTransition } from "react";
import { CheckIcon, Loader2Icon, PencilIcon, RotateCcwIcon, Trash2Icon, UserPlusIcon, UsersIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/staff/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatCents, formatDay, storeToday } from "@/lib/format";
import { formatMinutes, type StaffStatus } from "@/lib/staff";
import { addEmployee, declineSignup, eraseRemoved, setEmployeeStatus, setSignupApproval, updateEmployee } from "../actions";

type Person = {
  id: string;
  name: string;
  pin: string;
  badge: string | null;
  status: StaffStatus;
  created_at: string;
  weekMinutes: number;
  creditCents: number;
  onClock: boolean;
};

type Run = (job: () => Promise<{ ok?: true; error?: string }>, message: string, after?: () => void) => void;

export function EmployeeList({ employees, signupApproval }: { employees: Person[]; signupApproval: boolean }) {
  const [busy, start] = useTransition();
  const run: Run = (job, message, after) =>
    start(async () => {
      const r = await job();
      if (r.error) toast.error(r.error);
      else {
        toast.success(message);
        after?.();
      }
    });

  const pending = employees.filter((e) => e.status === "pending");
  const active = employees.filter((e) => e.status === "active");
  const removed = employees.filter((e) => e.status === "removed");

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="grid min-w-0 content-start gap-8">
        {pending.length > 0 && (
          <section aria-labelledby="waiting" className="rounded-2xl border border-primary/50 bg-primary/5 p-4">
            <h2 id="waiting" className="mb-3 font-heading text-lg font-bold">
              Waiting for approval <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-sm text-black">{pending.length}</span>
            </h2>
            <ul className="grid gap-2">
              {pending.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card px-4 py-3">
                  <div>
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-sm text-muted-foreground">
                      PIN {p.pin}
                      {p.badge && ` · ID ${p.badge}`} · signed up {formatDay(storeToday(new Date(p.created_at)))}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => run(() => setEmployeeStatus(p.id, "active"), `${p.name} approved`)}>
                      <CheckIcon /> Approve
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => declineSignup(p.id), `${p.name} declined`)}>
                      <XIcon /> Decline
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="working">
          <h2 id="working" className="mb-3 font-heading text-xl font-semibold">
            Working here ({active.length})
          </h2>
          {active.length === 0 ? (
            <EmptyState icon={UsersIcon} title="No employees yet">
              Add someone with the form, or open the time clock and tap <strong>Create account</strong>.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
                    <th className="p-3">Name</th>
                    <th className="p-3">PIN</th>
                    <th className="p-3">Badge (student ID)</th>
                    <th className="p-3 text-right">This week</th>
                    <th className="p-3 text-right">Store credit</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {active.map((p) => (
                    <ActiveRow key={p.id} person={p} busy={busy} run={run} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {removed.length > 0 && <RemovedList removed={removed} busy={busy} run={run} />}
      </div>

      <aside className="grid h-fit gap-6">
        <AddForm busy={busy} run={run} />
        <div className="rounded-2xl border bg-card p-5 shadow-soft">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="approval">Approve new accounts</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                On: people who tap Create account can&apos;t clock in until you approve them here. Off: they can start right away.
              </p>
            </div>
            <Switch
              id="approval"
              defaultChecked={signupApproval}
              disabled={busy}
              onCheckedChange={(on) => run(() => setSignupApproval(on), on ? "New accounts need your approval" : "New accounts can clock in right away")}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

function ActiveRow({ person: p, busy, run }: { person: Person; busy: boolean; run: Run }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [name, setName] = useState(p.name);
  const [pin, setPin] = useState(p.pin);
  const [badge, setBadge] = useState(p.badge ?? "");

  if (editing) {
    return (
      <tr className="border-b bg-muted/40 last:border-b-0">
        <td className="p-2">
          <Input aria-label="Name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </td>
        <td className="p-2">
          <Input aria-label="PIN" className="w-20 font-receipt" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        </td>
        <td className="p-2">
          <Input aria-label="Badge code" value={badge} maxLength={40} onChange={(e) => setBadge(e.target.value)} />
        </td>
        <td className="p-2" colSpan={3}>
          <span className="flex justify-end gap-1">
            <Button size="sm" disabled={busy} onClick={() => run(() => updateEmployee(p.id, { name, pin, badge }), "Saved", () => setEditing(false))}>
              {busy && <Loader2Icon className="animate-spin" />} Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </span>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b last:border-b-0">
      <td className="p-3">
        <span className="font-semibold">{p.name}</span>
        {p.onClock && <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">On the clock</span>}
      </td>
      <td className="p-3 font-receipt">{p.pin}</td>
      <td className="p-3 font-receipt text-muted-foreground">{p.badge ?? "—"}</td>
      <td className="p-3 text-right tabular-nums">{formatMinutes(p.weekMinutes)}</td>
      <td className="p-3 text-right font-semibold tabular-nums">{formatCents(p.creditCents)}</td>
      <td className="p-3">
        {confirm ? (
          <span className="flex items-center justify-end gap-2 text-xs">
            Remove {p.name}? Their hours stay.
            <Button size="xs" variant="destructive" disabled={busy} onClick={() => run(() => setEmployeeStatus(p.id, "removed"), `${p.name} removed`)}>
              Remove
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setConfirm(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <span className="flex justify-end gap-1">
            <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>
              <PencilIcon /> Edit
            </Button>
            <Button size="xs" variant="ghost" className="text-destructive" onClick={() => setConfirm(true)}>
              Remove
            </Button>
          </span>
        )}
      </td>
    </tr>
  );
}

/** Removed accounts can come back, or be erased for good. Active accounts can't be erased. */
function RemovedList({ removed, busy, run }: { removed: Person[]; busy: boolean; run: Run }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <section aria-labelledby="removed">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="removed" className="font-heading text-xl font-semibold">
          Removed ({removed.length})
        </h2>
        {confirm === "all" ? (
          <span className="flex items-center gap-2 text-sm">
            Erase all {removed.length} for good? Active accounts stay.
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => run(() => eraseRemoved(), "Removed accounts erased", () => setConfirm(null))}>
              Erase
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
              Keep
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirm("all")}>
            <Trash2Icon /> Erase removed accounts ({removed.length})
          </Button>
        )}
      </div>
      <ul className="divide-y rounded-2xl border bg-card shadow-soft">
        {removed.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{p.name}</span> · PIN {p.pin}
              {p.creditCents > 0 && ` · ${formatCents(p.creditCents)} credit left`}
            </span>
            {confirm === p.id ? (
              <span className="flex items-center gap-2 text-xs">
                Erase {p.name} for good? Their past hours stay.
                <Button size="xs" variant="destructive" disabled={busy} onClick={() => run(() => eraseRemoved(p.id), `${p.name} erased`, () => setConfirm(null))}>
                  Erase
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setConfirm(null)}>
                  Keep
                </Button>
              </span>
            ) : (
              <span className="flex gap-1">
                <Button size="xs" variant="outline" disabled={busy} onClick={() => run(() => setEmployeeStatus(p.id, "active"), `${p.name} is back`)}>
                  <RotateCcwIcon /> Restore
                </Button>
                <Button size="xs" variant="ghost" className="text-destructive" onClick={() => setConfirm(p.id)}>
                  <Trash2Icon /> Erase
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AddForm({ busy, run }: { busy: boolean; run: Run }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [badge, setBadge] = useState("");
  return (
    <form
      className="grid gap-4 rounded-2xl border bg-card p-5 shadow-soft"
      onSubmit={(e) => {
        e.preventDefault();
        const added = { name, pin };
        run(() => addEmployee({ name, pin, badge }), `${added.name.trim()} added. Their PIN is ${added.pin}.`, () => {
          setName("");
          setPin("");
          setBadge("");
        });
      }}
    >
      <h2 className="font-heading text-lg font-semibold">Add an employee</h2>
      <div className="grid gap-2">
        <Label htmlFor="new-name">Name</Label>
        <Input id="new-name" value={name} maxLength={40} placeholder="First name and last initial" onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-pin">4-digit PIN</Label>
        <Input id="new-pin" className="w-28 font-receipt" inputMode="numeric" maxLength={4} placeholder="4821" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-badge">Badge code (optional)</Label>
        <Input id="new-badge" value={badge} maxLength={40} placeholder="Student ID #" onChange={(e) => setBadge(e.target.value)} />
        <p className="text-xs text-muted-foreground">The number under the barcode on their student ID, for a USB barcode scanner.</p>
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2Icon className="animate-spin" /> : <UserPlusIcon />} Add employee
      </Button>
    </form>
  );
}
