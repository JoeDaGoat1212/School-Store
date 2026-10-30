"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CarFrontIcon, GaugeIcon, TimerIcon, XIcon, ZapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CarModel, MotorbikeModel, newLook } from "./car-model";
import { buyCar, dealer, openDealer } from "./dealer";
import { useGameVersion } from "./game-events";
import { profile, usd } from "./profile";
import { CATEGORIES, MODELS, type Category, type Model } from "./vehicles";

/*
 * The big touch screen at Apex Motors: every car and bike for sale, by
 * type, with the price (like the real thing), top speed, 0–60 time and a
 * 3D preview that spins (drag to turn it). Pick a colour and buy it.
 */

export function DealerPanel() {
  useGameVersion();
  if (!dealer.open) return null;
  return <Catalogue />;
}

const close = () => openDealer(false);

function Catalogue() {
  const [cat, setCat] = useState<Category>("Sedans");
  const list = MODELS.filter((m) => m.category === cat);
  const [pick, setPick] = useState<Model>(list[0]);
  const [color, setColor] = useState(pick.colors[0]);
  const [error, setError] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.code === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const choose = (m: Model) => {
    setPick(m);
    setColor(m.colors[0]);
    setError(null);
    setSure(false);
  };
  const money = profile.cash + profile.bank;
  const fastest = Math.max(...MODELS.map((m) => m.top));

  return (
    <div role="dialog" aria-modal="true" aria-label="Apex Motors" className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={close} className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      <div className="relative flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-[#0f1115] text-white shadow-2xl animate-in slide-in-from-bottom duration-300 sm:rounded-3xl">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
          <span className="font-heading text-2xl font-extrabold tracking-[0.18em] uppercase">
            Apex <span className="text-[#ff3b30]">Motors</span>
          </span>
          <span className="ml-auto rounded-full bg-white/10 px-3 py-1 text-sm font-bold tabular-nums">You have {usd(money)}</span>
          <button ref={ref} type="button" onClick={close} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20">
            <XIcon className="size-5" />
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-3 py-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setCat(c);
                choose(MODELS.find((m) => m.category === c)!);
              }}
              className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm font-bold", c === cat ? "bg-white text-black" : "text-white/70 hover:bg-white/10")}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[16rem_1fr]">
          <ul className="border-white/10 p-2 md:border-r">
            {list.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => choose(m)} className={cn("w-full rounded-xl px-3 py-2.5 text-left", m.id === pick.id ? "bg-white/15" : "hover:bg-white/5")}>
                  <p className="font-bold">{m.name}</p>
                  <p className="text-sm text-white/60 tabular-nums">
                    {usd(m.price)} · {m.top} mph
                  </p>
                </button>
              </li>
            ))}
          </ul>
          <div className="p-4">
            <div className="relative h-64 overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_center,#3a3f4a,#0f1115_75%)] sm:h-80">
              <Canvas camera={{ position: [7, 3.2, 8], fov: 34 }} dpr={[1, 2]} shadows>
                <Preview model={pick} color={color} />
              </Canvas>
              <p className="pointer-events-none absolute bottom-2 left-3 text-xs text-white/50">Drag to turn it</p>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="flex-1">
                <p className="text-xs font-bold tracking-widest text-white/50 uppercase">{pick.category}</p>
                <h3 className="font-heading text-3xl font-extrabold">{pick.name}</h3>
                <p className="text-white/70">{pick.blurb}</p>
              </div>
              <p className="font-heading text-4xl font-extrabold tabular-nums">{usd(pick.price)}</p>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2">
              <Stat icon={<GaugeIcon className="size-4" />} label="Top speed" value={`${pick.top} mph`} bar={pick.top / fastest} />
              <Stat icon={<TimerIcon className="size-4" />} label="0–60 mph" value={`${pick.zeroToSixty.toFixed(1)} s`} bar={1 - (pick.zeroToSixty - 2) / 8.5} />
              <Stat icon={<ZapIcon className="size-4" />} label="Handling" value={`${Math.round(pick.grip * 50)}/100`} bar={pick.grip / 1.75} />
            </dl>
            <div className="mt-4 flex items-center gap-2">
              <span className="text-sm font-bold text-white/60">Colour</span>
              {pick.colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  aria-pressed={c === color}
                  onClick={() => setColor(c)}
                  className={cn("size-8 rounded-full ring-2 ring-offset-2 ring-offset-[#0f1115]", c === color ? "ring-white" : "ring-transparent")}
                  style={{ background: c }}
                />
              ))}
            </div>
            {error && <p className="mt-3 rounded-xl bg-red-500/20 px-3 py-2 text-sm font-semibold text-red-200">{error}</p>}
            {sure ? (
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const e = buyCar(pick.id, color);
                    if (e) {
                      setError(e);
                      setSure(false);
                    }
                  }}
                  className="flex-1 rounded-full bg-[#2fbf4a] py-3 font-heading text-lg font-extrabold tracking-wide text-black uppercase"
                >
                  Yes, buy it for {usd(pick.price)}
                </button>
                <button type="button" onClick={() => setSure(false)} className="rounded-full bg-white/10 px-5 font-bold">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={money < pick.price}
                onClick={() => setSure(true)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#ff3b30] py-3 font-heading text-lg font-extrabold tracking-wide uppercase disabled:bg-white/10 disabled:text-white/40"
              >
                <CarFrontIcon className="size-5" /> {money < pick.price ? `Need ${usd(pick.price - money)} more` : "Buy it"}
              </button>
            )}
            <p className="mt-2 text-center text-xs text-white/40">Paid from your bank card first, then cash. Pretend money for the 3D world only.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, bar }: { icon: React.ReactNode; label: string; value: string; bar: number }) {
  return (
    <div className="rounded-xl bg-white/5 p-2.5">
      <dt className="flex items-center gap-1 text-xs font-bold text-white/50 uppercase">
        {icon} {label}
      </dt>
      <dd className="font-heading text-xl font-extrabold tabular-nums">{value}</dd>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[#ff3b30]" style={{ width: `${Math.max(5, Math.min(100, bar * 100))}%` }} />
      </div>
    </div>
  );
}

function Preview({ model, color }: { model: Model; color: string }) {
  const g = useRef<THREE.Group>(null);
  const look = useMemo(newLook, []);
  const drag = useRef({ on: false, x: 0, v: 0.5 });
  useFrame((_, delta) => {
    if (!g.current) return;
    if (!drag.current.on) g.current.rotation.y += delta * drag.current.v;
    drag.current.v = THREE.MathUtils.damp(drag.current.v, 0.5, 1.5, delta);
  });
  return (
    <>
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#ffffff", "#30343c", 0.8]} />
      <directionalLight position={[6, 9, 5]} intensity={2.2} castShadow />
      <spotLight position={[-6, 8, -4]} intensity={60} angle={0.6} penumbra={0.6} color="#ffd9b0" />
      <group
        ref={g}
        position-y={-1}
        onPointerDown={(e) => {
          drag.current.on = true;
          drag.current.x = e.clientX;
          (e.target as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(e.pointerId);
        }}
        onPointerUp={() => (drag.current.on = false)}
        onPointerMove={(e) => {
          if (!drag.current.on || !g.current) return;
          const dx = e.clientX - drag.current.x;
          drag.current.x = e.clientX;
          g.current.rotation.y += dx * 0.01;
          drag.current.v = dx * 0.5;
        }}
      >
        {model.body === "moto" ? <MotorbikeModel color={color} look={look} /> : <CarModel color={color} look={look} body={model.body} />}
        <mesh rotation-x={-Math.PI / 2} position-y={0.01} receiveShadow>
          <circleGeometry args={[4.4, 48]} />
          <meshStandardMaterial color="#20232a" roughness={0.3} metalness={0.4} />
        </mesh>
      </group>
    </>
  );
}
