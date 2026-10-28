"use client";

import { useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setRequestStatus } from "./actions";
import { STATUS_LABEL, type RequestStatus } from "./statuses";


/** Four stamps in a row: tap one to set this item's status. */
export function StatusPicker({ itemKey, name, status }: { itemKey: string; name: string; status: RequestStatus }) {
  const [busy, start] = useTransition();
  return (
    <div role="radiogroup" aria-label={`Status for ${name}`} className="flex flex-wrap items-center gap-1">
      {(Object.keys(STATUS_LABEL) as RequestStatus[]).map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={status === s}
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await setRequestStatus({ key: itemKey, status: s });
              if (r.error) toast.error(r.error);
              else toast.success(`${name}: ${STATUS_LABEL[s]}`);
            })
          }
          className={cn(
            "h-7 rounded-[3px] px-2 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            status === s
              ? s === "stocked"
                ? "bg-success text-white"
                : s === "planned"
                  ? "bg-[var(--label,var(--brand))] text-[#222631]"
                  : s === "declined"
                    ? "bg-muted-foreground text-background"
                    : "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {STATUS_LABEL[s]}
        </button>
      ))}
      {busy && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
    </div>
  );
}
