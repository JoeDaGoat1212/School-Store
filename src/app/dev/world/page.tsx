import { notFound } from "next/navigation";
import { DevWorld } from "./dev-world";

/**
 * Only while developing: the 3D store and city with a few sample products and
 * no database, so the world can be tried (and screenshotted by scripts)
 * without Supabase. Open /dev/world.
 */
export default function DevWorldPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevWorld />;
}
