import type { Metadata } from "next";
import { ClipboardListIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/staff/page-header";

export const metadata: Metadata = { title: "Orders" };

// Placeholder — this page is built in phase 3.
export default function Page() {
  return (
    <>
      <PageHeader title="Orders" />
      <EmptyState icon={ClipboardListIcon} title="Coming in phase 3">
        The live order queue with status buttons, filters, and a printable prep list.
      </EmptyState>
    </>
  );
}
