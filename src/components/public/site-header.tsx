import Link from "next/link";
import { SearchIcon, TagIcon, UserRoundIcon } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { getAccount } from "@/lib/member";
import { CartButton } from "./cart-button";

/**
 * Black top bar on every student page. The "dark" class makes the buttons
 * inside use their dark-mode colors, so they read well on black.
 */
export async function SiteHeader() {
  const account = await getAccount();
  const member = account?.profile ? account : null;

  return (
    <header className="dark sticky top-0 z-30 border-b border-white/10 bg-black text-white">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-1 px-4">
        <Link
          href="/"
          className="mr-auto flex items-center gap-2.5 rounded-lg focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none"
        >
          <BrandMark size={38} />
          <span className="font-heading text-xl leading-none font-extrabold tracking-wide whitespace-nowrap uppercase sm:text-2xl">{brand.name}</span>
        </Link>
        {/* Deals: a yellow tag so it stands out */}
        <Button variant="ghost" size="lg" asChild className="px-2.5 text-[#ffd21f] hover:text-[#ffd21f] sm:px-3">
          <Link href="/deals" aria-label="Deals and bundles">
            <TagIcon />
            <span className="hidden sm:inline">Deals</span>
          </Link>
        </Button>
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
        {/* On phones the theme switch lives in the footer, to make room. */}
        <ThemeToggle className="hidden sm:inline-flex" />
        {member ? (
          <Link
            href="/account"
            aria-label={`My rewards, ${member.balance} points`}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/10 pr-3 pl-1.5 text-sm font-semibold transition-colors hover:bg-white/20 focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none"
          >
            <span className="grid size-6 place-items-center rounded-full bg-primary font-heading text-sm font-extrabold text-black">
              {member.profile!.first_name.charAt(0).toUpperCase()}
            </span>
            <span className="font-heading text-lg leading-none font-extrabold text-primary tabular-nums">{member.balance}</span>
            <span className="hidden text-white/60 sm:inline">pts</span>
          </Link>
        ) : (
          <Button variant="ghost" size="lg" asChild className="px-2.5 sm:px-3">
            <Link href="/account" aria-label={account ? "Finish your rewards account" : "Sign in or sign up for rewards"}>
              <UserRoundIcon />
              <span className="hidden sm:inline">{account ? "Rewards" : "Sign in / Sign up"}</span>
            </Link>
          </Button>
        )}
        <CartButton />
      </div>
    </header>
  );
}
