import { Skeleton } from "@/components/ui/skeleton";

/** Shown while the list view loads: the ticker, then grey shapes where the products will be. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading the menu">
      <div className="-mt-6 mb-10 ml-[calc(50%-50vw)] h-11 w-screen bg-black" />
      <div className="flex gap-2 py-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-20 rounded-full" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
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
