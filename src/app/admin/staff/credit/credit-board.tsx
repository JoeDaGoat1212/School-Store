"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents, formatDay, formatTime, storeToday } from "@/lib/format";
import { type CreditRule, creditRuleText, formatMinutes, hoursDecimal, nextReward } from "@/lib/staff";
import { changeCredit, deleteCreditEntry, saveCreditRule } from "../actions";

type Person = {
  id: string;
  name: string;
  removed: boolean;
  workedMinutes: number;
  weekMinutes: number;
  discountPct: number;
  earnedCents: number;
  adjustCents: number;
  balanceCents: number;
  nextMinutes: number;
};

export function CreditBoard({
  rule,
  people,
  history,
}: {
  rule: CreditRule;
  people: Person[];
  history: { id: string; name: string; cents: number; note: string | null; at: string }[];
}) {
  const [busy, start] = useTransition();
  const [who, setWho] = useState("");
  const [kind, setKind] = useState<"use" | "add">("use");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [dollars, setDollars] = useState((rule.cents / 100).toFixed(2));
  const [capDollars, setCapDollars] = useState(((rule.capCents ?? 1000) / 100).toFixed(2));

  const shown = people.filter((p) => !p.removed || p.balanceCents !== 0);
  const selected = people.find((p) => p.id === who);
  const owed = people.reduce((t, p) => t + Math.max(0, p.balanceCents), 0);

  const record = (e: React.FormEvent) => {
    e.preventDefault();
    if (!who) return void toast.error("Pick an employee.");
    start(async () => {
      const r = await changeCredit(who, kind, amount, note);
      if (r.error) return void toast.error(r.error);
      toast.success(`${selected?.name ?? "Their"} credit is now ${formatCents(r.balance ?? 0)}`);
      setAmount("");
      setNote("");
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="grid min-w-0 content-start gap-8">
        <section aria-labelledby="balances">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="balances" className="font-heading text-xl font-semibold">
              Balances
            </h2>
            <p className="text-sm text-muted-foreground">
              Unspent credit, everyone: <strong className="text-foreground">{formatCents(owed)}</strong>
            </p>
          </div>
          {shown.length === 0 ? (
            <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-muted-foreground">No employees yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                    <th className="p-3">Employee</th>
                    <th className="p-3 text-right">This week</th>
                    <th className="p-3 text-right">Credit earned</th>
                    <th className="p-3 text-right">Used / added</th>
                    <th className="p-3 text-right">Credit left</th>
                    <th className="p-3 text-right">Next hour</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr
                      key={p.id}
                      className={`cursor-pointer border-b last:border-b-0 hover:bg-muted/50 ${who === p.id ? "bg-primary/10" : ""}`}
                      onClick={() => setWho(p.id)}
                    >
                      <td className="p-3 font-semibold">
                        {p.name} {p.removed && <span className="text-xs font-normal text-muted-foreground">(removed)</span>}
                      </td>
                      <td className="p-3 text-right tabular-nums" title={`${hoursDecimal(p.workedMinutes)} hours worked in all`}>
                        {formatMinutes(p.weekMinutes)}
                      </td>
                      <td className="p-3 text-right tabular-nums">{formatCents(p.earnedCents)}</td>
                      <td className={`p-3 text-right tabular-nums ${p.adjustCents < 0 ? "text-destructive" : p.adjustCents > 0 ? "text-success" : "text-muted-foreground"}`}>
                        {p.adjustCents === 0 ? "—" : `${p.adjustCents > 0 ? "+" : "−"}${formatCents(Math.abs(p.adjustCents))}`}
                      </td>
                      <td className="p-3 text-right font-heading text-base font-bold tabular-nums">{formatCents(p.balanceCents)}</td>
                      <td className="p-3 text-right text-xs text-muted-foreground tabular-nums">
                        {nextReward(p.weekMinutes, rule).startsWith("nothing") ? "Maxed out this week" : `${nextReward(p.weekMinutes, rule)} in ${formatMinutes(p.nextMinutes)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Tap a row to record credit for that person. Credit is added when they clock out.
            Hours start over each Monday.
          </p>
        </section>

        <section aria-labelledby="history">
          <h2 id="history" className="mb-3 font-heading text-xl font-semibold">
            Credit used and added
          </h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet. When someone spends their credit at the window, record it here.</p>
          ) : (
            <ul className="divide-y rounded-2xl border bg-card shadow-soft">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={`w-20 font-heading font-bold tabular-nums ${h.cents < 0 ? "text-destructive" : "text-success"}`}>
                    {h.cents < 0 ? "−" : "+"}
                    {formatCents(Math.abs(h.cents))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{h.name}</span>
                    {h.note && <span className="text-muted-foreground"> · {h.note}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDay(storeToday(new Date(h.at)))}, {formatTime(h.at)}
                  </span>
                  {confirm === h.id ? (
                    <span className="flex items-center gap-1 text-xs">
                      Undo this?
                      <Button
                        size="xs"
                        variant="destructive"
                        disabled={busy}
                        onClick={() =>
                          start(async () => {
                            const r = await deleteCreditEntry(h.id);
                            if (r.error) toast.error(r.error);
                            else toast.success("Taken back");
                            setConfirm(null);
                          })
                        }
                      >
                        Yes
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => setConfirm(null)}>
                        No
                      </Button>
                    </span>
                  ) : (
                    <Button size="icon-xs" variant="ghost" aria-label="Undo this entry" onClick={() => setConfirm(h.id)}>
                      <Trash2Icon />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="grid h-fit gap-6">
        <form onSubmit={record} className="grid gap-4 rounded-2xl border bg-card p-5 shadow-soft">
          <h2 className="font-heading text-lg font-semibold">Record store credit</h2>
          <div className="grid gap-2">
            <Label htmlFor="credit-who">Employee</Label>
            <select id="credit-who" value={who} onChange={(e) => setWho(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm">
              <option value="">Pick…</option>
              {people
                .filter((p) => !p.removed)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatCents(p.balanceCents)})
                  </option>
                ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={kind === "use" ? "default" : "outline"} aria-pressed={kind === "use"} onClick={() => setKind("use")}>
              <MinusIcon /> They used it
            </Button>
            <Button type="button" variant={kind === "add" ? "default" : "outline"} aria-pressed={kind === "add"} onClick={() => setKind("add")}>
              <PlusIcon /> Add credit
            </Button>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="credit-amount">Amount</Label>
            <div className="relative w-32">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
              <Input id="credit-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1.50" className="h-10 pl-7" />
            </div>
            {selected && kind === "use" && <p className="text-xs text-muted-foreground">{selected.name} has {formatCents(selected.balanceCents)} to spend.</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="credit-note">What for (optional)</Label>
            <Input id="credit-note" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder={kind === "use" ? "Hot Cheetos and a soda" : "Stayed late for the game"} />
          </div>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2Icon className="animate-spin" />} {kind === "use" ? "Take it off their credit" : "Add to their credit"}
          </Button>
        </form>

        <form
          className="grid gap-3 rounded-2xl border bg-card p-5 shadow-soft"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await saveCreditRule(dollars, capDollars);
              if (r.error) toast.error(r.error);
              else toast.success("Saved. Everyone's credit was recounted.");
            });
          }}
        >
          <h2 className="font-heading text-lg font-semibold">What they earn each week</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="relative w-24">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
              <Input aria-label="Dollars of credit per hour" inputMode="decimal" value={dollars} onChange={(e) => setDollars(e.target.value)} className="h-10 pl-7" />
            </div>
            store credit for every hour, up to
            <div className="relative w-24">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
              <Input aria-label="Most credit per week" inputMode="decimal" value={capDollars} onChange={(e) => setCapDollars(e.target.value)} className="h-10 pl-7" />
            </div>
            a week
          </div>
          <p className="text-xs text-muted-foreground">Now: {creditRuleText(rule)} Credit is counted to the minute. Changing it recounts credit from the week of Nov 9 on.</p>
          <Button type="submit" variant="outline" disabled={busy}>
            Save
          </Button>
        </form>
      </aside>
    </div>
  );
}
