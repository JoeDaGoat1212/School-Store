import { FlameMark } from "@/components/brand-mark";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * The cover shown while the 3D store downloads and draws its first picture.
 * `progress` is 0–100 (or undefined while we don't know yet).
 * It fades out (instead of vanishing) when `done` turns true.
 */
export function LoadingScreen({ progress, done = false }: { progress?: number; done?: boolean }) {
  const pct = Math.round(progress ?? 0);
  return (
    <div
      aria-hidden={done}
      className={cn(
        "fixed inset-0 z-[90] grid place-items-center bg-[linear-gradient(180deg,#8fd0fa_0%,#d6effd_60%,#f6f1e7_100%)] text-black transition-opacity duration-700",
        done && "pointer-events-none opacity-0",
      )}
    >
      <div className="flex flex-col items-center gap-5 px-6 text-center">
        <span className="animate-bounce">
          <FlameMark size={84} />
        </span>
        <p className="font-heading text-5xl leading-none font-extrabold tracking-wide uppercase sm:text-6xl">{brand.name}</p>
        <div role="progressbar" aria-label="Loading the store" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-3 w-64 overflow-hidden rounded-full border-2 border-black bg-white">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.max(8, pct)}%` }} />
        </div>
        <p className="text-sm font-semibold text-black/60">Opening the doors…</p>
      </div>
    </div>
  );
}
