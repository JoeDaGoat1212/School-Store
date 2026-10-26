import type { Metadata } from "next";
import { PackageIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/staff/page-header";

export const metadata: Metadata = { title: "Products" };

// Placeholder — this page is built in phase 2.
export default function Page() {
  return (
    <>
      <PageHeader title="Products" />
      <EmptyState icon={PackageIcon} title="Coming in phase 2">
        Add, edit, and archive products, with photos.
      </EmptyState>
    </>
  );
}
