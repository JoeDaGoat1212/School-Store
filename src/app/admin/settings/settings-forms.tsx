"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { changePassword, saveInventorySettings, saveOrderingRules, saveStoreInfo } from "./actions";
import { SectionForm, SettingField } from "./section-form";

export type StoreSettings = {
  store_hours: string;
  pickup_location: string;
  banner_text: string | null;
  order_cutoff_time: string;
  order_lead_minutes: number;
  max_orders_per_student_day: number;
  max_items_per_order: number;
  max_orders_per_hour_per_device: number;
  sales_average_days: number;
  reorder_buffer_days: number;
  shopping_interval_days: number;
  next_shopping_date: string | null;
  order_retention_days: number;
};

/** Value for a field: what was typed (after a failed save), else the saved value. */
const pick = (typed: Record<string, string>, name: string, saved: string | number | null) => typed[name] ?? String(saved ?? "");

export function StoreInfoForm({ s }: { s: StoreSettings }) {
  return (
    <SectionForm
      id="store"
      title="Store info"
      description="Shown on the student menu. The store name, colors and logo are set in src/config/brand.ts."
      action={saveStoreInfo}
    >
      {(errors, typed) => (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <SettingField name="store_hours" label="Hours" defaultValue={pick(typed, "store_hours", s.store_hours)} error={errors.store_hours} maxLength={120} />
            <SettingField
              name="pickup_location"
              label="Pickup location"
              defaultValue={pick(typed, "pickup_location", s.pickup_location)}
              error={errors.pickup_location}
              maxLength={120}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="setting-banner_text">Announcement banner</Label>
            <Textarea
              id="setting-banner_text"
              name="banner_text"
              rows={2}
              maxLength={160}
              defaultValue={pick(typed, "banner_text", s.banner_text)}
              placeholder="e.g. New: Uncrustables are back! (leave empty to hide the banner)"
              aria-invalid={Boolean(errors.banner_text)}
            />
            <p className={cn("text-xs", errors.banner_text ? "font-medium text-destructive" : "text-muted-foreground")}>
              {errors.banner_text ?? "A yellow strip at the top of the menu. Leave empty to hide it."}
            </p>
          </div>
        </>
      )}
    </SectionForm>
  );
}

export function OrderingForm({ s }: { s: StoreSettings }) {
  return (
    <SectionForm id="ordering" title="Ordering rules" description="When students can order and how much." action={saveOrderingRules}>
      {(errors, typed) => (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <SettingField
            name="order_cutoff_time"
            label="Same-day cutoff"
            type="time"
            defaultValue={pick(typed, "order_cutoff_time", s.order_cutoff_time.slice(0, 5))}
            error={errors.order_cutoff_time}
            hint="No more orders for today after this time."
          />
          <SettingField
            name="order_lead_minutes"
            label="Order ahead by"
            type="number"
            inputMode="numeric"
            suffix="minutes"
            defaultValue={pick(typed, "order_lead_minutes", s.order_lead_minutes)}
            error={errors.order_lead_minutes}
            hint="A pickup time closes this long before it starts, so there's time to pack."
          />
          <SettingField
            name="max_items_per_order"
            label="Items per order"
            type="number"
            inputMode="numeric"
            suffix="max"
            defaultValue={pick(typed, "max_items_per_order", s.max_items_per_order)}
            error={errors.max_items_per_order}
          />
          <SettingField
            name="max_orders_per_student_day"
            label="Orders per student per day"
            type="number"
            inputMode="numeric"
            suffix="max"
            defaultValue={pick(typed, "max_orders_per_student_day", s.max_orders_per_student_day)}
            error={errors.max_orders_per_student_day}
            hint="Matched by first + last name."
          />
          <SettingField
            name="max_orders_per_hour_per_device"
            label="Orders per phone per hour"
            type="number"
            inputMode="numeric"
            suffix="max"
            defaultValue={pick(typed, "max_orders_per_hour_per_device", s.max_orders_per_hour_per_device)}
            error={errors.max_orders_per_hour_per_device}
            hint="Stops prank orders from one device."
          />
        </div>
      )}
    </SectionForm>
  );
}

export function InventoryForm({ s }: { s: StoreSettings }) {
  return (
    <SectionForm
      id="inventory"
      title="Inventory math and privacy"
      description="Used for days of stock left, reorder points and the shopping list."
      action={saveInventorySettings}
    >
      {(errors, typed) => (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <SettingField
            name="sales_average_days"
            label="Average sales over"
            type="number"
            inputMode="numeric"
            suffix="days"
            defaultValue={pick(typed, "sales_average_days", s.sales_average_days)}
            error={errors.sales_average_days}
            hint="Longer = steadier numbers, shorter = reacts faster."
          />
          <SettingField
            name="reorder_buffer_days"
            label="Safety stock"
            type="number"
            inputMode="numeric"
            suffix="days"
            defaultValue={pick(typed, "reorder_buffer_days", s.reorder_buffer_days)}
            error={errors.reorder_buffer_days}
            hint="Extra days of sales to keep on hand."
          />
          <SettingField
            name="shopping_interval_days"
            label="Days between shopping trips"
            type="number"
            inputMode="numeric"
            suffix="days"
            defaultValue={pick(typed, "shopping_interval_days", s.shopping_interval_days)}
            error={errors.shopping_interval_days}
            hint="The shopping list buys enough to last this long."
          />
          <SettingField
            name="next_shopping_date"
            label="Next planned trip"
            type="date"
            defaultValue={pick(typed, "next_shopping_date", s.next_shopping_date)}
            error={errors.next_shopping_date}
            hint="Optional. Shown on the shopping list."
          />
          <SettingField
            name="order_retention_days"
            label="Delete old orders after"
            type="number"
            inputMode="numeric"
            suffix="days"
            defaultValue={pick(typed, "order_retention_days", s.order_retention_days)}
            error={errors.order_retention_days}
            hint="Student names are deleted with them every night. Sales numbers are kept."
          />
        </div>
      )}
    </SectionForm>
  );
}

export function PasswordForm({ email }: { email: string }) {
  return (
    <SectionForm
      id="account"
      title="Admin login"
      description={
        <>
          Logged in as <strong className="font-medium text-foreground">{email}</strong>. To use a different email, run{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run create-admin</code> (see the README).
        </>
      }
      action={changePassword}
      saveLabel="Change password"
    >
      {(errors) => (
        <div className="grid gap-5 sm:grid-cols-3">
          <SettingField name="current" label="Current password" type="password" autoComplete="current-password" error={errors.current} />
          <SettingField name="next" label="New password" type="password" autoComplete="new-password" error={errors.next} hint="At least 10 characters." />
          <SettingField name="confirm" label="New password again" type="password" autoComplete="new-password" error={errors.confirm} />
        </div>
      )}
    </SectionForm>
  );
}
