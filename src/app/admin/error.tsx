"use client";

import { ErrorPanel } from "@/components/error-panel";

// Shown inside the staff layout when a staff page crashes.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel error={error} reset={reset} homeHref="/admin" homeLabel="Go to dashboard" />;
}
