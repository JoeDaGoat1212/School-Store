import { sound } from "./city-audio";
import { notify } from "./game-events";
import { banner, game, pop, streetChase } from "./heist";
import { provide } from "./interact";
import { life } from "./life";
import { earn } from "./profile";
import { walkerSpots } from "./town";
import { player } from "./you";

/*
 * Pickpocketing, anywhere (not just the guards in jail). Plain TypeScript.
 *
 *   - Walk up behind someone on the street and press F to lift their wallet:
 *     usually a few dollars, sometimes a fat one.
 *   - From in front (they can see you), they catch you, shout, and the
 *     police come after you. Lose them, or it's off to jail.
 *   - Even from behind, now and then someone feels it and turns round.
 *   - Each person can only be robbed once every few minutes (they guard
 *     their pockets after that).
 */

/** How close you need to be (people are about 3.3 units tall). */
const REACH = 3;
/** Once robbed (or once they've caught you), they keep a hand on their wallet for this long (seconds). */
const WARY = 180;
/** The chance someone notices even when you're behind them. */
const FEEL_IT = 0.12;
/** How long the police chase you for if someone catches you. */
const CHASE_SECONDS = 50;

/** Who's been robbed (or caught you) and when. */
const wary = new Map<number, number>();
let lastTry = -10;

/** Is (x, z) in front of the person at spot i (could they see you)? */
function seesYou(i: number, x: number, z: number) {
  const w = walkerSpots[i];
  const dx = x - w.x;
  const dz = z - w.z;
  const d = Math.hypot(dx, dz) || 1;
  // A walker faces (sin heading, cos heading).
  return (dx * Math.sin(w.heading) + dz * Math.cos(w.heading)) / d > 0.3;
}

function nearest(x: number, z: number) {
  let best = -1;
  let bd = REACH;
  walkerSpots.forEach((w, i) => {
    const d = Math.hypot(w.x - x, w.z - z);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** How much is in this wallet. */
function wallet() {
  if (Math.random() < 0.06) return 400 + Math.round(Math.random() * 1100);
  return 15 + Math.round(Math.random() * 185);
}

provide("pickpocket", (you) => {
  if (!you.onFoot || you.driving || life.inJail || life.dead) return null;
  const i = nearest(you.x, you.z);
  if (i < 0) return null;
  const until = wary.get(i);
  if (until !== undefined && game.now < until) return null;
  return {
    key: "F",
    text: "Pickpocket",
    tone: "crime",
    run: () => {
      // (No mashing the key.)
      if (game.now - lastTry < 1) return;
      lastTry = game.now;
      wary.set(i, game.now + WARY);
      player.anim.reach = 1;
      setTimeout(() => (player.anim.reach = 0), 500);
      if (seesYou(i, player.x, player.z) || Math.random() < FEEL_IT) {
        streetChase(CHASE_SECONDS, "“Thief!” They caught you with your hand in their pocket. Lose the cops!");
        notify();
        return;
      }
      const take = wallet();
      earn(take);
      pop(take);
      sound.cash();
      if (take >= 400) banner("info", "Fat wallet!", "Nice. Now walk away calmly…", 3);
      notify();
    },
  };
});
