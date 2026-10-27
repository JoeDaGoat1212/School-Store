"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatClock } from "@/lib/format";
import { savePickupWindows } from "./actions";

type Window = { id: number | null; key: string; label: string; starts_at: string; active: boolean };

/**
 * The bell schedule students pick from at checkout. Each pickup time has a
 * name and the time it happens; turning one off hides it without deleting it.
 */
export function PickupWindowsEditor({
  initial,
  leadMinutes,
}: {
  initial: { id: number; label: string; starts_at: string; active: boolean }[];
  leadMinutes: number;
}) {
  const [rows, setRows] = useState<Window[]>(() => initial.map((w) => ({ ...w, key: String(w.id) })));
  const [removed, setRemoved] = useState<number[]>([]);
  const [saving, startSaving] = useTransition();
  const [dirty, setDirty] = useState(false);

  const update = (key: string, patch: Partial<Window>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  /** "08:15" minus N minutes → "7:55 AM" */
  const closesAt = (hhmm: string) => {
    if (!/^\d{2}:\d{2}$/.test(hhmm)) return "";
    const [h, m] = hhmm.split(":").map(Number);
    const total = Math.max(0, h * 60 + m - leadMinutes);
    return formatClock(`${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`);
  };

  function save() {
    startSaving(async () => {
      const result = await savePickupWindows(
        rows.map(({ id, label, starts_at, active }) => ({ id, label, starts_at, active })),
        removed,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      setRemoved([]);
      setDirty(false);
    });
  }

  return (
    <section id="pickup" className="scroll-mt-20 rounded-2xl border bg-card shadow-soft" aria-labelledby="pickup-title">
      <div className="border-b px-5 py-4">
        <h2 id="pickup-title" className="font-heading text-lg font-semibold">
          Pickup times
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Match your bell schedule. Each time stops taking orders {leadMinutes} minutes before it starts (change that
          under Ordering rules).
        </p>
      </div>

      <div className="grid gap-2 px-5 py-4">
        <div className="hidden grid-cols-[1fr_140px_150px_60px_40px] gap-3 px-1 text-xs font-medium text-muted-foreground sm:grid">
          <span>Name students see</span>
          <span>Time</span>
          <span>Orders close</span>
          <span>On</span>
          <span />
        </div>
        {rows.map((r, i) => (
          // Phones: name on its own line, then time / closes / on / remove underneath.
          <div
            key={r.key}
            className="grid grid-cols-[132px_1fr_auto_auto] items-center gap-x-3 gap-y-2 border-b pb-3 last-of-type:border-b-0 sm:grid-cols-[1fr_140px_150px_60px_40px] sm:border-b-0 sm:pb-0"
          >
            <Input
              aria-label={`Name for pickup time ${i + 1}`}
              value={r.label}
              maxLength={40}
              onChange={(e) => update(r.key, { label: e.target.value })}
              className="col-span-4 h-10 sm:col-span-1"
            />
            <Input
              type="time"
              aria-label={`Time for ${r.label || `pickup time ${i + 1}`}`}
              value={r.starts_at}
              onChange={(e) => update(r.key, { starts_at: e.target.value })}
              className="h-10"
            />
            <span className="text-sm text-muted-foreground">
              {r.active ? (
                <>
                  <span className="sm:hidden">Closes </span>
                  {closesAt(r.starts_at)}
                </>
              ) : (
                "Turned off"
              )}
            </span>
            <Switch
              checked={r.active}
              onCheckedChange={(on) => update(r.key, { active: on })}
              aria-label={`Offer ${r.label || "this time"} to students`}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${r.label || "this time"}`}
              onClick={() => {
                if (r.id) setRemoved((ids) => [...ids, r.id!]);
                setRows((rs) => rs.filter((x) => x.key !== r.key));
                setDirty(true);
              }}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          className="mt-2 w-fit"
          onClick={() => {
            setRows((rs) => [...rs, { id: null, key: crypto.randomUUID(), label: "", starts_at: "15:00", active: true }]);
            setDirty(true);
          }}
        >
          <PlusIcon /> Add pickup time
        </Button>
      </div>

      <div className="flex items-center justify-end gap-3 border-t px-5 py-3">
        {dirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
        <Button onClick={save} disabled={saving || !dirty}>
          {saving && <Loader2Icon className="animate-spin" />}
          Save pickup times
        </Button>
      </div>
    </section>
  );
}
