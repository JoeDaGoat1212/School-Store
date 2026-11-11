"use client";

import { useState, useSyncExternalStore } from "react";
import { DownloadIcon, XIcon } from "lucide-react";
import Link from "next/link";

/*
 * The header's "Download app" button: opens /work/download (the real Android app, an .apk, with install steps), not
 * "Add to Home Screen". Chrome's own "install this website" prompt is turned
 * off so employees only ever see the real download.
 */
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => e.preventDefault());
}

const noChange = () => () => {};
const device = () => (/android/i.test(navigator.userAgent) ? "android" : /iphone|ipad|ipod/i.test(navigator.userAgent) ? "iphone" : "other");

export function InstallButton() {
  const kind = useSyncExternalStore(noChange, device, () => "other");
  const [help, setHelp] = useState(false);
  const pill = "inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-bold text-primary-foreground";

  if (kind === "android") {
    return (
      <Link href="/work/download" className={pill}>
        <DownloadIcon className="size-4" /> Download app
      </Link>
    );
  }
  if (kind !== "iphone") return null;

  return (
    <>
      <button type="button" onClick={() => setHelp(true)} className={pill}>
        <DownloadIcon className="size-4" /> Get the app
      </button>
      {help && (
        <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 rounded-2xl border bg-card p-4 shadow-2xl" role="dialog" aria-label="The iPhone app">
          <button type="button" onClick={() => setHelp(false)} aria-label="Close" className="absolute top-2 right-2 grid size-8 place-items-center rounded-full hover:bg-muted">
            <XIcon className="size-4" />
          </button>
          <p className="font-semibold">The download is Android only for now</p>
          <p className="mt-2 pr-6 text-sm text-muted-foreground">
            iPhones only install apps from the App Store, so there&apos;s no download for iPhone yet. Keep using this page in Safari: everything works here.
          </p>
        </div>
      )}
    </>
  );
}
