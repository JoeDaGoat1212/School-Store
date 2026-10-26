import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { CartButton } from "./cart-button";

/** Top bar on every student page. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-2 px-4">
        <Link href="/" className="mr-auto flex items-center gap-2.5 rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <BrandMark size={36} />
          <span className="font-heading text-lg font-bold tracking-tight">{brand.name}</span>
        </Link>
        <Button variant="ghost" size="lg" asChild className="hidden sm:inline-flex">
          <Link href="/lookup">
            <SearchIcon /> Find my order
          </Link>
        </Button>
        <Button variant="ghost" size="icon-lg" asChild className="sm:hidden">
          <Link href="/lookup" aria-label="Find my order">
            <SearchIcon />
          </Link>
        </Button>
        <ThemeToggle />
        <CartButton />
      </div>
    </header>
  );
}
