import type { Metadata } from "next";
import { ReceiptIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/staff/page-header";

export const metadata: Metadata = { title: "Expenses" };

// Placeholder — this page is built in phase 4.
export default function Page() {
  return (
    <>
      <PageHeader title="Expenses" />
      <EmptyState icon={ReceiptIcon} title="Coming in phase 4">
        Log shopping trips with receipts; saving adds stock.
      </EmptyState>
    </>
  );
}
