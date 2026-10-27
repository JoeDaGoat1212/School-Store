"use client";

import { ErrorPanel } from "@/components/error-panel";

// Shown inside the student layout when a student page crashes.
export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel error={error} reset={reset} homeHref="/" homeLabel="Back to the menu" />;
}
