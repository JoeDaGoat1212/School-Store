/*
 * Cinematic camera moves (house tours, the gate opening…): while `on`, the
 * camera sits at `pos` looking at `look`, and the screen can fade to black
 * and show a caption. Plain TypeScript; camera.tsx and city-hud.tsx read it.
 */

export type Caption = { title: string; line?: string; facts?: string[] };

export const cutscene = {
  on: false,
  pos: [0, 0, 0] as [number, number, number],
  look: [0, 0, 0] as [number, number, number],
  /** How dark the screen is (0…1). */
  fade: 0,
  caption: null as Caption | null,
};

export function setShot(pos: [number, number, number], look: [number, number, number]) {
  cutscene.on = true;
  cutscene.pos = pos;
  cutscene.look = look;
}

export function endCutscene() {
  cutscene.on = false;
  cutscene.fade = 0;
  cutscene.caption = null;
}
