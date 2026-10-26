import type { Metadata } from "next";
import { SettingsIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/staff/page-header";

export const metadata: Metadata = { title: "Settings" };

// Placeholder — this page is built in phase 7.
export default function Page() {
  return (
    <>
      <PageHeader title="Settings" />
      <EmptyState icon={SettingsIcon} title="Coming in phase 7">
        Pickup windows, cutoff time, closed dates, banner, and your login.
      </EmptyState>
    </>
  );
}
