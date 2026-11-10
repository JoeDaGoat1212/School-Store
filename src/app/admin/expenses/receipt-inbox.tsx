"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CameraIcon, CheckIcon, FileTextIcon, Loader2Icon, ReceiptIcon, Trash2Icon } from "lucide-react";
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
    <section id="receipts" aria-labelledby="inbox-title" className="mb-8 rounded-3xl border border-primary/40 bg-primary/5 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="inbox-title" className="flex items-center gap-2 font-heading text-xl font-bold">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <CameraIcon className="size-5" />
          </span>
          Receipts to enter
          <span className="rounded-full bg-primary px-2 py-0.5 text-sm text-black">{receipts.length}</span>
        </h2>
        <p className="text-sm text-muted-foreground">Snapped at the store. Make each one a shopping trip so its items go into stock.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {receipts.map((r) => (
          <li key={r.id} className="flex gap-3 rounded-2xl border bg-card p-3 shadow-soft">
            <button
              type="button"
              onClick={() => r.url && !r.isPdf && setZoom(r.url)}
              className="grid h-28 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted"
              aria-label="Show the receipt bigger"
            >
              {r.url && !r.isPdf ? (
                // eslint-disable-next-line @next/next/no-img-element -- a private, signed receipt link
                <img src={r.url} alt="" className="h-full w-full object-cover" />
              ) : r.isPdf ? (
                <FileTextIcon className="size-8 text-muted-foreground" />
              ) : (
                <ReceiptIcon className="size-8 text-muted-foreground" />
              )}
            </button>
            <div className="grid min-w-0 flex-1 content-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {r.store ?? "Store?"}
                  {r.totalCents !== null && <span className="ml-1.5 font-heading text-ember-ink">{formatCents(r.totalCents)}</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatDay(r.shoppedOn)}
                  {r.shopper && ` · ${r.shopper}`}
                </p>
                {r.note && <p className="mt-1 line-clamp-2 text-xs">{r.note}</p>}
              </div>
              {confirm === r.id ? (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  Delete this photo?
                  <Button size="xs" variant="destructive" disabled={busy} onClick={() => run(() => deleteReceipt(r.id), "Receipt deleted")}>
                    Delete
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setConfirm(null)}>
                    Keep
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
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
          <img src={zoom} alt="Receipt" className="max-h-[90vh] max-w-full rounded-xl object-contain" />
        </div>
      )}
    </section>
  );
}
