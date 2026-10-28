"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { Placement, StoreItem, Tag } from "../store/layout";
import { useLook } from "../store/models";

/*
 * Products on the shelves. Every copy of a product is drawn in one go (an
 * "instanced mesh"), which keeps hundreds of cans and bags smooth.
 */

/**
 * Every copy of one product, drawn together (an "instanced mesh": one shape,
 * many positions). Pointing at a copy lifts it; tapping it adds the product to
 * the cart and the copy hops.
 */
export function ProductCopies({
  item,
  placements,
  interactive,
  onTap,
  onHover,
}: {
  item: StoreItem;
  placements: Placement[];
  interactive: boolean;
  onTap: (item: StoreItem, x: number, y: number) => void;
  onHover: (item: StoreItem | null) => void;
}) {
  const look = useLook(item.model, item.name, item.color);
  const ref = useRef<THREE.InstancedMesh>(null);
  const hovered = useRef(-1);
  const release = useRef<number[]>([]);
  const hops = useRef(new Map<number, number>());
  const clock = useRef(0);
  const tmp = useMemo(() => new THREE.Object3D(), []);

  /** Put copy i in its spot, lifted by `lift` and hopping by `hop`. */
  const place = (mesh: THREE.InstancedMesh, i: number, lift = 0, hop = 0) => {
    const p = placements[i];
    tmp.position.set(p.x, p.y + lift + hop, p.z + lift * 0.6);
    tmp.rotation.set(p.tilt, p.turn, 0, "YXZ");
    tmp.updateMatrix();
    mesh.setMatrixAt(i, tmp.matrix);
  };

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < placements.length; i++) place(mesh, i);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    // `place` only reads `placements`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look, placements]);

  useFrame((state) => {
    const mesh = ref.current;
    clock.current = state.clock.elapsedTime;
    if (!mesh) return;
    let changed = false;
    for (const i of release.current) {
      place(mesh, i);
      changed = true;
    }
    release.current = [];
    for (const [i, start] of hops.current) {
      const t = (state.clock.elapsedTime - start) / 0.45;
      if (t >= 1) hops.current.delete(i);
      place(mesh, i, i === hovered.current ? 0.06 : 0, t < 1 ? Math.sin(t * Math.PI) * 0.2 : 0);
      changed = true;
    }
    if (hovered.current >= 0 && !hops.current.has(hovered.current)) {
      place(mesh, hovered.current, 0.06);
      changed = true;
    }
    if (changed) mesh.instanceMatrix.needsUpdate = true;
  });

  if (!look) return null;

  const setHover = (i: number) => {
    if (hovered.current === i) return;
    if (hovered.current >= 0) release.current.push(hovered.current);
    hovered.current = i;
  };

  return (
    <instancedMesh
      key={look.geometry.uuid}
      ref={ref}
      args={[look.geometry, look.material, placements.length]}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (!interactive || e.instanceId === undefined) return;
        e.stopPropagation();
        setHover(e.instanceId);
        onHover(item);
        document.body.style.cursor = item.soldOut ? "not-allowed" : "pointer";
      }}
      onPointerOut={() => {
        if (!interactive) return;
        setHover(-1);
        onHover(null);
        document.body.style.cursor = "";
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (!interactive || e.instanceId === undefined || e.delta > 8) return;
        e.stopPropagation();
        if (!item.soldOut) hops.current.set(e.instanceId, clock.current);
        onTap(item, e.nativeEvent.clientX, e.nativeEvent.clientY);
      }}
    />
  );
}

const tagTextures = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>();

/** "Coke  $2.00" (or "Sold out"), drawn once per product and shared by its tags. */
function tagTexture(item: StoreItem) {
  const key = `${item.id}|${item.name}|${item.label}|${item.soldOut}`;
  let t = tagTextures.get(key);
  if (!t) {
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-body").trim() || "sans-serif";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const h = 64;
    const price = item.soldOut ? "Sold out" : item.label;
    ctx.font = `700 30px ${family}`;
    const nameW = ctx.measureText(item.name).width;
    ctx.font = `800 32px ${family}`;
    const priceW = ctx.measureText(price).width;
    canvas.width = Math.ceil(nameW + priceW + 52);
    canvas.height = h;
    ctx.fillStyle = "#0a0a0b";
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, h, 10);
    ctx.fill();
    ctx.textBaseline = "middle";
    ctx.font = `700 30px ${family}`;
    ctx.fillStyle = "#fff";
    ctx.fillText(item.name, 16, h / 2 + 2);
    ctx.font = `800 32px ${family}`;
    ctx.fillStyle = item.soldOut ? "#ff8a8a" : "#ff7a45";
    ctx.fillText(price, canvas.width - 16 - priceW, h / 2 + 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    t = { texture, aspect: canvas.width / h };
    tagTextures.set(key, t);
  }
  return t;
}

export function PriceTag({ tag, item }: { tag: Tag; item: StoreItem }) {
  const { texture, aspect } = tagTexture(item);
  const height = Math.min(0.11, tag.width / aspect);
  return (
    <mesh position={[tag.x, tag.y - 0.07, tag.z + 0.035]} raycast={() => null}>
      <planeGeometry args={[height * aspect, height]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}
