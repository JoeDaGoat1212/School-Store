import { initials } from "@/lib/staff";

/** Each name always gets the same color (a hue picked from the letters). */
function hue(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** A round badge with someone's initials, in their color. */
export function Avatar({ name, size = 36, ring }: { name: string; size?: number; ring?: "on" | "off" }) {
  const h = hue(name);
  return (
    <span
      aria-hidden
      className={`relative grid shrink-0 place-items-center rounded-full font-semibold text-white select-none ${
        ring === "on" ? "ring-2 ring-success ring-offset-2 ring-offset-background" : ""
      }`}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${h} 38% 40%)` }}
    >
      {initials(name)}
    </span>
  );
}
