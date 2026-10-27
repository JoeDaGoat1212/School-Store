"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { readableOn, shade, type ProductLook } from "@/lib/product-look";

/*
 * The 3D part of the drinks showcase (React Three Fiber = three.js in React).
 *
 * Every drink uses one of four shapes built from simple geometry — a can,
 * a bottle, a milk carton, a juice pouch — with a label drawn for it on a
 * <canvas>. So adding a drink needs no 3D work: its shape and colors come
 * from src/lib/product-look.ts.
 *
 * The drinks sit in a row. The chosen one is in the middle, big, slowly
 * turning; its neighbours wait smaller and further back on each side.
 */

export type SceneItem = { id: string; name: string; subtitle: string; look: ProductLook };

const SPACING = 1.75; // distance between drinks in the row

export default function DrinkScene({
  items,
  index,
  active,
  calm,
  onSelect,
}: {
  items: SceneItem[];
  index: number;
  /** False when scrolled off screen: stop drawing to save battery. */
  active: boolean;
  /** "Reduce motion": no spinning or floating. */
  calm: boolean;
  onSelect: (i: number) => void;
}) {
  const fontsReady = useFontsReady();

  return (
    <Canvas
      dpr={[1, 1.75]}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 0.15, 5.2], fov: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ touchAction: "pan-y" }}
    >
      {/* Studio lighting: soft strips around the drink make the metal and plastic shine. */}
      <ambientLight intensity={0.35} />
      <directionalLight position={[2.5, 4, 5]} intensity={1.4} />
      <Environment resolution={256}>
        <Lightformer intensity={2.2} position={[0, 5, -3]} scale={[12, 3, 1]} />
        <Lightformer intensity={3.2} rotation-y={Math.PI / 2} position={[-5, 0.5, 1]} scale={[12, 1.2, 1]} />
        <Lightformer intensity={2.4} rotation-y={-Math.PI / 2} position={[5, 0.5, 1]} scale={[12, 1.2, 1]} />
        <Lightformer form="ring" intensity={1.6} position={[2, 2, 5]} scale={2.5} />
      </Environment>

      <FitToScreen>
        {fontsReady &&
          items.map((item, i) =>
            Math.abs(i - index) <= 2 ? (
              <Drink key={item.id} item={item} offset={i - index} calm={calm} onClick={() => onSelect(i)} />
            ) : null,
          )}
      </FitToScreen>

      <ContactShadows position={[0, -1.08, 0]} opacity={0.38} scale={7} blur={2.4} far={2.2} resolution={512} />
    </Canvas>
  );
}

/** On tall, narrow screens (phones), shrink the scene a little so the drink fits. */
function FitToScreen({ children }: { children: React.ReactNode }) {
  const aspect = useThree((state) => state.viewport.aspect);
  const scale = Math.min(1, Math.max(0.72, aspect / 0.95));
  return (
    <group scale={scale} position-y={aspect < 1 ? -0.08 : 0}>
      {children}
    </group>
  );
}

/** Wait for the display font, so the labels are drawn in it (not a fallback). */
function useFontsReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    (document.fonts?.ready ?? Promise.resolve()).then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

