"use client";

import { useRef, useState } from "react";
import { CameraIcon, CheckIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { restockPhoto, restockSkip } from "@/app/clock/restock-actions";
import { resizeImage } from "@/lib/resize-image";

export type RestockSession = { checkId: string; token: string; name: string; areas: string[]; done: string[]; period?: string | null };

/** "Snacks (right half)" → "right half of the snacks"; "Spicy chips" → "spicy chips". */
export function areaPhrase(area: string) {
  const m = area.match(/^(.+?)\s*\((.+)\)$/);
  return (m ? `${m[2]} of the ${m[1]}` : area).toLowerCase();
}

/*
 * The restock check: one area at a time ("1 of 6 · Drinks"), take a photo of
 * it fully stocked, it uploads, next area. The manager checks the photos on
 * Team → Restock checks. Used on the store tablet and in the web app.
 */
export function RestockWalkthrough({ session, onClose, dark = false }: { session: RestockSession; onClose: () => void; dark?: boolean }) {
  const [done, setDone] = useState<string[]>(session.done);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [why, setWhy] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const remaining = session.areas.filter((a) => !done.includes(a));
  const area = remaining[0];
  const step = session.areas.length - remaining.length + 1;

  const pick = async (file: File | undefined) => {
    if (!file || !area) return;
    setError(null);
    setBusy(true);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    try {
      const blob = await resizeImage(file, 1400);
      const form = new FormData();
      form.set("check", session.checkId);
      form.set("token", session.token);
      form.set("area", area);
      form.set("photo", new File([blob], "photo.webp", { type: "image/webp" }));
      const r = await restockPhoto(form);
      if ("error" in r && r.error) throw new Error(r.error);
      setDone((d) => [...d, area]);
      try {
        navigator.vibrate?.(40);
      } catch {
        // not supported
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That photo didn't upload. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const skip = async () => {
    setBusy(true);
    await restockSkip(session.checkId, session.token, why);
    setBusy(false);
    onClose();
  };

  const shell = dark ? "bg-[#17191c] text-white" : "bg-card text-foreground";
  const sub = dark ? "text-white/60" : "text-muted-foreground";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="restock-title" className={`grid w-full max-w-md gap-5 rounded-xl p-6 shadow-2xl ${shell}`}>
        <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

        {/* Progress: one segment per area */}
        <ol className="flex gap-1.5" aria-label={`${done.length} of ${session.areas.length} photos taken`}>
          {session.areas.map((a) => (
            <li key={a} className={`h-1 flex-1 rounded-full ${done.includes(a) ? "bg-success" : a === area ? "bg-[var(--brand)]" : dark ? "bg-white/15" : "bg-muted"}`} />
          ))}
        </ol>

        {!area ? (
          <div className="grid justify-items-center gap-3 py-4 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-success text-white">
              <CheckIcon className="size-6" strokeWidth={3} />
            </span>
            <h2 id="restock-title" className="text-2xl font-semibold">
              Restock photos sent
            </h2>
            <p className={`text-sm ${sub}`}>
              Thanks, {session.name.split(" ")[0]}. {session.areas.length} photos sent{session.period ? ` and stamped ${session.period}` : ""}. The manager will check them.
            </p>
            <button type="button" onClick={onClose} className={`mt-2 h-12 rounded-lg px-8 font-semibold ${dark ? "bg-white text-black" : "bg-foreground text-background"}`}>
              Done
            </button>
          </div>
        ) : skipping ? (
          <div className="grid gap-3">
            <h2 id="restock-title" className="text-xl font-semibold">
              Why can&apos;t you finish?
            </h2>
            <p className={`text-sm ${sub}`}>The manager will see this instead of the photos.</p>
            <textarea
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              maxLength={200}
              rows={3}
              placeholder="Out of ramen, nothing to restock with"
              className={`rounded-lg border p-3 text-base ${dark ? "border-white/15 bg-white/5 text-white placeholder:text-white/35" : "bg-background"}`}
            />
            <div className="flex gap-2">
              <button type="button" onClick={skip} disabled={busy} className={`h-12 flex-1 rounded-lg font-semibold ${dark ? "bg-white text-black" : "bg-foreground text-background"}`}>
                {busy ? <Loader2Icon className="mx-auto size-5 animate-spin" /> : "Send"}
              </button>
              <button type="button" onClick={() => setSkipping(false)} className={`h-12 rounded-lg px-5 font-medium ${sub}`}>
                Back
              </button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <p className={`text-sm ${sub}`}>
                Restock check, {step} of {session.areas.length}
              </p>
              <h2 id="restock-title" className="mt-1 text-3xl font-semibold">
                {area}
              </h2>
              <p className={`mt-2 ${sub}`}>Fill it all the way, then take a picture of the {areaPhrase(area)}.</p>
            </div>

            {preview && busy && (
              // eslint-disable-next-line @next/next/no-img-element -- a local photo that's uploading
              <img src={preview} alt="" className="max-h-56 w-full rounded-lg object-cover opacity-70" />
            )}
            {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}

            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={busy}
              className="flex h-16 items-center justify-center gap-2.5 rounded-lg bg-primary text-xl font-semibold text-primary-foreground transition active:translate-y-px disabled:opacity-60"
            >
              {busy ? <Loader2Icon className="size-6 animate-spin" /> : error ? <RotateCcwIcon className="size-6" /> : <CameraIcon className="size-6" />}
              {busy ? "Uploading…" : error ? "Try again" : `Photo of the ${areaPhrase(area)}`}
            </button>
            <button type="button" onClick={() => setSkipping(true)} className={`text-sm underline underline-offset-4 ${sub}`}>
              Can&apos;t finish the restock?
            </button>
          </>
        )}
      </div>
    </div>
  );
}
