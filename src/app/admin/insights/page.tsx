import type { Metadata } from "next";
import { BarChart3Icon } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/staff/page-header";

export const metadata: Metadata = { title: "Insights" };

// Placeholder — this page is built in phase 6.
export default function Page() {
  return (
    <>
      <PageHeader title="Insights" />
      <EmptyState icon={BarChart3Icon} title="Coming in phase 6">
        Revenue, spending, profit, margins, and best sellers.
      </EmptyState>
    </>
  );
}
