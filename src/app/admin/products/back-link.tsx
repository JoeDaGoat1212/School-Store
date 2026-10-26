import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

/** "‹ Products" link at the top of the add/edit pages. */
export function BackLink() {
  return (
    <Link
      href="/admin/products"
      className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ChevronLeftIcon className="size-4" /> Products
    </Link>
  );
}
