"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { player } from "./bump";
import { drive } from "./drive";
import { Humanoid, PLAYER_LOOK, PRISONER_LOOK, newPose } from "./humanoid";
import { life } from "./life";

/*
 * You, as a person: seen in third person (mouse wheel or V), and in
 * cutscenes (being handcuffed, walked to the police car). Your legs walk
 * when you walk, you jump, put your hands up, and so on. In jail you wear
 * orange.
 */

export { PLAYER_LOOK };

export function PlayerAvatar() {
  const g = useRef<THREE.Group>(null);
  const pose = useMemo(newPose, []);
  const prisoner = useMemo(() => PRISONER_LOOK(PLAYER_LOOK), []);
  const normal = useRef<THREE.Group>(null);
  const orange = useRef<THREE.Group>(null);
  const chute = useRef<THREE.Group>(null);

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
    if (chute.current) {
      chute.current.visible = player.chute;
      chute.current.rotation.z = Math.sin(performance.now() / 600) * 0.06;
    }
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
      {/* The parachute: a striped canopy on lines */}
      <group ref={chute} visible={false} position-y={3.4}>
        <mesh position-y={5.2} scale={[4.6, 1.6, 3]}>
          <sphereGeometry args={[1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#ff5a1f" roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
        <mesh position-y={5.21} scale={[4.62, 1.61, 3.02]}>
          <sphereGeometry args={[1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#ffd21f" roughness={0.7} wireframe />
        </mesh>
        {[
          [-4, -2.6],
          [4, -2.6],
          [-4, 2.6],
          [4, 2.6],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x / 2, 2.6, z / 2]} rotation={[z > 0 ? 0.6 : -0.6, 0, x > 0 ? -0.65 : 0.65]}>
            <cylinderGeometry args={[0.02, 0.02, 6.4, 4]} />
            <meshBasicMaterial color="#333" />
          </mesh>
        ))}
      </group>
    </group>
  );
}