/** One drink: glides to its place in the row; the middle one turns and floats. */
function Drink({ item, offset, calm, onClick }: { item: SceneItem; offset: number; calm: boolean; onClick: () => void }) {
  const group = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const centered = offset === 0;

  useFrame((state, delta) => {
    const g = group.current;
    const s = spin.current;
    if (!g || !s) return;
    const t = state.clock.elapsedTime;
    // Ease toward the target spot (a little each frame = smooth sliding).
    const ease = 1 - Math.pow(0.0015, delta);
    const target = new THREE.Vector3(offset * SPACING, centered && !calm ? Math.sin(t * 1.3) * 0.05 : 0, -Math.abs(offset) * 1.4);
    g.position.lerp(target, ease);
    const scale = centered ? 1 : 0.72;
    g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, scale, ease));
    // The middle drink turns slowly to show off its label; the others face us, slightly angled.
    if (centered && !calm) s.rotation.y += delta * 0.55;
    else s.rotation.y = THREE.MathUtils.lerp(s.rotation.y, offset * -0.35, ease);
    s.rotation.z = THREE.MathUtils.lerp(s.rotation.z, centered ? -0.06 : 0, ease);
  });

  return (
    <group
      ref={group}
      position={[offset * SPACING, 0, -Math.abs(offset) * 1.4]}
      scale={centered ? 1 : 0.72}
      onClick={(e) => {
        e.stopPropagation();
        if (!centered) onClick();
      }}
      onPointerOver={() => !centered && (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <group ref={spin}>
        <Model item={item} />
      </group>
    </group>
  );
}

function Model({ item }: { item: SceneItem }) {
  const label = useLabel(item);
  switch (item.look.shape) {
    case "bottle":
      return <Bottle look={item.look} label={label} />;
    case "carton":
      return <Carton look={item.look} label={label} />;
    case "pouch":
      return <Pouch look={item.look} label={label} />;
    default:
      return <Can label={label} />;
  }
}

// ---- Shapes -------------------------------------------------------------------

const lathe = (points: [number, number][], segments = 64) =>
  new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);

const silver = { color: "#d9dee4", metalness: 1, roughness: 0.22 };

/** A 12 oz soda can: printed metal body, shiny rims. */
function Can({ label }: { label: THREE.Texture }) {
  const top = useMemo(() => lathe([[0.36, 0.74], [0.35, 0.8], [0.31, 0.9], [0.3, 0.95], [0.27, 0.955], [0, 0.95]]), []);
  const bottom = useMemo(() => lathe([[0, -0.94], [0.22, -0.93], [0.27, -0.95], [0.33, -0.9], [0.36, -0.76]]), []);
  return (
    <group>
      <mesh>
        {/* thetaStart = π puts the middle of the label at the front. */}
        <cylinderGeometry args={[0.36, 0.36, 1.5, 96, 1, true, Math.PI, Math.PI * 2]} />
        <meshPhysicalMaterial map={label} metalness={0.45} roughness={0.3} clearcoat={1} clearcoatRoughness={0.12} />
      </mesh>
      <mesh geometry={top}>
        <meshStandardMaterial {...silver} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={bottom}>
        <meshStandardMaterial {...silver} side={THREE.DoubleSide} />
      </mesh>
      {/* the tab */}
      <mesh position={[0, 0.96, 0.08]} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[0.07, 0.018, 8, 24]} />
        <meshStandardMaterial {...silver} />
      </mesh>
    </group>
  );
}

