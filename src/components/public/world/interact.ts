import { notify } from "./game-events";

/*
 * "What can you do here?": every part of the city game (robberies, shops,
 * the dealership, the realtor, the gate, the jail, vehicles…) registers a
 * provider that looks at where you are and offers actions, each on a key
 * (E, R, F or Q). The on-screen prompt shows them all; pressing the key (or
 * tapping the button) runs it. Plain TypeScript.
 */

export type You = { x: number; z: number; y: number; yaw: number; onFoot: boolean; driving: boolean };
export type Action = {
  key: "E" | "R" | "F" | "Q";
  text: string;
  run: () => void;
  /** How the button looks: red for crimes, green for money, plain otherwise. */
  tone?: "crime" | "money" | "plain";
};
type Provider = (you: You) => Action[] | Action | null | undefined | false;

const providers = new Map<string, Provider>();
export const interaction = { actions: [] as Action[], id: "" };

/** Add (or replace) what one part of the game offers. */
export function provide(name: string, p: Provider) {
  providers.set(name, p);
}

/** Every frame: gather what's on offer here (and tell the screen when it changes). */
export function tickInteract(you: You, paused: boolean) {
  const list: Action[] = [];
  if (!paused)
    for (const p of providers.values()) {
      const r = p(you);
      if (!r) continue;
      if (Array.isArray(r)) list.push(...r);
      else list.push(r);
    }
  const id = list.map((a) => `${a.key}:${a.text}`).join("|");
  if (id !== interaction.id) {
    interaction.id = id;
    interaction.actions = list;
    notify();
  } else interaction.actions = list;
}

/** Pressed a key: run the first action on it. Returns true if something happened. */
export function press(key: Action["key"]) {
  const a = interaction.actions.find((x) => x.key === key);
  if (!a) return false;
  a.run();
  return true;
}
