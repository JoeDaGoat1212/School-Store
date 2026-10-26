import type { Metadata } from "next";
import { BoxesIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/staff/page-header";

export const metadata: Metadata = { title: "Inventory" };

// Placeholder — this page is built in phase 4.
export default function Page() {
  return (
    <>
      <PageHeader title="Inventory" />
      <EmptyState icon={BoxesIcon} title="Coming in phase 4">
        Stock levels, adjustments, expiration dates, and the shopping list.
      </EmptyState>
    </>
  );
}
