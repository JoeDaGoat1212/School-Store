import Link from "next/link";
import { BoxIcon, ChevronDownIcon } from "lucide-react";
import { brand } from "@/config/brand";
import type { Season } from "@/lib/seasons";

/*
 * The top of the home page: the drone view of the 3D store (a photo of it,
 * blurred and slowly drifting), the store's name big in the middle, and the
 * button into the 3D store.
 *
 * The photos are public/hero/store-drone*.webp, taken from the 3D store
 * itself (there's a Halloween one too).
 */

export function StoreHero({ season }: { season: Season }) {
  const photo = season === "halloween" ? "store-drone-halloween" : "store-drone";
  return (
    // Full width (out of the page's centred column) and the rest of the screen under the header.
    <section className="relative -mt-6 ml-[calc(50%-50vw)] grid h-[calc(100svh-4rem)] min-h-[34rem] w-screen place-items-center overflow-hidden bg-[#3a4a3a] text-white">
      {/* The drone view: a tiny copy straight away, the sharp one on top once it loads */}
      <div aria-hidden className="absolute inset-0 bg-cover bg-center blur-xl" style={{ backgroundImage: `url(/hero/${photo}-tiny.webp)` }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/hero/${photo}.webp`}
        alt=""
        fetchPriority="high"
        className="hero-drift absolute inset-0 size-full object-cover blur-[5px] brightness-[0.92]"
      />
      {/* Darken a little (more at the bottom), so the white words stand out */}
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_45%,rgb(0_0_0/0.1),rgb(0_0_0/0.55))]" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />

      <div className="relative z-10 flex flex-col items-center px-4 text-center">
        {season === "halloween" && (
          <p className="mb-5 rounded-full bg-black/45 px-4 py-1.5 text-sm font-semibold backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-700">
            🎃 The store is dressed up for Halloween
          </p>
        )}
        <h1 className="font-heading text-[clamp(3.6rem,14vw,11rem)] leading-[0.82] font-extrabold tracking-wide uppercase [text-shadow:0_6px_40px_rgb(0_0_0/0.45)] animate-in fade-in zoom-in-95 duration-700">
          {brand.name}
        </h1>
        <p className="mt-4 text-sm font-semibold tracking-[0.4em] text-white/90 uppercase [text-shadow:0_2px_12px_rgb(0_0_0/0.5)] sm:text-base">3D interactive store</p>

        <Link
          href="/store"
          className="enter-3d group mt-10 inline-flex h-16 items-center gap-3 rounded-full px-9 font-heading text-2xl font-extrabold tracking-wider text-white uppercase ring-2 ring-white/70 transition-transform duration-300 hover:scale-105 focus-visible:ring-4 focus-visible:ring-white focus-visible:outline-none active:scale-95 sm:h-20 sm:px-12 sm:text-3xl"
        >
          <BoxIcon className="size-7 transition-transform duration-500 group-hover:rotate-[360deg] sm:size-8" />
          Enter 3D world
        </Link>
        <p className="mt-4 max-w-sm text-sm text-white/80 [text-shadow:0_1px_8px_rgb(0_0_0/0.5)]">
          Walk the aisles, open the fridge, and check out at the register.
        </p>
      </div>

      <a
        href="#aisles"
        className="absolute bottom-5 z-10 flex flex-col items-center gap-1 text-xs font-semibold tracking-widest text-white/85 uppercase transition-colors hover:text-white"
      >
        Or shop the list
        <ChevronDownIcon className="size-6 animate-bounce" />
      </a>
    </section>
  );
}
