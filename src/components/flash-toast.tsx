"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/**
 * Shows a toast after a redirect. A server action redirects to
 * `/some/page?saved=Hot Cheetos` and this shows "Saved Hot Cheetos",
 * then removes `?saved=` from the address bar.
 */
export function FlashToast({ param = "saved", message }: { param?: string; message: (value: string) => string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get(param);

  useEffect(() => {
    if (!value) return;
    toast.success(message(value));
    const rest = new URLSearchParams(params);
    rest.delete(param);
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [value, message, param, params, pathname, router]);

  return null;
}
