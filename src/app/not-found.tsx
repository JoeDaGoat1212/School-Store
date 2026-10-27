import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

// Shown for any address that doesn't exist.
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="grid max-w-sm justify-items-center gap-3 text-center">
        <BrandMark size={44} />
        <h1 className="font-heading text-2xl font-bold">Page not found</h1>
        <p className="text-muted-foreground">That link doesn&apos;t go anywhere. It may be mistyped, or the page was moved.</p>
        <Button asChild size="lg" className="mt-2">
          <Link href="/">Go to the menu</Link>
        </Button>
      </div>
    </main>
  );
}
