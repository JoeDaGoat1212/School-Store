"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { PHOTO_MODELS } from "@/components/public/showcase/drink-models";
import { PACKS, modelFor } from "@/components/public/store/catalog";
import { useLook } from "@/components/public/store/models";

/** Every product that has a real 3D model (drinks and cups traced from photos, puffed snack packs). */
export const RENDER_SLUGS = [...Object.keys(PHOTO_MODELS), ...Object.keys(PACKS)];

/** How tall the tallest drink is: every drink is drawn at the same scale, so a can looks smaller than a bottle. */
const DRINK_FRAME = 0.9;

export function RenderStudio({ slug }: { slug: string }) {
  // The script reads the list of products to draw from here.
  useEffect(() => {
    (window as unknown as { __slugs?: string[] }).__slugs = RENDER_SLUGS;
  }, []);
  return (
    <div style={{ width: 800, height: 800, background: "repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0 / 40px 40px" }}>
      <Canvas
        dpr={1}
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping }}
        camera={{ fov: 22, position: [0, 0, 6] }}
        style={{ width: 800, height: 800 }}
      >
        <ambientLight intensity={0.45} />
        <directionalLight position={[3, 5, 6]} intensity={2.2} />
        <directionalLight position={[-4, 2, -3]} intensity={1.1} color="#dfe9ff" />
        <Environment resolution={256} frames={1}>
          <Lightformer intensity={2.2} position={[0, 5, -3]} scale={[12, 3, 1]} />
          <Lightformer intensity={3} rotation-y={Math.PI / 2} position={[-5, 0.5, 1]} scale={[12, 1.2, 1]} />
          <Lightformer intensity={2.2} rotation-y={-Math.PI / 2} position={[5, 0.5, 1]} scale={[12, 1.2, 1]} />
          <Lightformer intensity={1.2} position={[0, 0, 5]} scale={[6, 6, 1]} />
        </Environment>
        <Product slug={slug} />
      </Canvas>
    </div>
  );
}

function Product({ slug }: { slug: string }) {
  const model = useMemo(() => modelFor(slug, "snacks"), [slug]);
  const look = useLook(model, slug, "#cccccc");
  // Drinks: the full-size label picture (sharper than the one the store uses).
  const [label, setLabel] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (model.type !== "lathe") return;
    new THREE.TextureLoader().load(`/showcase/drinks/${slug}.webp`, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 16;
      setLabel(t);
    });
  }, [model.type, slug]);

  const fit = useMemo(() => {
    if (!look) return null;
    const g = look.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const box = g.boundingBox!.clone();
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const drink = model.type === "lathe" && model.kind !== "cup";
    // How much of the picture the product fills.
    const frame = drink ? DRINK_FRAME : Math.max(size.x, size.y) * 1.22;
    return { size, center, frame, drink };
  }, [look, model]);

  const ready = Boolean(look && fit && (model.type !== "lathe" || label));
  const { camera } = useThree();
  useEffect(() => {
    if (!fit) return;
    const cam = camera as THREE.PerspectiveCamera;
    const dist = fit.frame / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / 0.84;
    // A little above, looking slightly down: a classic product shot.
    cam.position.set(0, dist * 0.12, dist);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  }, [fit, camera]);

  // Tell the script once a few frames have been drawn with everything loaded.
  const [frames, setFrames] = useState(0);
  useFrame(() => {
    if (ready && frames < 6) setFrames((f) => f + 1);
  });
  useEffect(() => {
    if (frames >= 6) (window as unknown as { __rendered?: boolean }).__rendered = true;
  }, [frames]);

  if (!look || !fit) return null;
  const material =
    model.type === "lathe" && label ? (
      <meshStandardMaterial
        map={label}
        roughness={model.kind === "bottle" ? 0.28 : 0.34}
        metalness={0.05}
        envMapIntensity={0.8}
        transparent={Boolean(model.clear)}
        depthWrite={!model.clear}
      />
    ) : null;
  // Drinks all stand on the same floor line (so their sizes compare); the rest are centred.
  const lift = fit.drink ? -fit.frame * 0.42 + fit.size.y / 2 : 0;
  const bottom = lift - fit.size.y / 2;
  return (
    <group position-y={lift}>
      <group rotation-y={fit.drink ? 0.28 : -0.22} rotation-x={fit.drink ? 0 : 0.04}>
        <mesh geometry={look.geometry} material={material ? undefined : look.material} position={[-fit.center.x, -fit.center.y, -fit.center.z]}>
          {material}
        </mesh>
      </group>
      <ContactShadows position={[0, bottom - lift - 0.002, 0]} scale={fit.frame * 1.6} blur={2.2} opacity={0.35} far={fit.frame} resolution={512} frames={1} />
    </group>
  );
}
