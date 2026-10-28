"use client";

import { useActionState, useRef, useState } from "react";
import { CheckCircle2Icon, Loader2Icon, PlusIcon, SendIcon } from "lucide-react";
import { requestItem, type RequestState } from "@/app/(public)/actions";
import type { PopularRequest } from "@/lib/member";
import { cn } from "@/lib/utils";

const CATEGORIES = ["Drinks", "Snacks", "Candy", "Hot food", "Other"];

/**
 * "What should we sell?" A student types an item (and, if they like, a
 * category, a note and their first name) and it goes to the staff's
 * Requests page. Below, what others have asked for, with a "me too" button.
 */
export function RequestForm({
  popular,
  source = "web",
  dark = false,
}: {
  popular: PopularRequest[];
  /** Where it was sent from: the 3D store's request table, or the website. */
  source?: "store3d" | "web";
  /** Light text, for dark backgrounds. */
  dark?: boolean;
}) {
  const [state, action, sending] = useActionState<RequestState, FormData>(requestItem, {});
  const [category, setCategory] = useState("");
  const [again, setAgain] = useState(0); // bumps when they ask for something else
  // The answer they closed with "Ask for something else" (so its thank-you hides).
  const [dismissed, setDismissed] = useState<RequestState | null>(null);
  const shownDone = state !== dismissed ? state.done : undefined;
  const itemRef = useRef<HTMLInputElement>(null);

  const muted = dark ? "text-white/65" : "text-muted-foreground";
  const field = cn(
    "h-11 w-full rounded-xl border-2 px-3 text-base outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
    dark ? "border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-white/60" : "border-input bg-background focus:border-foreground",
  );

  if (shownDone) {
    const others = shownDone.count - 1;
    return (
      <div className="grid gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <p className="flex items-center gap-2 font-semibold text-teal-ink">
          <CheckCircle2Icon className="size-5" /> {shownDone.already ? "You already asked for this one" : "Request sent!"}
        </p>
        <p className="font-heading text-3xl leading-tight font-extrabold">
          {others > 0 ? (
            <>
              You and {others} other{others === 1 ? "" : "s"} want {shownDone.item}.
            </>
          ) : (
            <>You&apos;re the first to ask for {shownDone.item}.</>
          )}
        </p>
        <p className={cn("text-sm", muted)}>
          {shownDone.status === "stocked"
            ? "Good news: we sell it now!"
            : shownDone.status === "planned"
              ? "It's on our list: coming soon."
              : "The store team checks requests every week. The more people ask, the sooner it shows up."}
        </p>
        <button
          type="button"
          onClick={() => {
            setDismissed(state);
            setAgain((n) => n + 1);
            setTimeout(() => itemRef.current?.focus(), 0);
          }}
          className={cn(
            "inline-flex h-11 w-fit items-center gap-2 rounded-full border-2 px-5 font-semibold transition-colors",
            dark ? "border-white/40 hover:bg-white hover:text-black" : "border-foreground hover:bg-foreground hover:text-background",
          )}
        >
          <PlusIcon className="size-4" /> Ask for something else
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <form key={again} action={action} className="grid gap-4" noValidate>
        <input type="hidden" name="source" value={source} />
        <input type="hidden" name="category" value={category} />
        <div className="grid gap-1.5">
          <label htmlFor={`req-item-${source}`} className="text-sm font-semibold">
            What should we sell?
          </label>
          <input
            ref={itemRef}
            id={`req-item-${source}`}
            name="item"
            maxLength={60}
            autoComplete="off"
            placeholder="Takis Blue Heat, Gatorade Zero…"
            aria-invalid={Boolean(state.errors?.item)}
            className={field}
          />
          {state.errors?.item && <p className="text-sm font-medium text-destructive">{state.errors.item}</p>}
        </div>

        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-semibold">What kind? (optional)</legend>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(category === c ? "" : c)}
                className={cn(
                  "h-9 rounded-full border-2 px-3.5 text-sm font-semibold transition-colors",
                  category === c
                    ? dark
                      ? "border-white bg-white text-black"
                      : "border-foreground bg-foreground text-background"
                    : dark
                      ? "border-white/25 hover:border-white/60"
                      : "border-border hover:border-foreground/40",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-1.5">
          <label htmlFor={`req-note-${source}`} className="text-sm font-semibold">
            Flavor, size, anything else? (optional)
          </label>
          <input id={`req-note-${source}`} name="note" maxLength={200} autoComplete="off" placeholder="The 1 oz bags" className={field} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`req-name-${source}`} className="text-sm font-semibold">
            Your first name (optional)
          </label>
          <input id={`req-name-${source}`} name="requester" maxLength={60} autoComplete="given-name" className={field} />
        </div>

        {state.message && !state.errors?.item && <p className="text-sm font-medium text-destructive">{state.message}</p>}
        <button
          type="submit"
          disabled={sending}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60"
        >
          {sending ? <Loader2Icon className="size-5 animate-spin" /> : <SendIcon className="size-5" />}
          {sending ? "Sending…" : "Send request"}
        </button>
      </form>

      {popular.length > 0 && (
        <section aria-labelledby={`popular-${source}`}>
          <h3 id={`popular-${source}`} className="text-sm font-semibold">
            Others are asking for
          </h3>
          <ul className="mt-2 grid gap-1.5">
            {popular.map((p) => (
              <li key={p.key}>
                <form action={action} className="flex items-center gap-2">
                  <input type="hidden" name="item" value={p.name} />
                  <input type="hidden" name="source" value={source} />
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  {p.status !== "new" && (
                    <span className="shrink-0 rounded-full bg-teal/20 px-2 py-0.5 text-xs font-semibold text-teal-ink">
                      {p.status === "stocked" ? "Now selling" : "Coming soon"}
                    </span>
                  )}
                  <span className={cn("shrink-0 text-sm tabular-nums", muted)}>
                    {p.count} {p.count === 1 ? "ask" : "asks"}
                  </span>
                  {p.status !== "stocked" && (
                    <button
                      type="submit"
                      disabled={sending}
                      aria-label={`Me too: ${p.name}`}
                      className={cn(
                        "h-8 shrink-0 rounded-full border-2 px-3 text-xs font-bold transition-colors",
                        dark ? "border-white/30 hover:bg-white hover:text-black" : "border-foreground/30 hover:border-foreground hover:bg-foreground hover:text-background",
                      )}
                    >
                      +1 me too
                    </button>
                  )}
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
