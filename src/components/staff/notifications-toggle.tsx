"use client";

import { useState, useSyncExternalStore } from "react";
import { BellIcon, BellOffIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

/*
 * "Turn on notifications" for this phone or computer (web push). On iPhone it
 * only works from the Home Screen app, so there it explains how instead.
 */

const noChange = () => () => {};
function support(): "yes" | "iphone-browser" | "no" {
  if (typeof window === "undefined") return "no";
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone) return "iphone-browser";
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "yes" : "no";
}
const permission = () => (typeof Notification === "undefined" ? "default" : Notification.permission);

function keyBytes(b64url: string) {
  const s = atob(b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function NotificationsToggle({
  vapidKey,
  save,
  remove,
  compact = false,
}: {
  vapidKey: string | null;
  save: (sub: Sub) => Promise<{ ok?: true; error?: string }>;
  remove: (endpoint: string) => Promise<unknown>;
  compact?: boolean;
}) {
  const can = useSyncExternalStore(noChange, support, () => "no" as const);
  const perm = useSyncExternalStore(noChange, permission, () => "default" as NotificationPermission);
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  if (!vapidKey || can === "no") return null;
  if (can === "iphone-browser") {
    return compact ? null : (
      <p className="text-xs text-muted-foreground">
        For notifications on iPhone, add this page to your Home Screen (Share, then Add to Home Screen) and open it from there.
      </p>
    );
  }

  const enabled = on ?? perm === "granted";

  const turnOn = async () => {
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      if (result !== "granted") {
        toast.error("Notifications are blocked. Allow them in your browser's site settings.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }));
      const json = sub.toJSON() as Sub;
      const r = await save({ endpoint: json.endpoint, keys: json.keys });
      if (r.error) throw new Error(r.error);
      setOn(true);
      toast.success("Notifications are on for this device");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't turn on notifications.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await remove(sub.endpoint);
        await sub.unsubscribe();
      }
      setOn(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={enabled ? turnOff : turnOn}
      disabled={busy}
      className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
    >
      {busy ? <Loader2Icon className="size-4 animate-spin" /> : enabled ? <BellIcon className="size-4" /> : <BellOffIcon className="size-4" />}
      {enabled ? "Notifications on" : "Turn on notifications"}
    </button>
  );
}
