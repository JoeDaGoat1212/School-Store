import { brandIcon } from "@/lib/brand-icon";

// Icon used when a student adds the menu to their phone's home screen.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return brandIcon(180);
}
