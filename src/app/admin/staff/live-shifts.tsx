"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Listens for clock-ins and clock-outs (from the time clock or a phone) and
 * reloads the page's numbers right away. Uses Supabase Realtime; only the
 * admin can read timecards, so only the admin hears about them. Shows a
 * small "Live" light while connected.
 */
export function LiveShifts({ label = "Live" }: { label?: string }) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("staff-shifts")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_shifts" }, () => {
        // Several changes at once (e.g. "clock everyone out") → one reload.
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), 400);
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${live ? "text-success" : "text-muted-foreground"}`}
      title={live ? "Updates the moment someone clocks in or out" : "Connecting…"}
    >
      <span aria-hidden className={`size-2 rounded-full ${live ? "animate-pulse bg-success" : "bg-muted-foreground/40"}`} />
      {live ? label : "Connecting…"}
    </span>
  );
}
