"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { formatTime } from "@/lib/format";

/**
 * Keeps the dashboard current while it's open: it reloads its numbers every
 * minute (only while you're looking at it), and the button reloads right away.
 */
export function AutoRefresh({ loadedAt }: { loadedAt: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  useEffect(() => {
    const reload = () => {
      if (document.visibilityState === "visible") start(() => router.refresh());
    };
    const timer = setInterval(reload, 60_000);
    // Coming back to the tab after a while: catch up straight away.
    document.addEventListener("visibilitychange", reload);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [router]);

  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      title="Updates by itself every minute"
    >
      <RefreshCwIcon className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Updating…" : `Updated ${formatTime(loadedAt)}`}
    </button>
  );
}
