import Link from "next/link";
import { SiteHeader } from "@/components/public/site-header";
import { SkipLink } from "@/components/skip-link";
import { brand } from "@/config/brand";

/** Wraps every student-facing page: header on top, small footer at the bottom. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-32">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground">
          <span>{brand.name} · run by students</span>
          <Link href="/login" className="underline-offset-4 hover:text-foreground hover:underline">
            Staff login
          </Link>
        </div>
      </footer>
    </div>
  );
}
