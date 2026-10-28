import type { PopularRequest } from "@/lib/member";
import { RequestForm } from "../request-form";

/**
 * "Can't find it? Ask for it." The same request form as the request table
 * in the 3D store, for people shopping from the list.
 */
export function RequestSection({ popular }: { popular: PopularRequest[] }) {
  return (
    <section id="request" aria-labelledby="request-title" className="mt-20 scroll-mt-20">
      <div className="grid gap-8 overflow-hidden rounded-3xl bg-[#0b6b67] p-6 text-white sm:p-10 md:grid-cols-[1fr_1.15fr]">
        <div>
          <h2 id="request-title" className="font-heading text-5xl leading-[0.9] font-extrabold uppercase sm:text-6xl">
            Can&apos;t find it?
            <br />
            Ask for it.
          </h2>
          <p className="mt-4 max-w-sm text-white/80">
            Tell us what we should sell. The store team reads every request, and the things people ask for most get
            stocked first.
          </p>
          {popular.length > 0 && (
            <p className="mt-6 font-heading text-7xl leading-none font-extrabold text-[#ffd21f]">
              {popular.reduce((n, p) => n + p.count, 0)}
              <span className="ml-2 align-middle font-sans text-base font-semibold text-white/80">requests so far</span>
            </p>
          )}
        </div>
        <div className="rounded-2xl bg-white p-5 text-black shadow-xl sm:p-6">
          <RequestForm popular={popular} source="web" />
        </div>
      </div>
    </section>
  );
}
