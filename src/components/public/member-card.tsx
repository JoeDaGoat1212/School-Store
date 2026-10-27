import { FlameMark } from "@/components/brand-mark";
import { brand } from "@/config/brand";

/**
 * The rewards card at the top of "My rewards": black like the hero, with the
 * points balance as the big number.
 */
export function MemberCard({ name, balance, since }: { name: string; balance: number; since: string }) {
  const year = new Date(since).getFullYear();

  return (
    <section
      aria-label="Your rewards card"
      className="dark relative isolate overflow-hidden rounded-3xl bg-black p-6 text-white shadow-[0_20px_40px_-20px_rgb(0_0_0/0.6)] sm:p-7"
    >
      {/* Warm glow in the corner + a big faint flame behind the number */}
      <div aria-hidden className="coal-glow absolute inset-0 -z-10" />
      <FlameMark size={220} className="absolute -right-10 -bottom-12 -z-10 opacity-15" />

      <div className="flex items-center gap-2.5">
        <FlameMark size={28} />
        <p className="font-heading text-xl leading-none font-extrabold tracking-wide uppercase">{brand.name} rewards</p>
      </div>

      <p className="mt-8 text-sm text-white/65">Your points</p>
      <p className="font-heading text-8xl leading-[0.85] font-extrabold text-primary tabular-nums">
        {balance.toLocaleString("en-US")}
      </p>

      <div className="mt-6 flex items-end justify-between gap-4 text-sm">
        <p className="font-semibold">{name}</p>
        <p className="text-white/55">Member since {year}</p>
      </div>
    </section>
  );
}
