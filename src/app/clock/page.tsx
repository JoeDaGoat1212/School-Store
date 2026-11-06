import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { loadBoard } from "./actions";
import { TimeClock } from "./time-clock";

export const metadata: Metadata = {
  title: "Time clock",
  robots: { index: false },
};

export const viewport: Viewport = {
  // A tablet on the counter: no zooming in by accident while tapping the keypad.
  maximumScale: 1,
};

/**
 * The employee time clock. Leave it open on the store's tablet or laptop:
 * employees type their PIN (or scan their student ID) to clock in and out,
 * new employees tap "Create account", and it shows who's working and the
 * schedule. Managers run everything from Admin → Schedule / Timecards /
 * Employees / Store credit.
 */
export default async function ClockPage() {
  await connection(); // always fresh, never built ahead of time
  const { board, error } = await loadBoard();
  return <TimeClock initialBoard={board} initialError={error} />;
}
