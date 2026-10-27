import Link from "next/link";
import { FlameMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

// Shown for any address that doesn't exist.
export default function NotFound() {
  return (
    <main className="dark grid min-h-dvh place-items-center bg-black px-4 text-white">
      <div className="grid max-w-sm justify-items-center gap-3 text-center">
        <FlameMark size={72} />
        <h1 className="font-heading text-5xl leading-none font-extrabold">Page not found</h1>
        <p className="text-white/70">That link doesn&apos;t go anywhere. It may be mistyped, or the page was moved.</p>
        <Button asChild size="lg" className="mt-2">
          <Link href="/">Go to the menu</Link>
        </Button>
      </div>
    </main>
  );
}
