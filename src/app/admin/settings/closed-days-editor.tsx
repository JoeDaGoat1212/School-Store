"use client";

import { useTransition } from "react";
import { XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/format";
import { addClosedDays, removeClosedDay } from "./actions";
import { SectionForm, SettingField } from "./section-form";

/** Holidays and other days the store is closed (weekends are always closed). */
export function ClosedDaysEditor({ days, today }: { days: { closed_on: string; reason: string | null }[]; today: string }) {
  const upcoming = days.filter((d) => d.closed_on >= today);

  return (
    <SectionForm
      id="closed"
      title="Closed days"
      description="No orders can be placed for these days. Weekends are always closed, so you don't need to add them."
      action={addClosedDays}
      saveLabel="Add closed days"
    >
      {(errors, typed) => (
        <>
          <div className="grid gap-5 sm:grid-cols-3">
            <SettingField name="from" label="First day" type="date" min={today} defaultValue={typed.from} error={errors.from} />
            <SettingField name="to" label="Last day (optional)" type="date" min={today} defaultValue={typed.to} error={errors.to} hint="For a break, like Winter break." />
            <SettingField name="reason" label="Reason (optional)" defaultValue={typed.reason} maxLength={60} placeholder="e.g. Thanksgiving break" error={errors.reason} />
          </div>

          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming closed days.</p>
          ) : (
            <ul className="flex flex-wrap gap-2" aria-label="Upcoming closed days">
              {upcoming.map((d) => (
                <ClosedChip key={d.closed_on} day={d.closed_on} reason={d.reason} />
              ))}
            </ul>
          )}
        </>
      )}
    </SectionForm>
  );
}

function ClosedChip({ day, reason }: { day: string; reason: string | null }) {
  const [pending, startTransition] = useTransition();
  return (
    <li className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-1 pr-1 pl-3 text-sm" title={reason ?? undefined}>
      <span className="font-medium">{formatDay(day)}</span>
      {reason && <span className="max-w-32 truncate text-muted-foreground">· {reason}</span>}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="rounded-full"
        disabled={pending}
        aria-label={`Remove ${formatDay(day)}`}
        onClick={() =>
          startTransition(async () => {
            const result = await removeClosedDay(day);
            if (result.error) toast.error(result.error);
          })
        }
      >
        <XIcon />
      </Button>
    </li>
  );
}
