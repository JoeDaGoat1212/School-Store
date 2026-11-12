"use client";

import { useSyncExternalStore } from "react";
import { DownloadIcon } from "lucide-react";
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
// Already opened from the home screen? Then there's nothing to install.
const standalone = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const device = () => (/android/i.test(navigator.userAgent) ? "android" : /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone() ? "iphone" : "other");

export function InstallButton() {
  const kind = useSyncExternalStore(noChange, device, () => "other");
  const pill = "inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-bold text-primary-foreground";

  if (kind === "android") {
    return (
      <Link href="/work/download" className={pill}>
        <DownloadIcon className="size-4" /> Download app
      </Link>
    );
  }
  if (kind !== "iphone") return null;
  // iPhone: the steps to add this app to the home screen.
  return (
    <Link href="/work/download" className={pill}>
      <DownloadIcon className="size-4" /> Get the app
    </Link>
  );
}
