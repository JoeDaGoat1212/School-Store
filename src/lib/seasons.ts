/**
 * Holiday decorations for the 3D store. They go up and come down by
 * themselves, using the store's own date (Arizona time).
 *
 * To add another holiday later: add its name here, say when it runs in
 * `seasonFor`, and build its decorations (see world/halloween.tsx).
 */

export type Season = "halloween" | null;

/** Which decorations are up on this date ("YYYY-MM-DD"). */
export function seasonFor(today: string): Season {
  const month = Number(today.slice(5, 7));
  // Halloween: the whole of October.
  if (month === 10) return "halloween";
  return null;
}

/**
 * The season to show: normally from the date, but `?season=halloween` (or
 * `?season=none`) in the address previews it any time of year.
 */
export function pickSeason(today: string, override?: string | string[]): Season {
  const asked = Array.isArray(override) ? override[0] : override;
  if (asked === "halloween") return "halloween";
  if (asked === "none") return null;
  return seasonFor(today);
}
