"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, WandSparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { applyReorderPoints } from "./actions";

type Change = { id: string; name: string; from: number; to: number };

/**
 * Shows the reorder points the math suggests (from recent sales, lead time
 * and the safety buffer) and saves them with one click.
 */
export function ReorderPointsButton({ changes }: { changes: Change[] }) {
  const [open, setOpen] = useState(false);
  const [saving, startSaving] = useTransition();
  if (changes.length === 0) return null;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <WandSparklesIcon /> Suggested reorder points
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update reorder points?</DialogTitle>
            <DialogDescription>
              Based on recent sales: (sold per day × restock lead time) + safety buffer days. You can still change any
              product by hand later.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border text-sm">
            {changes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 tabular-nums">
                  <span className="text-muted-foreground line-through">{c.from}</span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                  <span className="font-semibold">{c.to}</span>
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={saving}
              onClick={() =>
                startSaving(async () => {
                  const result = await applyReorderPoints(changes.map((c) => ({ id: c.id, reorder_point: c.to })));
                  if (result.error) toast.error(result.error);
                  else {
                    toast.success(`Updated ${changes.length} reorder point${changes.length === 1 ? "" : "s"}`);
                    setOpen(false);
                  }
                })
              }
            >
              {saving && <Loader2Icon className="animate-spin" />}
              Update {changes.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
