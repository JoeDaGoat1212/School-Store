/*
 * Staying alive: health. Plain TypeScript (no 3D code).
 *
 *   - There's no hunger any more (you never have to eat; the food places
 *     still sell food). life.hunger stays full.
 *   - Lose all your health and you pass out (die). You wake up at the store
 *     (or your house) and the cash you were carrying is gone. Money in the
 *     bank is safe.
 *   - The lasers in the bank vault and the jewelry shop kill you instantly.
 *   - Health comes back slowly.
 *
 * Whoever's in charge of the world calls tickLife() every frame.
 */

export const HUNGER_MINUTES = 18;

export type Death = { reason: "hunger" | "laser" | "fall" | "crash"; at: number };

export const life = {
  /** 100 = full, 0 = starving. */
  hunger: 100,
  /** 100 = fine, 0 = dead. */
  health: 100,
  dead: false,
  death: null as Death | null,
  /** In jail right now (wearing orange). */
  inJail: false,
  /** Seconds of play so far (for things that need a clock). */
  clock: 0,
  /** When you last ate (for the "you're hungry" reminders). */
  warned: 0,
};

/** Fill up (amount = how many hunger points, e.g. a slice of pizza is 30). */
export function eat(amount: number) {
  life.hunger = Math.min(100, life.hunger + amount);
  life.warned = 0;
}

export function kill(reason: Death["reason"]) {
  if (life.dead) return;
  life.dead = true;
  life.health = 0;
  life.death = { reason, at: life.clock };
}

export function revive() {
  life.dead = false;
  life.death = null;
  life.health = 100;
  life.hunger = Math.max(life.hunger, 60);
  life.warned = 0;
}

/** One frame: health slowly comes back. (No hunger any more: you never need to eat. Food still tops you up.) */
export function tickLife(dt: number, paused: boolean): "hungry" | "starving" | null {
  life.clock += dt;
  if (life.dead || paused) return null;
  life.hunger = 100;
  life.health = Math.min(100, life.health + 2 * dt);
  return null;
}
