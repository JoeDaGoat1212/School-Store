"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, MonitorSmartphoneIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { lockThisTablet, setKioskPin } from "./kiosk-actions";

/**
 * "Lock tablet on time clock": signs the manager out on this device and pins
 * it to the time clock. The manager code (picked here the first time) unlocks
 * it again from the time clock's Manager button.
 */
export function LockTablet({ hasPin, ready }: { hasPin: boolean; ready: boolean }) {
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const needsPin = !hasPin || changing;

  const lock = () =>
    start(async () => {
      setError(null);
      if (needsPin) {
        if (!/^\d{4,6}$/.test(pin)) return setError("Pick a code of 4 to 6 numbers.");
        if (pin !== pin2) return setError("The two codes don't match.");
        const r = await setKioskPin(pin);
        if (r.error) return setError(r.error);
        if (changing) {
          toast.success("Manager code changed");
          setChanging(false);
          setPin("");
          setPin2("");
          return;
        }
      }
      const r = await lockThisTablet(); // opens the time clock when it works
      if (r?.error) setError(r.error);
    });

  if (!ready) return null;

  return (
    <div className="relative">
      <Button variant="outline" className="h-10 px-4" onClick={() => setOpen(!open)} aria-expanded={open}>
        <MonitorSmartphoneIcon /> Lock tablet on time clock
      </Button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 grid w-[min(22rem,calc(100vw-2rem))] gap-3 rounded-2xl border bg-card p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <p className="font-heading text-lg font-bold">Lock this tablet on the time clock</p>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="grid size-7 place-items-center rounded-md hover:bg-muted">
              <XIcon className="size-4" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            This signs you out here and opens the time clock. To get back, tap <strong>Manager</strong> on the time clock and type your manager code. The
            code only works on this tablet.
          </p>
          {needsPin && (
            <div className="grid gap-2">
              <p className="text-sm font-semibold">{changing ? "New manager code" : "Pick a manager code (4–6 numbers)"}</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  aria-label="Manager code"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  className="h-11 rounded-xl border bg-background text-center font-receipt text-lg tracking-[0.4em]"
                  placeholder="code"
                />
                <input
                  aria-label="Type the code again"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin2}
                  onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
                  className="h-11 rounded-xl border bg-background text-center font-receipt text-lg tracking-[0.4em]"
                  placeholder="again"
                />
              </div>
              <p className="text-xs text-muted-foreground">Don&apos;t use an employee&apos;s PIN, and don&apos;t share it with employees.</p>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {error}
            </p>
          )}
          <Button onClick={lock} disabled={busy} className="h-11 font-semibold">
            {busy && <Loader2Icon className="animate-spin" />}
            {changing ? "Save new code" : hasPin ? "Lock now" : "Save code and lock"}
          </Button>
          {hasPin && (
            <button
              type="button"
              onClick={() => {
                setChanging(!changing);
                setError(null);
              }}
              className="justify-self-start text-xs font-semibold text-muted-foreground underline underline-offset-4"
            >
              {changing ? "Keep my current code" : "Change the manager code"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
