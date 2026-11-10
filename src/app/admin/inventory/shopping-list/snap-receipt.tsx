"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CameraIcon, CheckCircle2Icon, ImageIcon, Loader2Icon, RotateCcwIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RECEIPT_BUCKET } from "@/lib/photos";
import { resizeImage } from "@/lib/resize-image";
import { createClient } from "@/lib/supabase/client";
import { saveReceipt } from "../../expenses/receipt-actions";

const SHOPPER_KEY = "receipt-shopper";

/**
 * "Snap receipt": on a phone this opens the camera. The photo is shrunk,
 * uploaded to the private receipts storage, and listed under Expenses →
 * Receipts to enter, where it becomes a shopping trip later.
 */
export function SnapReceipt({ stores }: { stores: string[] }) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [store, setStore] = useState("");
  const [total, setTotal] = useState("");
  const [shopper, setShopper] = useState(() => {
    try {
      return (typeof window !== "undefined" && localStorage.getItem(SHOPPER_KEY)) || "";
    } catch {
      return "";
    }
  });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(0);

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setTotal("");
    setNote("");
  };

  const save = async () => {
    if (!file) return;
    setSaving(true);
    try {
      const isImage = file.type.startsWith("image/") && file.type !== "image/heic";
      const body = isImage ? await resizeImage(file, 1800) : file;
      const ext = isImage ? "webp" : (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const now = new Date();
      const path = `inbox/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${ext}`;
      const { error } = await createClient()
        .storage.from(RECEIPT_BUCKET)
        .upload(path, body, { contentType: isImage ? "image/webp" : file.type || "image/jpeg" });
      if (error) throw new Error(error.message);
      const r = await saveReceipt({ path, store, total, shopper, note });
      if (r.error) throw new Error(r.error);
      try {
        localStorage.setItem(SHOPPER_KEY, shopper);
      } catch {
        // fine
      }
      setSaved((n) => n + 1);
      reset();
      toast.success("Receipt saved");
    } catch (e) {
      toast.error(`Couldn't save the receipt: ${e instanceof Error ? e.message : "try again"}`);
    } finally {
      setSaving(false);
    }
  };

  // Show the photo they just took.
  const pick = (f: File | undefined) => {
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  return (
    <section aria-labelledby="snap-title" className="no-print relative isolate mt-6 overflow-hidden rounded-3xl bg-neutral-950 p-5 text-white shadow-soft sm:p-6">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 -z-10 size-72 rounded-full bg-primary/35 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 -z-10 size-64 rounded-full bg-teal/25 blur-3xl" />

      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={library} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

      {!file ? (
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <h2 id="snap-title" className="font-heading text-2xl font-bold tracking-wide uppercase">
              At the store?
            </h2>
            <p className="mt-1 text-sm text-white/70">
              After you pay, take a picture of the receipt. It&apos;s saved for the manager to enter.
              {saved > 0 && (
                <span className="mt-1 flex items-center gap-1.5 font-semibold text-success">
                  <CheckCircle2Icon className="size-4" /> {saved} receipt{saved === 1 ? "" : "s"} saved.{" "}
                  <Link href="/admin/expenses#receipts" className="underline underline-offset-4">
                    See them
                  </Link>
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => camera.current?.click()}
              className="inline-flex h-14 items-center gap-2.5 rounded-2xl bg-primary px-6 font-heading text-xl font-bold tracking-wide text-primary-foreground uppercase shadow-[0_10px_40px_-10px_var(--primary)] transition active:scale-[0.98]"
            >
              <CameraIcon className="size-6" /> Snap receipt
            </button>
            <button
              type="button"
              onClick={() => library.current?.click()}
              className="inline-flex h-14 items-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-4 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            >
              <ImageIcon className="size-5" /> From photos
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,200px)_1fr]">
          <div className="relative overflow-hidden rounded-2xl bg-white/10">
            {preview && file.type !== "application/pdf" ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local photo that isn't uploaded yet
              <img src={preview} alt="The receipt you just took" className="max-h-80 w-full object-contain" />
            ) : (
              <p className="p-6 text-center text-sm">{file.name}</p>
            )}
            <button
              type="button"
              onClick={() => camera.current?.click()}
              className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold backdrop-blur"
            >
              <RotateCcwIcon className="size-3.5" /> Retake
            </button>
          </div>
          <div className="grid content-start gap-3">
            <h2 id="snap-title" className="font-heading text-xl font-bold">
              Add a few details <span className="text-sm font-normal text-white/60">(all optional)</span>
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs font-semibold text-white/80">
                Store
                <input
                  list="receipt-stores"
                  value={store}
                  onChange={(e) => setStore(e.target.value)}
                  maxLength={60}
                  placeholder="Costco"
                  className="h-11 rounded-xl border border-white/15 bg-white/10 px-3 text-base text-white placeholder:text-white/40"
                />
                <datalist id="receipt-stores">
                  {stores.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-white/80">
                Total
                <span className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-white/50">$</span>
                  <input
                    inputMode="decimal"
                    value={total}
                    onChange={(e) => setTotal(e.target.value)}
                    placeholder="84.17"
                    className="h-11 w-full rounded-xl border border-white/15 bg-white/10 pr-3 pl-7 text-base text-white placeholder:text-white/40"
                  />
                </span>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-white/80">
                Who shopped
                <input
                  value={shopper}
                  onChange={(e) => setShopper(e.target.value)}
                  maxLength={60}
                  placeholder="Mr. Lopez"
                  className="h-11 rounded-xl border border-white/15 bg-white/10 px-3 text-base text-white placeholder:text-white/40"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-white/80">
                Note
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={200}
                  placeholder="Out of Takis"
                  className="h-11 rounded-xl border border-white/15 bg-white/10 px-3 text-base text-white placeholder:text-white/40"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={saving} className="h-12 flex-1 rounded-xl text-base font-bold">
                {saving ? <Loader2Icon className="animate-spin" /> : <CheckCircle2Icon />} Save receipt
              </Button>
              <Button variant="ghost" onClick={reset} disabled={saving} className="h-12 rounded-xl text-white hover:bg-white/10 hover:text-white">
                <XIcon /> Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
