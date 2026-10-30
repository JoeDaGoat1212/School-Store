/*
 * You: where you are and what you're doing. Plain TypeScript (bump.ts re-exports it).
 */

/** You, on foot (the camera moves this). */
export const player = {
  x: 0,
  z: 11,
  /** Which way you face (0 = toward the store, -z). */
  yaw: 0,
  /** Walking around (not in the drone view, not driving). */
  onFoot: false,
  /** Just got out of a car: the camera should hop to (x, z) and face `yaw`. */
  hop: false,
  /** With `hop`: jump straight there, no flight (respawning, being taken to jail…). */
  snap: false,
  /** Your feet: how high off the ground you are (jumping, falling, the mountains). */
  y: 0,
  /** Falling or jumping speed (up is +). */
  vy: 0,
  grounded: true,
  /** Seeing through your own eyes, or from behind yourself. */
  view: "first" as "first" | "third",
  /** How far back the camera is in third person (0 = through your eyes). */
  zoom: 0,
  /** Can't move: cutscenes, working a shift, handcuffed, dead. */
  frozen: false,
  /** How fast you're walking right now (units a second), for your character's legs. */
  speed: 0,
  /** What your body is doing (0…1 each), for your character in third person and cutscenes. */
  anim: { handsUp: 0, cuffed: 0, down: 0, sit: 0, reach: 0 },
  /** Your character is drawn even in first person (cutscenes: being cuffed, put in the car…). */
  showBody: false,
  /** Hidden completely (in the back of a police car, at the dealership's screen…). */
  hidden: false,
  /** Put the camera straight on (x, y, z) with no flight (bailing out of a plane mid-air). */
  place: false,
  /** Your parachute is open. */
  chute: false,
  /** Which floor you're on, where there's more than one (the bank: 1 = the banking hall, 0 = the street and the vault level). */
  level: 0,
};
