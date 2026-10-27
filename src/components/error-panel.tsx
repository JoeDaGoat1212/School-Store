"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * What people see when a page crashes. It says what happened in plain words
 * and offers a retry. The technical details go to the browser console for
 * whoever is fixing it.
 */
export function ErrorPanel({
  error,
  reset,
  homeHref,
  homeLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref: string;
  homeLabel: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto grid max-w-md justify-items-center gap-3 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlertIcon className="size-6" />
      </span>
      <h1 className="font-heading text-2xl font-bold">This page couldn&apos;t load</h1>
      <p className="text-muted-foreground">
        Something went wrong on our side. Try again; if it keeps happening, the internet connection or the database may be
        down for a moment.
      </p>
      {error.digest && <p className="font-mono text-xs text-muted-foreground">Error code {error.digest}</p>}
      <div className="mt-2 flex gap-2">
        <Button onClick={reset}>
          <RotateCcwIcon /> Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href={homeHref}>{homeLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
