import { Skeleton } from "@/components/ui/skeleton";

/** Shown while the menu loads: grey shapes where the products will be. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading the menu">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mt-3 h-5 w-72" />
      <Skeleton className="mt-5 h-8 w-80 rounded-full" />
      <div className="mt-8 flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-20 rounded-full" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i}>
            <Skeleton className="aspect-square w-full rounded-2xl" />
            <Skeleton className="mt-3 h-5 w-3/4" />
            <Skeleton className="mt-3 h-11 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
