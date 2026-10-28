import { BellRingIcon, ClockIcon, DoorOpenIcon, ShoppingBasketIcon } from "lucide-react";
import { productRenderUrl } from "@/lib/product-renders";
import { cn } from "@/lib/utils";

/**
 * The big "ROOM SERVICE AVAILABLE" sign at the top of the teacher page:
 * hotel-wallpaper background, a silver cloche whose lid lifts every few
 * seconds to show snacks underneath, and the three steps.
 */
export function RoomServiceBanner({
  room,
  enabled = true,
  picks,
  children,
}: {
  /** The teacher's room, once we know it. */
  room?: string | null;
  /** Room service can be turned off in Admin → Settings. */
  enabled?: boolean;
  /** Product names whose 3D pictures sit under the lid. */
  picks: string[];
  /** Buttons under the steps. */
  children?: React.ReactNode;
}) {
  const pics = picks.map(productRenderUrl).filter(Boolean).slice(0, 3) as string[];

  return (
    <section
      aria-labelledby="room-service-title"
      className="relative -mt-6 mb-10 ml-[calc(50%-50vw)] w-screen overflow-hidden bg-[#14110f] text-[#f6efe3]"
    >
      {/* Hotel wallpaper: a faint diamond pattern and a warm glow behind the cloche */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(45deg,currentColor_1px,transparent_1px),linear-gradient(-45deg,currentColor_1px,transparent_1px)] [background-size:34px_34px]"
      />
      <div aria-hidden className="absolute -right-24 top-1/2 size-[36rem] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(255_196_92/0.28),transparent_65%)]" />

      <div className="relative mx-auto grid max-w-5xl items-center gap-8 px-4 py-10 sm:py-14 md:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold tracking-[0.22em] text-[#ffc45c] uppercase">
            <span className={cn("relative flex size-2.5", !enabled && "opacity-40")}>
              {enabled && <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#ffc45c] opacity-75" />}
              <span className="relative inline-flex size-2.5 rounded-full bg-[#ffc45c]" />
            </span>
            For teachers · {enabled ? "Now serving" : "Paused today"}
          </p>
          <h1 id="room-service-title" className="mt-3 font-heading leading-[0.82] font-extrabold uppercase">
            <span className="block text-[clamp(3.6rem,13vw,7.5rem)] text-[#ffc45c] [text-shadow:0_0_40px_rgb(255_196_92/0.35)]">
              Room service
            </span>
            <span className="block text-[clamp(2.4rem,8.5vw,4.8rem)] text-transparent [-webkit-text-stroke:2px_#f6efe3]">
              {enabled ? "Available" : "Back soon"}
            </span>
          </h1>
          <p className="mt-4 max-w-md text-[#f6efe3]/75">
            {enabled
              ? `Order from your desk and a student brings it to ${room ? `Room ${room}` : "your room"} during the class hour you pick. Pay when it arrives.`
              : "Room service is taking a break. You can still order and pick it up at the store window."}
          </p>

          <ol className="mt-6 grid gap-2 text-sm sm:grid-cols-3">
            {[
              { icon: ShoppingBasketIcon, text: "Pick your snacks" },
              { icon: ClockIcon, text: "Choose a class hour" },
              { icon: DoorOpenIcon, text: room ? `We knock on ${room}` : "We knock on your door" },
            ].map(({ icon: Icon, text }, i) => (
              <li key={text} className="flex items-center gap-2.5 rounded-xl border border-[#f6efe3]/15 bg-[#f6efe3]/5 px-3 py-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#ffc45c] font-heading text-base font-extrabold text-[#14110f]">
                  {i + 1}
                </span>
                <Icon aria-hidden className="size-4 shrink-0 opacity-70" />
                <span className="font-medium">{text}</span>
              </li>
            ))}
          </ol>
          {children && <div className="mt-6 flex flex-wrap items-center gap-3">{children}</div>}
        </div>

        <Cloche pics={pics} />
      </div>
    </section>
  );
}

/** A silver cloche on a tray. The lid lifts now and then to show the snacks. */
function Cloche({ pics }: { pics: string[] }) {
  return (
    <div aria-hidden className="relative mx-auto aspect-[4/3] w-full max-w-sm">
      {/* Little service bell, ringing */}
      <span className="bell-ring absolute top-2 left-0 z-20 grid size-12 place-items-center rounded-full bg-[#ffc45c] text-[#14110f] shadow-[0_0_30px_rgb(255_196_92/0.5)]">
        <BellRingIcon className="size-6" />
      </span>

      <svg viewBox="0 0 320 240" className="absolute inset-0 size-full">
        <defs>
          <linearGradient id="tray" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#f2efe9" />
            <stop offset="1" stopColor="#8d8a85" />
          </linearGradient>
        </defs>
        {/* Tray */}
        <ellipse cx="160" cy="214" rx="150" ry="20" fill="url(#tray)" />
        <ellipse cx="160" cy="208" rx="138" ry="14" fill="#d9d5ce" />
      </svg>

      {/* The snacks on the tray */}
      <div className="absolute inset-x-[16%] bottom-[12%] flex h-[46%] items-end justify-center">
        {pics.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt=""
            className={cn("h-full w-auto max-w-[42%] object-contain drop-shadow-[0_8px_10px_rgb(0_0_0/0.45)]", i > 0 && "-ml-[10%]", i === 1 && "z-10 scale-110")}
          />
        ))}
      </div>

      {/* Steam that shows when the lid is up */}
      <svg viewBox="0 0 320 240" className="cloche-steam absolute inset-0 size-full">
        {[120, 160, 200].map((x, i) => (
          <path
            key={x}
            d={`M${x} 120 c-12 -14 12 -24 0 -38 c-12 -14 12 -24 0 -38`}
            fill="none"
            stroke="#f6efe3"
            strokeOpacity="0.5"
            strokeWidth="5"
            strokeLinecap="round"
            style={{ animationDelay: `${i * 0.25}s` }}
          />
        ))}
      </svg>

      {/* The lid */}
      <svg viewBox="0 0 320 240" className="cloche-lid absolute inset-0 size-full">
        <defs>
          <linearGradient id="dome" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#7d7a75" />
            <stop offset="0.28" stopColor="#f7f5f1" />
            <stop offset="0.5" stopColor="#c9c5be" />
            <stop offset="1" stopColor="#6f6c67" />
          </linearGradient>
        </defs>
        <path d="M28 206 C28 96 92 54 160 54 C228 54 292 96 292 206 Z" fill="url(#dome)" />
        {/* Shine */}
        <path d="M70 180 C72 120 104 86 140 74" fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="7" strokeLinecap="round" />
        {/* Rim and handle */}
        <rect x="20" y="198" width="280" height="12" rx="6" fill="#a9a59e" />
        <rect x="146" y="34" width="28" height="22" rx="6" fill="#bdb9b2" />
        <circle cx="160" cy="30" r="12" fill="#e9e6e0" />
      </svg>
    </div>
  );
}