/** A plastic bottle tinted the drink's color, with a printed label band and a cap. */
function Bottle({ look, label }: { look: ProductLook; label: THREE.Texture }) {
  const body = useMemo(
    () =>
      lathe([
        [0, -1.0],
        [0.3, -1.0],
        [0.34, -0.95],
        [0.35, -0.85],
        [0.33, -0.7],
        [0.35, -0.55],
        [0.35, 0.25],
        [0.33, 0.38],
        [0.24, 0.6],
        [0.15, 0.74],
        [0.13, 0.82],
        [0.13, 0.86],
      ]),
    [],
  );
  return (
    <group position-y={0.02}>
      <mesh geometry={body}>
        <meshPhysicalMaterial color={look.accent} roughness={0.08} metalness={0} clearcoat={1} transparent opacity={0.82} side={THREE.DoubleSide} />
      </mesh>
      <mesh position-y={-0.16}>
        <cylinderGeometry args={[0.356, 0.356, 0.68, 96, 1, true, Math.PI, Math.PI * 2]} />
        <meshPhysicalMaterial map={label} roughness={0.35} clearcoat={0.6} />
      </mesh>
      <mesh position-y={0.94}>
        <cylinderGeometry args={[0.15, 0.15, 0.17, 40]} />
        <meshStandardMaterial color={look.color} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** A school milk carton with a peaked top. */
function Carton({ look, label }: { look: ProductLook; label: THREE.Texture }) {
  return (
    <group position-y={-0.15}>
      <mesh>
        <boxGeometry args={[0.66, 1.2, 0.66]} />
        <meshStandardMaterial map={label} roughness={0.55} />
      </mesh>
      {/* Peaked roof: a 3-sided prism, ridge running front to back, point up */}
      <mesh position-y={0.79} rotation-x={-Math.PI / 2}>
        <cylinderGeometry args={[0.381, 0.381, 0.66, 3]} />
        <meshStandardMaterial color="#f7f4ee" roughness={0.6} flatShading />
      </mesh>
      <mesh position-y={1.2}>
        <boxGeometry args={[0.04, 0.14, 0.66]} />
        <meshStandardMaterial color={look.color} roughness={0.6} />
      </mesh>
    </group>
  );
}

/** A juice pouch with a straw. */
function Pouch({ look, label }: { look: ProductLook; label: THREE.Texture }) {
  return (
    <group>
      <RoundedBox args={[0.9, 1.45, 0.2]} radius={0.09} smoothness={6}>
        <meshPhysicalMaterial map={label} metalness={0.35} roughness={0.25} clearcoat={1} />
      </RoundedBox>
      <mesh position={[0.25, 0.92, 0]} rotation-z={-0.2}>
        <cylinderGeometry args={[0.03, 0.03, 0.55, 16]} />
        <meshStandardMaterial color={look.accent} roughness={0.3} />
      </mesh>
    </group>
  );
}

// ---- Labels ---------------------------------------------------------------------

/**
 * Draws a label for the drink: its color, a sweeping stripe in the accent
 * color, and its name in the store's display font. No brand logos.
 */
function useLabel(item: SceneItem) {
  const texture = useMemo(() => {
    const wide = item.look.shape === "can" || item.look.shape === "bottle";
    const w = wide ? 1024 : 512;
    const h = wide ? 512 : 768;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const { color, accent } = item.look;

    // Background with a soft vertical shade.
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, shade(color, 0.12));
    bg.addColorStop(1, shade(color, -0.18));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // A sweeping accent stripe across the front.
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.78);
    ctx.bezierCurveTo(w * 0.3, h * 0.6, w * 0.6, h * 0.98, w, h * 0.74);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.7);
    ctx.bezierCurveTo(w * 0.3, h * 0.52, w * 0.6, h * 0.9, w, h * 0.66);
    ctx.lineTo(w, h * 0.7);
    ctx.bezierCurveTo(w * 0.6, h * 0.94, w * 0.3, h * 0.56, 0, h * 0.74);
    ctx.fill();
    ctx.globalAlpha = 1;

    // The name, centered on the front of the label.
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "sans-serif";
    const words = item.name.toUpperCase().split(" ");
    const lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [words.join(" ")];
    const maxWidth = wide ? w * 0.42 : w * 0.8;
    const cx = w / 2;
    let size = wide ? 150 : 120;
    ctx.font = `800 ${size}px ${family}`;
    while (Math.max(...lines.map((l) => ctx.measureText(l).width)) > maxWidth && size > 40) {
      size -= 4;
      ctx.font = `800 ${size}px ${family}`;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = readableOn(color);
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 12;
    const top = h * (wide ? 0.42 : 0.38) - ((lines.length - 1) * size * 0.95) / 2;
    lines.forEach((line, i) => ctx.fillText(line, cx, top + i * size * 0.95));
    ctx.shadowBlur = 0;

    // Size or detail line, small, under the name.
    if (item.subtitle) {
      ctx.font = `600 ${wide ? 30 : 34}px ${family}`;
      ctx.globalAlpha = 0.85;
      ctx.fillText(item.subtitle.toUpperCase(), cx, top + lines.length * size * 0.95 - size * 0.25 + 22);
      ctx.globalAlpha = 1;
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [item]);

  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}
