"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckIcon, ImageOffIcon, Loader2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markRestockChecked, saveRestockAreas } from "../team-actions";

type Check = {
  id: string;
  name: string;
  at: string;
  reviewed: boolean;
  skipped: string | null;
  complete: boolean;
  photos: { area: string; url: string | null }[];
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Phoenix", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function RestockReview({ checks, showAll }: { checks: Check[]; showAll: boolean }) {
  const [zoom, setZoom] = useState<{ url: string; label: string } | null>(null);
  const [busy, start] = useTransition();

  return (
    <section aria-labelledby="checks-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="checks-title" className="font-heading text-base font-semibold">
          {showAll ? "Recent checks" : "Waiting for you"} <span className="ml-1 font-normal text-muted-foreground tabular-nums">{checks.length}</span>
        </h2>
        <Link href={showAll ? "/admin/staff/restock" : "/admin/staff/restock?show=all"} className="text-sm font-medium text-muted-foreground hover:text-foreground">
          {showAll ? "Only ones to check" : "Show checked ones too"}
        </Link>
      </div>

      {checks.length === 0 ? (
        <p className="rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">
          {showAll ? "No restock checks yet. They start the next time someone clocks out." : "All caught up. Every restock check has been looked at."}
        </p>
      ) : (
        <ul className="grid gap-4">
          {checks.map((c) => {
            const missing = c.photos.filter((p) => !p.url).length;
            return (
              <li key={c.id} className="overflow-hidden rounded-xl border bg-card">
                <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{when(c.at)}</p>
                  </div>
                  <span className={`text-sm font-medium ${c.complete ? "text-success" : "text-destructive"}`}>
                    {c.complete ? "All photos" : c.skipped ? "Skipped" : `${missing} missing`}
                  </span>
                  <Button
                    size="sm"
                    variant={c.reviewed ? "outline" : "default"}
                    disabled={busy}
                    onClick={() =>
                      start(async () => {
                        const r = await markRestockChecked(c.id, !c.reviewed);
                        if ("error" in r) toast.error(r.error);
                      })
                    }
                  >
                    {busy ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} {c.reviewed ? "Checked" : "Mark checked"}
                  </Button>
                </header>
                {c.skipped && <p className="border-b px-4 py-2.5 text-sm sm:px-5">They said: {c.skipped}</p>}
                <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                  {c.photos.map((p) => (
                    <figure key={p.area} className="bg-card p-2">
                      {p.url ? (
                        <button type="button" onClick={() => setZoom({ url: p.url!, label: `${c.name}: ${p.area}` })} className="block w-full overflow-hidden rounded-md">
                          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed photo link */}
                          <img src={p.url} alt={`${p.area}, restocked by ${c.name}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                        </button>
                      ) : (
                        <div className="grid aspect-[4/3] place-items-center rounded-md border border-dashed text-muted-foreground">
                          <ImageOffIcon className="size-5" />
                        </div>
                      )}
                      <figcaption className="mt-1.5 text-center text-xs font-medium">{p.area}</figcaption>
                    </figure>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {zoom && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" onClick={() => setZoom(null)}>
          <button type="button" aria-label="Close" className="absolute top-4 right-4 grid size-10 place-items-center rounded-md text-white hover:bg-white/10">
            <XIcon className="size-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed photo link */}
          <img src={zoom.url} alt={zoom.label} className="max-h-[88vh] max-w-full rounded-md object-contain" />
          <p className="absolute bottom-4 text-sm text-white">{zoom.label}</p>
        </div>
      )}
    </section>
  );
}

/** Which areas get a photo after each shift. */
export function RestockAreas({ areas }: { areas: string[] }) {
  const [text, setText] = useState(areas.join("\n"));
  const [busy, start] = useTransition();
  return (
    <section aria-labelledby="areas-title" className="mt-8 rounded-xl border bg-card p-4 sm:p-5">
      <h2 id="areas-title" className="font-heading text-base font-semibold">
        Areas to photograph
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">One per line, in the order employees walk through them. Up to 10.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="mt-3 w-full max-w-sm rounded-md border bg-background p-3 text-sm" />
      <div className="mt-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await saveRestockAreas(text);
              if ("error" in r) toast.error(r.error);
              else toast.success("Saved. The next clock-out uses this list.");
            })
          }
        >
          {busy ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Save areas
        </Button>
      </div>
    </section>
  );
}
