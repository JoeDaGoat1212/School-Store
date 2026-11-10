"use client";

import { useSyncExternalStore } from "react";
import { DownloadIcon } from "lucide-react";

/** Where the Android app's newest download always lives (built by .github/workflows/mobile.yml). */
export const ANDROID_APP_URL = "https://github.com/JoeDaGoat1212/School-Store/releases/latest/download/firebirds-nest-staff.apk";

const noChange = () => () => {};
const isAndroid = () => /android/i.test(navigator.userAgent);

/** On Android phones: a link to the real app. Shown nowhere else (iPhones can't install it). */
export function AndroidApp() {
  const android = useSyncExternalStore(noChange, isAndroid, () => false);
  if (!android) return null;
  return (
    <a href={ANDROID_APP_URL} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3.5">
      <DownloadIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      <span className="flex-1">
        <span className="block font-medium">Get the Android app</span>
        <span className="block text-xs text-muted-foreground">Download it, open it, then tap Install. Android may ask you to allow installs from your browser first.</span>
      </span>
    </a>
  );
}
