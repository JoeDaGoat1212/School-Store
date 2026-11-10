"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckIcon, FileTextIcon, Loader2Icon, ReceiptIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatCents, formatDay } from "@/lib/format";
import { deleteReceipt, dismissReceipt } from "./receipt-actions";

export type InboxReceipt = {
  id: string;
  url: string | null;
  isPdf: boolean;
  store: string | null;
  totalCents: number | null;
  shopper: string | null;
  note: string | null;
  shoppedOn: string;
};

/** Receipt photos snapped at the store that haven't become a shopping trip yet. */
export function ReceiptInbox({ receipts }: { receipts: InboxReceipt[] }) {
  const [busy, start] = useTransition();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const run = (job: () => Promise<{ error?: string }>, ok: string) =>
    start(async () => {
      const r = await job();
      if (r.error) toast.error(r.error);
      else toast.success(ok);
      setConfirm(null);
    });

  return (
    <section id="receipts" aria-labelledby="inbox-title" className="mb-8 overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-4 py-3 sm:px-5">
        <h2 id="inbox-title" className="font-heading text-base font-semibold">
          Receipts to enter <span className="ml-1 font-normal text-muted-foreground tabular-nums">{receipts.length}</span>
        </h2>
        <p className="text-sm text-muted-foreground">Photos taken at the store. Make each one a shopping trip so its items go into stock.</p>
      </div>
      <ul className="divide-y">
        {receipts.map((r) => (
          <li key={r.id} className="flex items-center gap-4 px-4 py-3 sm:px-5">
            <button
              type="button"
              onClick={() => r.url && !r.isPdf && setZoom(r.url)}
              className="grid h-16 w-12 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted"
              aria-label="Show the receipt bigger"
            >
              {r.url && !r.isPdf ? (
                // eslint-disable-next-line @next/next/no-img-element -- a private, signed receipt link
                <img src={r.url} alt="" className="h-full w-full object-cover" />
              ) : r.isPdf ? (
                <FileTextIcon className="size-5 text-muted-foreground" />
              ) : (
                <ReceiptIcon className="size-5 text-muted-foreground" />
              )}
            </button>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {r.store ?? "Store not given"}
                  {r.totalCents !== null && <span className="ml-2 tabular-nums">{formatCents(r.totalCents)}</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatDay(r.shoppedOn)}
                  {r.shopper && `, ${r.shopper}`}
                  {r.note && `. ${r.note}`}
                </p>
              </div>
              {confirm === r.id ? (
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  Delete this photo?
                  <Button size="xs" variant="destructive" disabled={busy} onClick={() => run(() => deleteReceipt(r.id), "Receipt deleted")}>
                    Delete
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setConfirm(null)}>
                    Keep
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Button asChild size="sm">
                    <Link href={`/admin/expenses/new?receipt=${r.id}`}>Make expense</Link>
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Already entered"
                    aria-label="Already entered"
                    disabled={busy}
                    onClick={() => run(() => dismissReceipt(r.id), "Marked as entered")}
                  >
                    {busy ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
                  </Button>
                  <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label="Delete receipt" onClick={() => setConfirm(r.id)}>
                    <Trash2Icon />
                  </Button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {zoom && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setZoom(null)} role="dialog" aria-label="Receipt">
          {/* eslint-disable-next-line @next/next/no-img-element -- a private, signed receipt link */}
          <img src={zoom} alt="Receipt" className="max-h-[90vh] max-w-full rounded-md object-contain" />
        </div>
      )}
    </section>
  );
}
