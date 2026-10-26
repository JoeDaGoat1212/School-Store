import type { Metadata } from "next";
import { FileUpIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/staff/page-header";

export const metadata: Metadata = { title: "Sales import" };

// Placeholder — this page is built in phase 5.
export default function Page() {
  return (
    <>
      <PageHeader title="Sales import" />
      <EmptyState icon={FileUpIcon} title="Coming in phase 5">
        Upload the InTouchPay export, match columns, preview, and undo.
      </EmptyState>
    </>
  );
}
