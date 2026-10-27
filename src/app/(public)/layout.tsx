import Link from "next/link";
import { FlameMark } from "@/components/brand-mark";
import { SiteHeader } from "@/components/public/site-header";
import { SkipLink } from "@/components/skip-link";
import { brand } from "@/config/brand";

/** Wraps every student-facing page: black header on top, black footer at the bottom. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    // overflow-x-clip: the full-width hero is 100vw wide, which can be a few
    // pixels wider than the page when there's a scrollbar.
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <SkipLink />
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-32">
        {children}
      </main>
      <footer className="dark bg-black text-white">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 pt-12 pb-28 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="flex items-center gap-4">
            <FlameMark size={64} />
            <div>
              <p className="font-heading text-4xl leading-none font-extrabold tracking-wide uppercase">{brand.name}</p>
              <p className="mt-1.5 text-white/65">Run by students, for students.</p>
            </div>
          </div>
          <nav aria-label="More links" className="flex gap-6 text-sm text-white/65">
            <Link href="/lookup" className="underline-offset-4 hover:text-white hover:underline">
              Find my order
            </Link>
            <Link href="/login" className="underline-offset-4 hover:text-white hover:underline">
              Staff login
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
