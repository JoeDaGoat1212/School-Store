"use client";

import { useState, useSyncExternalStore } from "react";
import { DownloadIcon, ShareIcon, XIcon } from "lucide-react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/* Android/Chrome/Edge hand the page an install prompt; iPhones don't, so they get directions instead. */
let saved: InstallPrompt | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    saved = e as InstallPrompt;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    saved = null;
    listeners.forEach((l) => l());
  });
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const noChange = () => () => {};

/** An iPhone or iPad where the app isn't on the Home Screen yet. */
function iphoneNotInstalled() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone;
}

/** "Install app" in the header, or Add to Home Screen directions on iPhone. Hidden once it's installed. */
export function InstallButton() {
  const prompt = useSyncExternalStore(subscribe, () => saved, () => null);
  const ios = useSyncExternalStore(noChange, iphoneNotInstalled, () => false);
  const [help, setHelp] = useState(false);

  if (prompt) {
    return (
      <button
        type="button"
        onClick={async () => {
          await prompt.prompt();
          await prompt.userChoice;
          saved = null;
          listeners.forEach((l) => l());
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-bold text-primary-foreground"
      >
        <DownloadIcon className="size-4" /> Install app
      </button>
    );
  }

  if (!ios) return null;

  return (
    <>
      <button type="button" onClick={() => setHelp(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-bold text-primary-foreground">
        <DownloadIcon className="size-4" /> Get the app
      </button>
      {help && (
        <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 rounded-2xl border bg-card p-4 shadow-2xl" role="dialog" aria-label="Add to Home Screen">
          <button type="button" onClick={() => setHelp(false)} aria-label="Close" className="absolute top-2 right-2 grid size-8 place-items-center rounded-full hover:bg-muted">
            <XIcon className="size-4" />
          </button>
          <p className="font-semibold">Put the app on your Home Screen</p>
          <ol className="mt-2 grid list-decimal gap-1 pl-5 text-sm">
            <li>
              In Safari, tap <ShareIcon className="inline size-4 align-text-bottom" /> <strong>Share</strong> at the bottom.
            </li>
            <li>
              Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
            </li>
          </ol>
        </div>
      )}
    </>
  );
}
