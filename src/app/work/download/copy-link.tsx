"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          window.prompt("Copy this link:", url);
        }
      }}
      className="flex h-12 items-center justify-center gap-2 rounded-xl bg-white/[0.08] font-semibold ring-1 ring-white/15"
    >
      {copied ? <CheckIcon className="size-4 text-[var(--nest)]" /> : <CopyIcon className="size-4" />}
      {copied ? "Copied. Paste it into Chrome." : "Copy the download link"}
    </button>
  );
}
