import Link from "next/link";
import { BoxIcon, SparklesIcon } from "lucide-react";
import type { Season } from "@/lib/seasons";

/** The band near the bottom: one more way into the 3D store, and (for guests) rewards. */
export function StoreCta({ season, showRewards }: { season: Season; showRewards: boolean }) {
  const photo = season === "halloween" ? "store-drone-halloween" : "store-drone";
  return (
    <section className="mt-16 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="relative isolate overflow-hidden rounded-3xl bg-black p-7 text-white sm:p-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/hero/${photo}.webp`} alt="" loading="lazy" className="absolute inset-0 -z-10 size-full scale-110 object-cover opacity-55 blur-[3px]" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/85 via-black/50 to-transparent" />
        <p className="font-heading text-4xl leading-none font-extrabold uppercase sm:text-5xl">Take a walk inside</p>
        <p className="mt-2 max-w-sm text-white/80">Fly in through the doors, grab drinks from the fridge, and watch the cashier ring you up.</p>
        <Link
          href="/store"
          className="enter-3d group mt-6 inline-flex h-14 items-center gap-2.5 rounded-full px-7 font-heading text-xl font-extrabold tracking-wider uppercase ring-2 ring-white/70 transition-transform hover:scale-105 focus-visible:ring-4 focus-visible:ring-white focus-visible:outline-none"
        >
          <BoxIcon className="size-6 transition-transform duration-500 group-hover:rotate-[360deg]" />
          Enter 3D world
        </Link>
      </div>
      {showRewards && (
        <div className="flex flex-col justify-between rounded-3xl bg-primary p-7 text-black sm:p-10">
          <div>
            <SparklesIcon className="size-8" />
            <p className="mt-3 font-heading text-4xl leading-none font-extrabold uppercase">Rewards</p>
            <p className="mt-2 text-black/75">Make an account to earn points on every order and trade them for free snacks.</p>
          </div>
          <Link
            href="/account?mode=signup"
            className="mt-6 inline-flex h-12 w-fit items-center rounded-full bg-black px-6 font-semibold text-white transition-transform hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-black/40 focus-visible:outline-none"
          >
            Sign up free
          </Link>
        </div>
      )}
    </section>
  );
}
