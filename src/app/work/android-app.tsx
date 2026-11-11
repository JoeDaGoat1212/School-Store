"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { DownloadIcon } from "lucide-react";

export { ANDROID_APP_URL } from "./app-link";

const noChange = () => () => {};
const isAndroid = () => /android/i.test(navigator.userAgent);

/** On Android phones: a link to the real app. Shown nowhere else (iPhones can't install it). */
export function AndroidApp() {
  const android = useSyncExternalStore(noChange, isAndroid, () => false);
  if (!android) return null;
  return (
    <Link href="/work/download" className="glass flex items-center gap-3 rounded-2xl px-4 py-3.5">
      <DownloadIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      <span className="flex-1">
        <span className="block font-medium">Get the Android app</span>
        <span className="block text-xs text-muted-foreground">Download it, open it, then tap Install. Tap here for the steps.</span>
      </span>
    </Link>
  );
}
