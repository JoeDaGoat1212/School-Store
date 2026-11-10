import { Skeleton } from "@/components/ui/skeleton";

// Grey placeholder shapes while a staff page loads: a title, then one sheet.
export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-3 h-4 w-80" />
      <Skeleton className="mt-8 h-40 rounded-xl" />
      <Skeleton className="mt-4 h-72 rounded-xl" />
    </div>
  );
}
