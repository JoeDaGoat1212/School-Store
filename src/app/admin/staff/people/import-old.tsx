"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, HistoryIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ImportSummary, importOldClock } from "../import-actions";

/** Brings every employee and shift over from the old separate time clock site. */
export function ImportOldClock() {
  const router = useRouter();
  const [address, setAddress] = useState("store-clock-in.vercel.app");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, start] = useTransition();

  return (
    <form
      className="grid gap-3 rounded-2xl border border-dashed bg-card p-5 shadow-soft"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await importOldClock(address, pin);
          if (r.error) setError(r.error);
          else if (r.summary) {
            setSummary(r.summary);
            setPin("");
            router.refresh();
          }
        });
      }}
    >
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
        <HistoryIcon className="size-5 text-ember-ink" /> Bring over the old time clock
      </h2>
      <p className="text-xs text-muted-foreground">
        Copies every employee (same names and PINs) and every shift from the old separate time clock site into this one. Running it again skips
        anything already copied.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="old-address">Old time clock address</Label>
        <Input id="old-address" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="old-pin">Its manager PIN</Label>
        <Input
          id="old-pin"
          type="password"
          inputMode="numeric"
          maxLength={6}
          className="w-32 font-receipt"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          autoComplete="off"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || pin.length < 4}>
        {busy ? <Loader2Icon className="animate-spin" /> : <HistoryIcon />} Bring everything over
      </Button>
      {summary && (
        <div role="status" className="grid gap-1.5 rounded-xl bg-success/10 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-success">
            <CheckCircle2Icon className="size-4" /> Done
          </p>
          <p>
            {summary.employeesAdded} employee{summary.employeesAdded === 1 ? "" : "s"} added, {summary.employeesMatched} already here.
          </p>
          <p>
            {summary.shiftsAdded} shift{summary.shiftsAdded === 1 ? "" : "s"} copied
            {summary.openShifts > 0 && ` (${summary.openShifts} still on the clock)`}
            {summary.shiftsSkipped > 0 && `, ${summary.shiftsSkipped} skipped because they were already here`}.
          </p>
          {summary.problems.map((p) => (
            <p key={p} className="text-warning">
              {p}
            </p>
          ))}
        </div>
      )}
    </form>
  );
}
