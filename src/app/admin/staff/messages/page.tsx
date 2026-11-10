import type { Metadata } from "next";
import { PageHeader } from "@/components/staff/page-header";
import { requireAdmin } from "@/lib/auth";
import { fcmAccount, vapidKeys } from "@/lib/push";
import { createSecretClient } from "@/lib/supabase/server";
import { StaffTabs } from "../staff-tabs";
import { AdminMessages, AdminNotifications, FirebaseSetup } from "./admin-messages";

export const metadata: Metadata = { title: "Messages" };

/** Chat with the team: Everyone, one-on-one, and group chats (database update 20). */
export default async function MessagesPage(props: PageProps<"/admin/staff/messages">) {
  await requireAdmin();
  const params = await props.searchParams;
  const chat = typeof params.chat === "string" && /^[0-9a-f-]{36}$/.test(params.chat) ? params.chat : null;
  const [keys, firebase, phones] = await Promise.all([
    vapidKeys(),
    fcmAccount(),
    createSecretClient().from("push_subscriptions").select("id", { count: "exact", head: true }).like("endpoint", "fcm:%"),
  ]);
  return (
    <>
      <PageHeader
        title="Messages"
        description="Message one employee, a group, or everyone. Employees see these in the app and get a notification."
        actions={<AdminNotifications vapidKey={keys?.publicKey ?? null} />}
      />
      <StaffTabs />
      <AdminMessages initialChat={chat} />
      <FirebaseSetup project={firebase?.project_id ?? null} phones={phones.count ?? 0} />
    </>
  );
}
