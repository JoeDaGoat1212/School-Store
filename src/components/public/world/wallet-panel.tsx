"use client";

import { useEffect, useRef } from "react";
import { BriefcaseIcon, CarFrontIcon, HomeIcon, KeyRoundIcon, LandmarkIcon, ShieldCheckIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGameVersion } from "./game-events";
import { PLAYER_LOOK } from "./humanoid";
import { JOB_LEVELS, pockets, profile, usd } from "./profile";
import { SHOPS } from "./world-map";
import { carName, houseName } from "./wallet-names";

/*
 * Your wallet: your city ID card (name, ID number, photo, address), your
 * cash, your bank card, the keys to your cars and houses, your job badges,
 * and anything you've, er, picked up (a guard's keycard…). Open with I.
 */

export function WalletPanel({ onClose }: { onClose: () => void }) {
  useGameVersion();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  const home = profile.home ?? profile.houses[0] ?? null;
  const jobs = profile.applications.filter((a) => a.status === "hired" || a.status === "pending");

  return (
    <div role="dialog" aria-modal="true" aria-label="Your wallet" className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[#5b3a26] p-4 text-black shadow-2xl animate-in slide-in-from-bottom duration-300 sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between px-1 text-white">
          <h2 className="font-heading text-2xl font-extrabold tracking-wide uppercase">Wallet</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-white/15 transition-colors hover:bg-white/25">
            <XIcon className="size-5" />
          </button>
        </div>

        {/* ---- The ID card ---- */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#dfeefc] via-[#f6fbff] to-[#cfe6f5] p-4 shadow-lg ring-1 ring-black/10">
          <div className="absolute -top-6 -right-6 size-28 rounded-full bg-[#3d6fe0]/10" />
          <div className="flex items-center justify-between">
            <p className="font-heading text-sm font-extrabold tracking-[0.2em] text-[#1d4f91] uppercase">City ID card</p>
            <ShieldCheckIcon className="size-5 text-[#1d4f91]" />
          </div>
          <div className="mt-3 flex gap-4">
            <Portrait />
            <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-xs font-bold text-black/50 uppercase">Name</dt>
              <dd className="font-heading text-lg leading-tight font-extrabold">{profile.name}</dd>
              <dt className="text-xs font-bold text-black/50 uppercase">ID no.</dt>
              <dd className="font-mono font-bold tracking-wider">{profile.idNumber}</dd>
              <dt className="text-xs font-bold text-black/50 uppercase">Address</dt>
              <dd>{home ? houseName(home) : "No fixed address"}</dd>
              <dt className="text-xs font-bold text-black/50 uppercase">Issued</dt>
              <dd>{new Date(profile.since).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</dd>
            </dl>
          </div>
          {!profile.signedIn && (
            <p className="mt-3 rounded-xl bg-[#ffd21f]/40 px-3 py-2 text-xs font-semibold">Guest ID: sign in to get your own ID number, save your money, and apply for jobs.</p>
          )}
        </div>

        {/* ---- Money ---- */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border-2 border-black/20 bg-[#6cc04a] p-3 shadow">
            <p className="text-xs font-bold uppercase">Cash</p>
            <p className="font-heading text-2xl font-extrabold tabular-nums">{usd(profile.cash)}</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-[#1b1d21] to-[#3a4150] p-3 text-white shadow">
            <p className="flex items-center gap-1 text-xs font-bold text-white/70 uppercase">
              <LandmarkIcon className="size-3.5" /> City Bank card
            </p>
            <p className="font-heading text-2xl font-extrabold tabular-nums">{usd(profile.bank)}</p>
            <p className="mt-1 font-mono text-[10px] tracking-widest text-white/50">•••• {profile.idNumber.slice(-4)}</p>
          </div>
        </div>

        {/* ---- Keys, badges, and other bits ---- */}
        <Section icon={<CarFrontIcon className="size-4" />} title="Car keys">
          {profile.cars.length === 0 ? <Empty>No cars yet. The dealership by the bank has some beauties.</Empty> : profile.cars.map((c) => <Item key={c.id}>{carName(c.model)}</Item>)}
        </Section>
        <Section icon={<HomeIcon className="size-4" />} title="House keys">
          {profile.houses.length === 0 ? (
            <Empty>No house yet. Visit Keystone Realty in the city for a tour.</Empty>
          ) : (
            profile.houses.map((h) => (
              <Item key={h}>
                {houseName(h)} {h === home && <span className="ml-1 rounded-full bg-black/10 px-2 text-xs">home</span>}
              </Item>
            ))
          )}
        </Section>
        <Section icon={<BriefcaseIcon className="size-4" />} title="Work">
          {jobs.length === 0 ? (
            <Empty>No job yet. Ask for a résumé at the counter of any shop on Restaurant Row.</Empty>
          ) : (
            jobs.map((j) => {
              const p = profile.jobs[j.business];
              const lvl = JOB_LEVELS[Math.min(p?.level ?? j.level, JOB_LEVELS.length - 1)];
              return (
                <Item key={j.id}>
                  {SHOPS[j.business].name} ·{" "}
                  {j.status === "pending" ? <span className="text-black/60">résumé sent, waiting to hear back</span> : `${lvl.title}, ${usd(lvl.wage)}/hr`}
                </Item>
              );
            })
          )}
        </Section>
        {pockets.keycard && (
          <Section icon={<KeyRoundIcon className="size-4" />} title="Other">
            <Item>A prison guard&apos;s keycard (opens the security doors)</Item>
          </Section>
        )}
      </div>
    </div>
  );
}

function Portrait() {
  const l = PLAYER_LOOK;
  return (
    <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-gradient-to-b from-[#a9dcfb] to-[#e8f6ff] ring-1 ring-black/10" aria-hidden>
      <div className="absolute bottom-0 left-1/2 h-9 w-16 -translate-x-1/2 rounded-t-[2rem]" style={{ background: l.shirt }} />
      <div className="absolute bottom-7 left-1/2 h-12 w-10 -translate-x-1/2 rounded-[45%]" style={{ background: l.skin }} />
      <div className="absolute bottom-[3.9rem] left-1/2 h-6 w-11 -translate-x-1/2 rounded-t-full" style={{ background: l.hair }} />
      <div className="absolute bottom-[3.2rem] left-[1.85rem] size-1.5 rounded-full bg-black/80" />
      <div className="absolute right-[1.85rem] bottom-[3.2rem] size-1.5 rounded-full bg-black/80" />
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3 rounded-2xl bg-[#f6f1e7] p-3">
      <h3 className="mb-1.5 flex items-center gap-1.5 font-heading text-sm font-extrabold tracking-wide uppercase">
        {icon} {title}
      </h3>
      <ul className="grid gap-1">{children}</ul>
    </section>
  );
}
const Item = ({ children }: { children: React.ReactNode }) => <li className={cn("rounded-xl bg-white px-3 py-1.5 text-sm font-semibold")}>{children}</li>;
const Empty = ({ children }: { children: React.ReactNode }) => <li className="px-1 text-sm text-black/55">{children}</li>;
