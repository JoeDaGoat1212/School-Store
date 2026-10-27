"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, SearchIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/staff/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDay, storeToday } from "@/lib/format";
import { adjustMemberPoints } from "./actions";

type Member = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  grade: string;
  balance: number;
  orders: number;
  last_order_at: string | null;
  created_at: string;
};

/** Everyone with a rewards account, with a way to add or remove points. */
export function MembersTable({ members }: { members: Member[] }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Member | null>(null);

  const q = query.trim().toLowerCase();
  const shown = q
    ? members.filter((m) => `${m.first_name} ${m.last_name} ${m.email}`.toLowerCase().includes(q))
    : members;

  return (
    <section aria-labelledby="members-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="members-title" className="font-heading text-xl font-semibold">
            Members
          </h2>
          <p className="text-sm text-muted-foreground">
            {members.length} {members.length === 1 ? "student has" : "students have"} a rewards account.
          </p>
        </div>
        {members.length > 0 && (
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email"
              aria-label="Search members"
              className="h-9 w-64 pl-9"
            />
          </div>
        )}
      </div>

      {members.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No members yet">
          Students join from the Sign in button on the menu. Share it when you hand out orders.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 text-right font-medium">Points</th>
                <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Orders</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Joined</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                    {m.first_name} {m.last_name}
                    <span className="ml-1.5 font-normal text-muted-foreground">{m.grade}</span>
                  </td>
                  <td className="max-w-56 truncate px-4 py-2.5 text-muted-foreground">{m.email}</td>
                  <td className="px-4 py-2.5 text-right font-heading text-base font-bold tabular-nums">{m.balance}</td>
                  <td className="hidden px-4 py-2.5 text-right tabular-nums sm:table-cell">{m.orders}</td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">{formatDay(storeToday(new Date(m.created_at)))}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="outline" size="sm" onClick={() => setEditing(m)}>
                      Adjust points
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No one matches “{query}”.</p>}
        </div>
      )}

      <AdjustDialog member={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

function AdjustDialog({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const [change, setChange] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    setChange("");
    setNote("");
    setError(null);
    onClose();
  };

  return (
    <Dialog open={member !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!member) return;
            start(async () => {
              const r = await adjustMemberPoints(member.id, Number(change), note);
              if (r.ok) {
                toast.success(`${r.message} for ${member.first_name}`);
                close();
              } else {
                setError(r.message ?? "Couldn't save.");
              }
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>
              Adjust points for {member?.first_name} {member?.last_name}
            </DialogTitle>
            <DialogDescription>They have {member?.balance} points now. Use a minus sign to take points away.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="adjust-change">Points</Label>
            <Input id="adjust-change" type="number" value={change} onChange={(e) => setChange(e.target.value)} placeholder="50 or -50" className="h-10" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="adjust-note">Reason (the student sees this)</Label>
            <Input
              id="adjust-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="Birthday bonus"
              className="h-10"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
