"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { clockOutShift } from "./actions";

/** Clock someone out from the dashboard (they forgot, or the store is closing). */
export function ClockOutButton({ shiftId, name }: { shiftId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await clockOutShift(shiftId);
          if (r.error) toast.error(r.error);
          else {
            toast.success(`${name} clocked out`);
            router.refresh();
          }
        })
      }
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
      aria-label={`Clock out ${name}`}
    >
      {pending && <Loader2Icon className="size-3 animate-spin" />} Clock out
    </button>
  );
}
