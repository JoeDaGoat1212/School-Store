"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { player } from "./bump";
import { drive } from "./drive";
import { Humanoid, PRISONER_LOOK, newPose, type Look } from "./humanoid";
import { life } from "./life";

/*
 * You, as a person: seen in third person (mouse wheel or V), and in
 * cutscenes (being handcuffed, walked to the police car). Your legs walk
 * when you walk, you jump, put your hands up, and so on. In jail you wear
 * orange.
 */

export const PLAYER_LOOK: Look = { skin: "#e0ac83", hair: "#2a1a12", hairStyle: "short", shirt: "#3d6fe0", pants: "#2b2f36", shoes: "#f2f2f2" };

export function PlayerAvatar() {
  const g = useRef<THREE.Group>(null);
  const pose = useMemo(newPose, []);
  const prisoner = useMemo(() => PRISONER_LOOK(PLAYER_LOOK), []);
  const normal = useRef<THREE.Group>(null);
  const orange = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const group = g.current;
    if (!group) return;
    const seen = (player.view === "third" || player.showBody || life.dead) && player.onFoot && !drive.active && !player.hidden;
    group.visible = seen;
    if (!seen) return;
    group.position.set(player.x, player.y, player.z);
    group.rotation.y = Math.PI - player.yaw;
    const gait = player.speed <= 0 ? 0 : player.speed > 9 ? 2 : 1;
    pose.gait = THREE.MathUtils.damp(pose.gait, gait, 10, delta);
    pose.phase += player.speed * delta * 1.25;
    pose.air = THREE.MathUtils.damp(pose.air, player.grounded ? 0 : 1, 12, delta);
    const a = player.anim;
    pose.handsUp = a.handsUp;
    pose.cuffed = a.cuffed;
    pose.down = life.dead ? Math.min(1, pose.down + delta * 2) : a.down;
    pose.sit = a.sit;
    pose.reach = a.reach;
    if (normal.current) normal.current.visible = !life.inJail;
    if (orange.current) orange.current.visible = life.inJail;
  });

  return (
    <group ref={g} visible={false}>
      <group ref={normal}>
        <Humanoid look={PLAYER_LOOK} pose={pose} />
      </group>
      <group ref={orange} visible={false}>
        <Humanoid look={prisoner} pose={pose} />
      </group>
    </group>
  );
}
