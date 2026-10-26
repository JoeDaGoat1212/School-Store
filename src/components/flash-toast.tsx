"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/**
 * Shows a toast after a redirect. A server action redirects to
 * `/some/page?saved=Hot Cheetos`, and
 *   <FlashToast param="saved" text="Saved {value}" />
 * shows "Saved Hot Cheetos", then removes `?saved=` from the address bar.
 *
 * Wrap it in <Suspense> on the page (it reads the address bar).
 */
export function FlashToast({ param, text }: { param: string; text: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get(param);

  useEffect(() => {
    if (!value) return;
    toast.success(text.replace("{value}", value));
    const rest = new URLSearchParams(params);
    rest.delete(param);
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [value, text, param, params, pathname, router]);

  return null;
}
