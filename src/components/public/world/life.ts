/*
 * Staying alive: hunger and health. Plain TypeScript (no 3D code).
 *
 *   - Hunger runs down over about 18 minutes of play. Eat at Slice Society,
 *     Polar Scoops, Bean There or Smash Stack to fill it back up.
 *   - At empty, you start to starve: health drains, and at zero you pass out
 *     (die). You wake up at the store (or your house) and the cash you were
 *     carrying is gone. Money in the bank is safe.
 *   - The lasers in the bank vault and the jewelry shop kill you instantly.
 *   - Health comes back slowly while you're fed.
 *
 * Whoever's in charge of the world calls tickLife() every frame.
 */

export const HUNGER_MINUTES = 18;
const STARVE_SECONDS = 45;

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

/** One frame. Returns "hungry" / "starving" the moment a warning is due (once each), else null. */
export function tickLife(dt: number, paused: boolean): "hungry" | "starving" | null {
  life.clock += dt;
  if (life.dead || paused) return null;
  life.hunger = Math.max(0, life.hunger - (100 / (HUNGER_MINUTES * 60)) * dt);
  if (life.hunger <= 0) life.health -= (100 / STARVE_SECONDS) * dt;
  else if (life.hunger > 30) life.health = Math.min(100, life.health + 2 * dt);
  if (life.health <= 0) kill("hunger");
  if (life.hunger < 25 && life.warned < 1) {
    life.warned = 1;
    return "hungry";
  }
  if (life.hunger <= 0 && life.warned < 2) {
    life.warned = 2;
    return "starving";
  }
  return null;
}
