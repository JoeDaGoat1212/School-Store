"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BriefcaseIcon, ChefHatIcon, ClockIcon, FlameIcon, MinusIcon, PlusIcon, ReceiptTextIcon, ScissorsIcon, SendIcon, Undo2Icon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGameVersion, notify } from "./game-events";
import { GAME_HOUR, PROMOTE_AT, STRIKES, finishMaking, jobStatus, jobs, levelAt, progressAt, quitJob, sendResume, shiftClock, shiftPay, takeOrder, untaken, wageAt, type Ticket } from "./jobs";
import { MENUS, describe, emptyBuild, shortName, type Build, type Step } from "./menus";
import { JOB_LEVELS, profile, usd } from "./profile";
import { SHOPS, type ShopKey } from "./world-map";

/*
 * The screens for working at Restaurant Row (jobs.ts runs the game):
 *
 *   - the résumé you fill in to apply,
 *   - "your job" (title, pay, progress to the next promotion, quitting),
 *   - the order screen on the counter (take orders from the kiosk),
 *   - the kitchen: build each order by hand, then do the hands-on part
 *     (bake the pizza, grill the patties, pull the espresso, scoop the ice
 *     cream, trim the stems), and carry it to the counter,
 *   - the shift card in the corner while you work.
 */

const close = () => {
  jobs.panel = null;
  notify();
};

function Modal({ title, icon, accent, children, wide, onClose = close }: { title: string; icon: ReactNode; accent: string; children: ReactNode; wide?: boolean; onClose?: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.code === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
      <div className={cn("relative max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl bg-white text-black shadow-2xl animate-in slide-in-from-bottom duration-300 sm:rounded-3xl", wide ? "max-w-5xl" : "max-w-lg")}>
        <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-3 text-white" style={{ background: accent }}>
          <span className="grid size-9 place-items-center rounded-full bg-white/20">{icon}</span>
          <h2 className="flex-1 font-heading text-xl font-extrabold tracking-wide uppercase">{title}</h2>
          <button ref={ref} type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-white/15 transition-colors hover:bg-white/30">
            <XIcon className="size-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** Each shop's colour. */
export const SHOP_COLOR: Record<ShopKey, string> = { pizza: "#d6452b", icecream: "#e45f9b", coffee: "#6b4329", burger: "#e08a14", flowers: "#3f9b5a" };

/** Whichever job screen is open. */
export function JobPanels() {
  useGameVersion();
  const p = jobs.panel;
  if (!p) return null;
  if (p.kind === "resume") return <Resume shop={p.shop} />;
  if (p.kind === "job") return <YourJob shop={p.shop} />;
  if (p.kind === "orders") return <Orders shop={p.shop} />;
  return <Kitchen shop={p.shop} first={p.ticket} />;
}

// ---- Applying ---------------------------------------------------------------------------------

const SKILLS = ["Friendly with customers", "Fast under pressure", "Good with money", "Cooking", "Team player", "Always on time", "Creative", "Speaks another language"];

function Resume({ shop }: { shop: ShopKey }) {
  const S = SHOPS[shop];
  const [form, setForm] = useState({ name: profile.name, position: "Crew Member", why: "", experience: "", availability: "Weekends", reference: "" });
  const [skills, setSkills] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    const err = await sendResume(shop, { ...form, skills });
    setSending(false);
    if (err) setError(err);
    else setSent(true);
  };

  if (sent)
    return (
      <Modal title="Application sent" icon={<SendIcon className="size-5" />} accent={SHOP_COLOR[shop]}>
        <p className="text-lg font-bold">Thanks, {form.name}!</p>
        <p className="mt-2 text-black/70">
          Your résumé is on the manager&apos;s desk at {S.name}. You&apos;ll hear back once they&apos;ve looked at it (check back here, or in your wallet). When you&apos;re hired, come in and clock in to start your first shift at {usd(JOB_LEVELS[0].wage)} an hour.
        </p>
        <button type="button" onClick={close} className="mt-5 w-full rounded-full bg-black py-3 font-heading font-extrabold tracking-wide text-white uppercase">
          Done
        </button>
      </Modal>
    );

  return (
    <Modal title={`Apply at ${S.name}`} icon={<BriefcaseIcon className="size-5" />} accent={SHOP_COLOR[shop]}>
      <div className="mb-4 rounded-2xl bg-[#fff7e0] p-3 text-sm">
        <p className="font-bold">“Hiring now! Starting pay {usd(JOB_LEVELS[0].wage)}/hr, with raises as you&apos;re promoted.”</p>
        <p className="mt-1 text-black/60">The manager hands you a résumé form. Fill it in and they&apos;ll get back to you.</p>
      </div>
      {!profile.signedIn && <p className="mb-4 rounded-xl bg-[#ffd21f]/50 px-3 py-2 text-sm font-semibold">You need to sign in to the store to apply (so the manager knows who you are).</p>}
      <form onSubmit={submit} className="grid gap-3 text-sm">
        <Field label="Full name (as on your city ID)">
          <input required maxLength={60} value={form.name} onChange={set("name")} className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Position">
            <select value={form.position} onChange={set("position")} className="input">
              {["Crew Member", "Cashier", shop === "flowers" ? "Florist" : shop === "coffee" ? "Barista" : "Cook", "Any"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="When can you work?">
            <select value={form.availability} onChange={set("availability")} className="input">
              {["Weekends", "After school", "Weekday evenings", "Any time"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={`Why do you want to work at ${S.name}?`}>
          <textarea required minLength={10} maxLength={400} rows={3} value={form.why} onChange={set("why")} className="input" placeholder="A sentence or two…" />
        </Field>
        <Field label="Experience (jobs, volunteering, school clubs…)">
          <textarea maxLength={400} rows={2} value={form.experience} onChange={set("experience")} className="input" />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-xs font-bold text-black/60 uppercase">Skills</legend>
          <div className="flex flex-wrap gap-1.5">
            {SKILLS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={skills.includes(s)}
                onClick={() => setSkills(skills.includes(s) ? skills.filter((x) => x !== s) : [...skills, s])}
                className={cn("rounded-full border-2 px-3 py-1 font-semibold transition-colors", skills.includes(s) ? "border-black bg-black text-white" : "border-black/15 hover:border-black/40")}
              >
                {s}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Reference (a teacher, a coach… optional)">
          <input maxLength={80} value={form.reference} onChange={set("reference")} className="input" />
        </Field>
        {error && <p className="rounded-xl bg-red-100 px-3 py-2 font-semibold text-red-800">{error}</p>}
        <button disabled={sending || !profile.signedIn} className="mt-1 flex items-center justify-center gap-2 rounded-full bg-black py-3 font-heading text-lg font-extrabold tracking-wide text-white uppercase disabled:opacity-40">
          <SendIcon className="size-4" /> {sending ? "Sending…" : "Hand in my résumé"}
        </button>
      </form>
      <style>{`.input{width:100%;border-radius:.75rem;border:2px solid rgb(0 0 0/.15);padding:.55rem .75rem;background:#fff}.input:focus{outline:none;border-color:#000}`}</style>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-bold text-black/60 uppercase">{label}</span>
      {children}
    </label>
  );
}

function YourJob({ shop }: { shop: ShopKey }) {
  const S = SHOPS[shop];
  const status = jobStatus(shop);
  const p = progressAt(shop);
  const lvl = levelAt(shop);
  const next = PROMOTE_AT[lvl + 1];
  const [sure, setSure] = useState(false);
  return (
    <Modal title={S.name} icon={<BriefcaseIcon className="size-5" />} accent={SHOP_COLOR[shop]}>
      {status === "pending" ? (
        <>
          <p className="text-lg font-bold">Your application is with the manager.</p>
          <p className="mt-2 text-black/70">They haven&apos;t decided yet. Check back soon: once you&apos;re hired, you can clock in here.</p>
        </>
      ) : (
        <>
          <p className="text-xs font-bold text-black/50 uppercase">Your job</p>
          <p className="font-heading text-3xl font-extrabold">{JOB_LEVELS[lvl].title}</p>
          <p className="mt-1 text-lg font-bold text-[#2f8f3a]">{usd(wageAt(shop))} an hour</p>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ["Served", String(p.orders)],
              ["Hours", p.hours.toFixed(1)],
              ["Earned", usd(Math.round(p.earned))],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-black/5 p-2">
                <dt className="text-xs font-bold text-black/50 uppercase">{k}</dt>
                <dd className="font-heading text-xl font-extrabold">{v}</dd>
              </div>
            ))}
          </dl>
          {next ? (
            <div className="mt-4">
              <p className="text-sm font-semibold">
                Next promotion: <b>{JOB_LEVELS[lvl + 1].title}</b> ({usd(JOB_LEVELS[lvl + 1].wage)}/hr) after {next} happy customers.
              </p>
              <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-black/10">
                <div className="h-full rounded-full bg-[#2f8f3a]" style={{ width: `${Math.min(100, (p.orders / next) * 100)}%` }} />
              </div>
            </div>
          ) : (
            <p className="mt-4 font-semibold">You run the place. Top of the ladder!</p>
          )}
          <p className="mt-4 text-sm text-black/60">
            A shift: customers order at the kiosk, you take the order on the screen, make it in the kitchen and hand it over. An hour of shift time is {GAME_HOUR} seconds; your pay goes into the bank when you clock out. {STRIKES} walkouts in one shift and you&apos;re fired.
          </p>
          {sure ? (
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => void quitJob(shop)} className="flex-1 rounded-full bg-red-600 py-2.5 font-bold text-white">
                Yes, quit
              </button>
              <button type="button" onClick={() => setSure(false)} className="flex-1 rounded-full bg-black/10 py-2.5 font-bold">
                Keep my job
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setSure(true)} className="mt-4 text-sm font-semibold text-red-700 underline">
              Quit this job
            </button>
          )}
        </>
      )}
    </Modal>
  );
}

// ---- Taking orders ----------------------------------------------------------------------------

function Patience({ arrived, patience, now }: { arrived: number; patience: number; now: number }) {
  const left = Math.max(0, 1 - (now - arrived) / patience);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
      <div className="h-full rounded-full transition-[width]" style={{ width: `${left * 100}%`, background: left > 0.5 ? "#2f8f3a" : left > 0.25 ? "#f2b01e" : "#e5402b" }} />
    </div>
  );
}

/** Re-draw a few times a second (timers). */
function useTicker(ms = 250) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function Orders({ shop }: { shop: ShopKey }) {
  useTicker();
  const list = untaken(shop);
  const customers = jobs.shops[shop].customers;
  return (
    <Modal title="Order screen" icon={<ReceiptTextIcon className="size-5" />} accent={SHOP_COLOR[shop]}>
      {list.length === 0 ? (
        <p className="py-6 text-center text-black/60">No new orders. Customers order at the kiosk by the door.</p>
      ) : (
        <ul className="grid gap-3">
          {list.map((c) => (
            <li key={c.id} className="rounded-2xl border-2 border-black/10 p-3">
              <div className="flex items-center gap-2">
                <p className="flex-1 font-heading text-lg font-extrabold">{c.name}</p>
                <p className="font-bold tabular-nums">{usd(c.price)}</p>
              </div>
              <ul className="mt-1 text-sm">
                {describe(shop, c.order).map((l) => (
                  <li key={l.label}>
                    <span className="text-black/50">{l.label}:</span> <b>{l.text}</b>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center gap-3">
                <Patience arrived={c.arrived} patience={c.patience} now={jobs.now} />
                <button type="button" onClick={() => takeOrder(shop, c.id)} className="shrink-0 rounded-full bg-black px-4 py-2 text-sm font-bold text-white">
                  Take order
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {jobs.shift && jobs.shift.tickets.length > 0 && (
        <p className="mt-4 text-sm text-black/60">
          To make: {jobs.shift.tickets.map((t) => t.name).join(", ")}. Head to the prep table behind you.
        </p>
      )}
      <p className="mt-2 text-xs text-black/40">{customers.length} customers in the shop.</p>
    </Modal>
  );
}

// ---- The kitchen --------------------------------------------------------------------------------

type Stage = { kind: "step"; step: Step } | { kind: "skill" };

function Kitchen({ shop, first }: { shop: ShopKey; first: number }) {
  useTicker(500);
  const s = jobs.shift;
  const m = MENUS[shop];
  const tickets = s?.tickets ?? [];
  const [ticketId, setTicketId] = useState(first);
  const ticket = tickets.find((t) => t.customer === ticketId) ?? tickets[0];
  const [build, setBuild] = useState<Build>(() => emptyBuild(shop));
  const [stage, setStage] = useState(0);
  /** Pizza toppings placed by hand: where each piece is (0…1 across the pizza). */
  const [pieces, setPieces] = useState<{ id: string; x: number; y: number; r: number }[]>([]);
  const stages: Stage[] = useMemo(() => [...m.steps.map((step): Stage => ({ kind: "step", step })), { kind: "skill" }], [m]);
  const cur = stages[stage];

  if (!s) return null;
  if (!ticket)
    return (
      <Modal title="Kitchen" icon={<ChefHatIcon className="size-5" />} accent={SHOP_COLOR[shop]}>
        <p className="py-6 text-center text-black/60">No orders to make. Take orders at the screen on the counter first.</p>
      </Modal>
    );

  const customer = jobs.shops[shop].customers.find((c) => c.id === ticket.customer);
  const restart = (id: number) => {
    setTicketId(id);
    setBuild(emptyBuild(shop));
    setPieces([]);
    setStage(0);
  };
  // Pizza toppings count once there are three or more pieces of them on the pizza.
  const placed = (id: string) => pieces.filter((p) => p.id === id).length;
  const finalBuild = (): Build => (shop === "pizza" ? { ...build, toppings: [...new Set<string>(pieces.map((p) => p.id))].filter((id) => placed(id) >= 3) } : build);

  return (
    <Modal title={`Kitchen · ${SHOPS[shop].name}`} icon={<ChefHatIcon className="size-5" />} accent={SHOP_COLOR[shop]} wide>
      {/* The tickets */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {tickets.map((t) => {
          const c = jobs.shops[shop].customers.find((x) => x.id === t.customer);
          return (
            <button
              key={t.customer}
              type="button"
              onClick={() => restart(t.customer)}
              className={cn("min-w-36 rounded-2xl border-2 px-3 py-2 text-left", t === ticket ? "border-black bg-[#fff7e0]" : "border-black/10")}
            >
              <p className="font-heading font-extrabold">{t.name}</p>
              <p className="truncate text-xs text-black/60">{shortName(shop, t.order)}</p>
              {c && <Patience arrived={c.arrived} patience={c.patience} now={jobs.now} />}
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 md:grid-cols-[15rem_1fr_17rem]">
        {/* The ticket */}
        <div className="rounded-2xl bg-[#fffdf3] p-4 shadow-inner ring-1 ring-black/10" style={{ backgroundImage: "repeating-linear-gradient(#fffdf3 0 23px, #e8e2cf 23px 24px)" }}>
          <p className="font-mono text-xs font-bold text-black/50 uppercase">Order for</p>
          <p className="font-heading text-2xl font-extrabold">{ticket.name}</p>
          <ul className="mt-2 grid gap-1 font-mono text-sm">
            {describe(shop, ticket.order).map((l) => (
              <li key={l.label}>
                <span className="text-black/50">{l.label}:</span> <b>{l.text}</b>
              </li>
            ))}
          </ul>
          {customer && (
            <div className="mt-3">
              <p className="mb-1 flex items-center gap-1 text-xs font-bold text-black/50 uppercase">
                <ClockIcon className="size-3" /> Patience
              </p>
              <Patience arrived={customer.arrived} patience={customer.patience} now={jobs.now} />
            </div>
          )}
        </div>

        {/* What you're making */}
        <div className="flex flex-col items-center">
          <ol className="mb-3 flex flex-wrap justify-center gap-1">
            {stages.map((st, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setStage(i)}
                  className={cn("rounded-full px-3 py-1 text-xs font-bold", i === stage ? "bg-black text-white" : i < stage ? "bg-black/15" : "bg-black/5 text-black/50")}
                >
                  {st.kind === "step" ? st.step.label.replace(/ \(.*\)/, "") : m.skill.label.split(" ")[0] === "Baked" ? "Bake" : skillName(shop)}
                </button>
              </li>
            ))}
          </ol>
          <Product
            shop={shop}
            build={finalBuild()}
            pieces={pieces}
            brush={cur.kind === "step" && cur.step.id === "toppings" ? (build._brush as string) : undefined}
            onPlace={(x, y) => {
              const id = build._brush as string;
              if (!id || pieces.length > 90) return;
              setPieces([...pieces, { id, x, y, r: Math.random() * Math.PI * 2 }]);
            }}
            skill={cur.kind === "skill"}
          />
        </div>

        {/* The controls for this stage */}
        <div>
          {cur.kind === "step" ? (
            <StepControls
              shop={shop}
              step={cur.step}
              build={build}
              setBuild={setBuild}
              placed={placed}
              sprinkle={(id) => {
                const add = Array.from({ length: 6 }, () => {
                  const a = Math.random() * Math.PI * 2;
                  const d = Math.sqrt(Math.random()) * 0.33;
                  return { id, x: 0.5 + Math.cos(a) * d, y: 0.5 + Math.sin(a) * d, r: Math.random() * 6 };
                });
                setPieces([...pieces, ...add]);
              }}
              clear={(id) => setPieces(pieces.filter((p) => p.id !== id))}
            />
          ) : (
            <Skill shop={shop} build={finalBuild()} onDone={(k) => finishMaking(ticket as Ticket, finalBuild(), k)} />
          )}
          {cur.kind === "step" && (
            <button type="button" onClick={() => setStage(stage + 1)} className="mt-4 w-full rounded-full bg-black py-3 font-heading font-extrabold tracking-wide text-white uppercase">
              Next: {stages[stage + 1].kind === "step" ? (stages[stage + 1] as { step: Step }).step.label.replace(/ \(.*\)/, "") : skillName(shop)}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

const skillName = (shop: ShopKey) => ({ pizza: "Bake it", icecream: "Scoop it", coffee: "Pull the shot", burger: "Grill it", flowers: "Trim & wrap" })[shop];

function StepControls({
  shop,
  step,
  build,
  setBuild,
  placed,
  sprinkle,
  clear,
}: {
  shop: ShopKey;
  step: Step;
  build: Build;
  setBuild: (b: Build) => void;
  placed: (id: string) => number;
  sprinkle: (id: string) => void;
  clear: (id: string) => void;
}) {
  const v = build[step.id];
  const swatch = (c: string) => <span className="size-5 shrink-0 rounded-full ring-1 ring-black/20" style={{ background: c }} />;
  if (step.kind === "one")
    return (
      <div>
        <p className="mb-2 font-heading text-lg font-extrabold">{step.label}</p>
        <div className="grid gap-1.5">
          {step.options.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={v === o.id}
              onClick={() => setBuild({ ...build, [step.id]: o.id })}
              className={cn("flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-left text-sm font-semibold", v === o.id ? "border-black bg-black/5" : "border-black/10 hover:border-black/30")}
            >
              {swatch(o.color)} {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  if (step.kind === "many" && shop === "pizza")
    return (
      <div>
        <p className="mb-1 font-heading text-lg font-extrabold">Toppings</p>
        <p className="mb-2 text-xs text-black/60">Pick a topping, then tap the pizza to put pieces on (three or more each).</p>
        <div className="grid gap-1.5">
          {step.options.map((o) => (
            <div key={o.id} className={cn("flex items-center gap-2 rounded-xl border-2 px-2 py-1.5 text-sm font-semibold", build._brush === o.id ? "border-black bg-black/5" : "border-black/10")}>
              <button type="button" onClick={() => setBuild({ ...build, _brush: o.id })} className="flex flex-1 items-center gap-2 text-left">
                {swatch(o.color)} {o.label}
                {placed(o.id) > 0 && <span className="rounded-full bg-black px-1.5 text-xs text-white">{placed(o.id)}</span>}
              </button>
              <button type="button" onClick={() => sprinkle(o.id)} className="rounded-lg bg-black/5 px-2 py-0.5 text-xs" title="Scatter a handful">
                +6
              </button>
              {placed(o.id) > 0 && (
                <button type="button" onClick={() => clear(o.id)} aria-label={`Take off the ${o.label}`} className="rounded-lg bg-black/5 p-0.5">
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  if (step.kind === "many") {
    const list = (Array.isArray(v) ? v : []) as string[];
    return (
      <div>
        <p className="mb-2 font-heading text-lg font-extrabold">{step.label}</p>
        <div className="grid gap-1.5">
          {step.options.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={list.includes(o.id)}
              onClick={() => setBuild({ ...build, [step.id]: list.includes(o.id) ? list.filter((x) => x !== o.id) : [...list, o.id].slice(0, step.max) })}
              className={cn("flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-left text-sm font-semibold", list.includes(o.id) ? "border-black bg-black/5" : "border-black/10 hover:border-black/30")}
            >
              {swatch(o.color)} {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (step.kind === "list") {
    const list = (Array.isArray(v) ? v : []) as string[];
    return (
      <div>
        <p className="mb-2 font-heading text-lg font-extrabold">{step.label}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {step.options.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={list.length >= step.max}
              onClick={() => setBuild({ ...build, [step.id]: [...list, o.id] })}
              className="flex items-center gap-2 rounded-xl border-2 border-black/10 px-2 py-2 text-left text-xs font-semibold hover:border-black/30 disabled:opacity-40"
            >
              {swatch(o.color)} {o.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="flex-1 text-black/60">
            {list.length}/{step.max} {list.length ? `· ${list.map((id) => step.options.find((x) => x.id === id)?.label).join(" → ")}` : ""}
          </span>
          {list.length > 0 && (
            <button type="button" onClick={() => setBuild({ ...build, [step.id]: list.slice(0, -1) })} className="flex items-center gap-1 rounded-lg bg-black/5 px-2 py-1 text-xs font-bold">
              <Undo2Icon className="size-3.5" /> Undo
            </button>
          )}
        </div>
      </div>
    );
  }
  const counts = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, number>;
  const types = Object.values(counts).filter((n) => n > 0).length;
  const setCount = (id: string, n: number) => setBuild({ ...build, [step.id]: { ...counts, [id]: Math.max(0, Math.min(step.maxEach, n)) } });
  return (
    <div>
      <p className="mb-2 font-heading text-lg font-extrabold">{step.label}</p>
      <div className="grid gap-1.5">
        {step.options.map((o) => {
          const n = counts[o.id] ?? 0;
          const blocked = !n && types >= step.maxTypes;
          return (
            <div key={o.id} className={cn("flex items-center gap-2 rounded-xl border-2 px-2 py-1.5 text-sm font-semibold", n ? "border-black" : "border-black/10", blocked && "opacity-40")}>
              {swatch(o.color)} <span className="flex-1">{o.label}</span>
              <button type="button" aria-label={`One less ${o.label}`} onClick={() => setCount(o.id, n - 1)} className="grid size-7 place-items-center rounded-full bg-black/5">
                <MinusIcon className="size-3.5" />
              </button>
              <span className="w-5 text-center tabular-nums">{n}</span>
              <button type="button" disabled={blocked} aria-label={`One more ${o.label}`} onClick={() => setCount(o.id, n + 1)} className="grid size-7 place-items-center rounded-full bg-black/5">
                <PlusIcon className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- The hands-on part ----------------------------------------------------------------------

/** 1 inside the sweet spot [a, b], falling off outside it. */
const zone = (v: number, a: number, b: number) => (v >= a && v <= b ? 1 : Math.max(0, 1 - (v < a ? a - v : v - b) / 0.35));

function Meter({ value, a, b, colors = ["#7fc4ff", "#2f8f3a", "#e5402b"] }: { value: number; a: number; b: number; colors?: string[] }) {
  return (
    <div className="relative h-6 w-full overflow-hidden rounded-full bg-black/10">
      <div className="absolute inset-y-0 rounded-full opacity-30" style={{ left: `${(a / 1.3) * 100}%`, width: `${((b - a) / 1.3) * 100}%`, background: colors[1] }} />
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (value / 1.3) * 100)}%`, background: value < a ? colors[0] : value <= b ? colors[1] : colors[2] }} />
      <div className="absolute inset-y-0 border-x-2 border-black/40" style={{ left: `${(a / 1.3) * 100}%`, width: `${((b - a) / 1.3) * 100}%` }} />
    </div>
  );
}

/** Something that cooks while you watch (rate: how much a second). */
function useCooking(running: boolean, rate: number) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setV((x) => Math.min(1.3, x + rate * 0.05)), 50);
    return () => clearInterval(t);
  }, [running, rate]);
  return [v, setV] as const;
}

function Skill({ shop, build, onDone }: { shop: ShopKey; build: Build; onDone: (skill: number) => void }) {
  if (shop === "pizza") return <Bake onDone={onDone} />;
  if (shop === "burger") return <Grill count={Math.max(1, ((build.patties as string[]) ?? []).length)} onDone={onDone} />;
  if (shop === "coffee") return <Hold label="Pull the espresso shot" verb="Hold to pull" sweet={[0.7, 0.9]} rate={0.42} times={1} onDone={onDone} />;
  if (shop === "icecream") return <Hold label="Scoop each scoop" verb="Hold to scoop" sweet={[0.62, 0.88]} rate={0.55} times={Math.max(1, ((build.scoops as string[]) ?? []).length)} onDone={onDone} />;
  return <Snip onDone={onDone} />;
}

function Bake({ onDone }: { onDone: (k: number) => void }) {
  const [inOven, setInOven] = useState(false);
  const [v] = useCooking(inOven, 0.11);
  const word = v < 0.5 ? "Raw" : v < 0.78 ? "Nearly…" : v <= 0.98 ? "Perfect! Take it out!" : v < 1.15 ? "Getting dark…" : "Burnt!";
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 font-heading text-lg font-extrabold">
        <FlameIcon className="size-5 text-orange-600" /> The oven
      </p>
      <p className="mb-3 text-sm text-black/60">Slide it in, watch the crust, and take it out when it&apos;s golden (the green part).</p>
      <div className="mb-2 rounded-2xl bg-gradient-to-b from-[#3a2a22] to-[#1d1410] p-3">
        <div className="h-14 rounded-xl bg-gradient-to-t from-[#ff7a1a] via-[#ffb347]/70 to-transparent" style={{ opacity: inOven ? 1 : 0.3 }} />
      </div>
      <Meter value={v} a={0.78} b={0.98} colors={["#f3d9a4", "#c98a2e", "#2b1a10"]} />
      <p className="mt-1 text-center text-sm font-bold">{inOven ? word : "Ready for the oven"}</p>
      {!inOven ? (
        <button type="button" onClick={() => setInOven(true)} className="mt-3 w-full rounded-full bg-orange-600 py-3 font-heading font-extrabold tracking-wide text-white uppercase">
          Into the oven
        </button>
      ) : (
        <button type="button" onClick={() => onDone(zone(v, 0.78, 0.98))} className="mt-3 w-full rounded-full bg-black py-3 font-heading font-extrabold tracking-wide text-white uppercase">
          Take it out &amp; box it
        </button>
      )}
    </div>
  );
}

function Grill({ count, onDone }: { count: number; onDone: (k: number) => void }) {
  const [started, setStarted] = useState(false);
  const [side, setSide] = useState<number[]>(() => Array(count).fill(0));
  const [a, setA] = useState<number[]>(() => Array(count).fill(0));
  const [b, setB] = useState<number[]>(() => Array(count).fill(0));
  const [done, setDone] = useState<boolean[]>(() => Array(count).fill(false));
  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => {
      setA((x) => x.map((v, i) => (side[i] === 0 && !done[i] ? Math.min(1.3, v + 0.012) : v)));
      setB((x) => x.map((v, i) => (side[i] === 1 && !done[i] ? Math.min(1.3, v + 0.012) : v)));
    }, 50);
    return () => clearInterval(t);
  }, [started, side, done]);
  const all = done.every(Boolean);
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 font-heading text-lg font-extrabold">
        <FlameIcon className="size-5 text-orange-600" /> The grill
      </p>
      <p className="mb-3 text-sm text-black/60">Smash them on the grill, flip each one when the first side&apos;s browned, then take it off when the second side is too.</p>
      {!started ? (
        <button type="button" onClick={() => setStarted(true)} className="w-full rounded-full bg-orange-600 py-3 font-heading font-extrabold tracking-wide text-white uppercase">
          Smash {count > 1 ? `${count} patties` : "the patty"} on the grill
        </button>
      ) : (
        <div className="grid gap-3">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="rounded-xl bg-black/5 p-2">
              <p className="mb-1 text-xs font-bold">
                Patty {i + 1} · side {side[i] + 1}
                {done[i] ? " · done" : ""}
              </p>
              <Meter value={side[i] === 0 ? a[i] : b[i]} a={0.75} b={1} colors={["#e98b8b", "#7a4a2e", "#1d1410"]} />
              {!done[i] && (
                <button
                  type="button"
                  onClick={() => (side[i] === 0 ? setSide(side.map((s, j) => (j === i ? 1 : s))) : setDone(done.map((d, j) => (j === i ? true : d))))}
                  className="mt-1.5 w-full rounded-full bg-black py-1.5 text-sm font-bold text-white"
                >
                  {side[i] === 0 ? "Flip" : "Take it off"}
                </button>
              )}
            </div>
          ))}
          {all && (
            <button
              type="button"
              onClick={() => onDone(a.reduce((s, v, i) => s + (zone(v, 0.75, 1) + zone(b[i], 0.75, 1)) / 2, 0) / count)}
              className="w-full rounded-full bg-black py-3 font-heading font-extrabold tracking-wide text-white uppercase"
            >
              Stack it &amp; wrap it
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Hold a button down to fill a meter; let go in the sweet spot. `times` goes (each scoop…). */
function Hold({ label, verb, sweet, rate, times, onDone }: { label: string; verb: string; sweet: [number, number]; rate: number; times: number; onDone: (k: number) => void }) {
  const [holding, setHolding] = useState(false);
  const [v, setV] = useCooking(holding, rate);
  const [scores, setScores] = useState<number[]>([]);
  const release = () => {
    if (!holding) return;
    setHolding(false);
    setScores((s) => [...s, zone(v, sweet[0], sweet[1])]);
    setV(0);
  };
  const finished = scores.length >= times;
  return (
    <div>
      <p className="mb-1 font-heading text-lg font-extrabold">{label}</p>
      <p className="mb-3 text-sm text-black/60">Hold the button down and let go in the green part.</p>
      <Meter value={v} a={sweet[0]} b={sweet[1]} />
      <p className="mt-1 text-center text-sm font-bold">
        {Math.min(scores.length + 1, times)} of {times}
        {scores.length ? ` · last: ${scores[scores.length - 1] > 0.95 ? "perfect!" : scores[scores.length - 1] > 0.6 ? "good" : "off"}` : ""}
      </p>
      {!finished ? (
        <button
          type="button"
          onPointerDown={() => setHolding(true)}
          onPointerUp={release}
          onPointerLeave={release}
          onKeyDown={(e) => e.code === "Space" && !e.repeat && setHolding(true)}
          onKeyUp={(e) => e.code === "Space" && release()}
          className={cn("mt-3 w-full touch-none rounded-full py-4 font-heading font-extrabold tracking-wide text-white uppercase select-none", holding ? "bg-[#2f8f3a]" : "bg-black")}
        >
          {holding ? "…let go!" : verb}
        </button>
      ) : (
        <button type="button" onClick={() => onDone(scores.reduce((a, b) => a + b, 0) / scores.length)} className="mt-3 w-full rounded-full bg-black py-3 font-heading font-extrabold tracking-wide text-white uppercase">
          Done, it&apos;s ready
        </button>
      )}
    </div>
  );
}

/** Snip the stems as the marker passes the line. */
function Snip({ onDone }: { onDone: (k: number) => void }) {
  const [t, setT] = useState(0);
  const [snips, setSnips] = useState<number[]>([]);
  useEffect(() => {
    const i = setInterval(() => setT((x) => x + 0.05), 50);
    return () => clearInterval(i);
  }, []);
  const pos = (Math.sin(t * 2.2) + 1) / 2; // 0…1
  const finished = snips.length >= 3;
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 font-heading text-lg font-extrabold">
        <ScissorsIcon className="size-5" /> Trim the stems
      </p>
      <p className="mb-3 text-sm text-black/60">Snip when the scissors are over the dotted line (three bunches), then wrap it up.</p>
      <div className="relative h-10 rounded-xl bg-[#e8f5e9]">
        <div className="absolute inset-y-1 left-1/2 w-0 border-l-2 border-dashed border-black/50" />
        <ScissorsIcon className="absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pos * 100}%` }} />
      </div>
      <p className="mt-1 text-center text-sm font-bold">{snips.length} of 3 snipped</p>
      {!finished ? (
        <button type="button" onClick={() => setSnips([...snips, Math.max(0, 1 - Math.abs(pos - 0.5) / 0.25)])} className="mt-3 w-full rounded-full bg-black py-3 font-heading font-extrabold tracking-wide text-white uppercase">
          Snip!
        </button>
      ) : (
        <button type="button" onClick={() => onDone(snips.reduce((a, b) => a + b, 0) / 3)} className="mt-3 w-full rounded-full bg-black py-3 font-heading font-extrabold tracking-wide text-white uppercase">
          Wrap it up
        </button>
      )}
    </div>
  );
}

// ---- Drawing what you're making -------------------------------------------------------------------

const colorOf = (shop: ShopKey, step: string, id: string) => MENUS[shop].steps.find((s) => s.id === step)?.options.find((o) => o.id === id)?.color ?? "#ccc";

function Product({ shop, build, pieces, brush, onPlace, skill }: { shop: ShopKey; build: Build; pieces: { id: string; x: number; y: number; r: number }[]; brush?: string; onPlace: (x: number, y: number) => void; skill: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const one = (id: string) => (typeof build[id] === "string" ? (build[id] as string) : "");
  const list = (id: string) => (Array.isArray(build[id]) ? (build[id] as string[]) : []);
  let body: ReactNode = null;

  if (shop === "pizza") {
    const R = { s: 92, m: 112, l: 132 }[one("size")] ?? 112;
    body = (
      <g>
        <circle cx={160} cy={160} r={R} fill="#e8b866" />
        <circle cx={160} cy={160} r={R - 4} fill="#f3d9a4" />
        {one("sauce") && <circle cx={160} cy={160} r={R - 12} fill={colorOf("pizza", "sauce", one("sauce"))} className="transition-all duration-500" />}
        {one("cheese") &&
          Array.from({ length: one("cheese") === "extra" ? 40 : 24 }, (_, i) => {
            const a = i * 2.4;
            const d = Math.sqrt(((i * 37) % 100) / 100) * (R - 22);
            return <ellipse key={i} cx={160 + Math.cos(a) * d} cy={160 + Math.sin(a) * d} rx={16} ry={11} fill={colorOf("pizza", "cheese", one("cheese"))} opacity={0.85} transform={`rotate(${i * 40} ${160 + Math.cos(a) * d} ${160 + Math.sin(a) * d})`} />;
          })}
        {pieces.map((p, i) => (
          <Topping key={i} id={p.id} x={160 + (p.x - 0.5) * 2 * (R - 14)} y={160 + (p.y - 0.5) * 2 * (R - 14)} r={p.r} />
        ))}
      </g>
    );
  } else if (shop === "icecream") {
    const holder = one("holder");
    const scoops = list("scoops");
    const extras = list("extras");
    const top = 220 - scoops.length * 46;
    body = (
      <g>
        {holder === "cup" ? (
          <path d="M100 200 L220 200 L205 290 L115 290 Z" fill="#ff8fb1" stroke="#d65f86" strokeWidth={4} />
        ) : (
          <g>
            <path d="M110 205 L210 205 L160 305 Z" fill={holder === "waffle" ? "#c4823c" : "#d9a25b"} />
            {Array.from({ length: 6 }, (_, i) => (
              <path key={i} d={`M${112 + i * 18} 205 L${150 + i * 8} 290`} stroke="#9b6428" strokeWidth={2} opacity={0.6} />
            ))}
          </g>
        )}
        {scoops.map((id, i) => (
          <circle key={i} cx={160} cy={190 - i * 46} r={50} fill={colorOf("icecream", "scoops", id)} stroke="rgb(0 0 0/.12)" strokeWidth={3} />
        ))}
        {scoops.length > 0 && extras.includes("fudge") && <path d={`M115 ${top + 10} Q140 ${top + 40} 160 ${top + 6} Q185 ${top + 42} 205 ${top + 12}`} stroke="#3b1f12" strokeWidth={12} fill="none" strokeLinecap="round" />}
        {scoops.length > 0 && extras.includes("whip") && <path d={`M120 ${top - 22} Q160 ${top - 70} 200 ${top - 22} Z`} fill="#fff" stroke="#ddd" strokeWidth={3} />}
        {scoops.length > 0 &&
          extras.includes("sprinkles") &&
          Array.from({ length: 24 }, (_, i) => <rect key={i} x={120 + ((i * 29) % 80)} y={top - 20 + ((i * 17) % 50)} width={9} height={3} rx={1.5} fill={["#ff5fa2", "#ffd447", "#6aa8ff", "#7ee0a0"][i % 4]} transform={`rotate(${i * 47} ${125 + ((i * 29) % 80)} ${top - 18 + ((i * 17) % 50)})`} />)}
        {scoops.length > 0 && extras.includes("nuts") && Array.from({ length: 14 }, (_, i) => <circle key={i} cx={122 + ((i * 31) % 76)} cy={top - 10 + ((i * 13) % 40)} r={4} fill="#b98a52" />)}
        {scoops.length > 0 && extras.includes("cherry") && <circle cx={160} cy={top - (extras.includes("whip") ? 72 : 46)} r={14} fill="#d1102b" />}
      </g>
    );
  } else if (shop === "coffee") {
    const size = { s: 0.8, m: 0.92, l: 1.05 }[one("size")] ?? 0.92;
    const drink = colorOf("coffee", "drink", one("drink") || "latte");
    const milk = one("milk") && one("milk") !== "none";
    body = (
      <g transform={`translate(160 300) scale(${size}) translate(-160 -300)`}>
        <path d="M95 120 L225 120 L210 295 L110 295 Z" fill="#fff" stroke="#cfc7bd" strokeWidth={4} />
        <path d="M100 160 L220 160 L208 290 L112 290 Z" fill={one("drink") ? drink : "#e9e4da"} />
        {milk && <path d="M100 160 L220 160 L217 190 L103 190 Z" fill="#fffdf5" opacity={0.85} />}
        {one("syrup") && one("syrup") !== "none" && <path d="M120 170 Q160 210 200 170" stroke={colorOf("coffee", "syrup", one("syrup"))} strokeWidth={6} fill="none" />}
        {one("top") === "whip" && <path d="M105 160 Q160 70 215 160 Z" fill="#fff" stroke="#e3ded6" strokeWidth={3} />}
        {(one("top") === "cinnamon" || one("top") === "cocoa") && Array.from({ length: 30 }, (_, i) => <circle key={i} cx={110 + ((i * 37) % 100)} cy={165 + ((i * 11) % 20)} r={2} fill={colorOf("coffee", "top", one("top"))} />)}
        <path d="M95 112 L225 112 L222 128 L98 128 Z" fill="#2b2f36" />
        <rect x={108} y={210} width={104} height={40} rx={8} fill="#6b4329" opacity={0.9} />
        <text x={160} y={237} textAnchor="middle" fontSize={16} fontWeight={800} fill="#fff">
          BEAN THERE
        </text>
      </g>
    );
  } else if (shop === "burger") {
    const layers: { color: string; h: number; kind?: string }[] = [];
    const bun = one("bun") || "sesame";
    layers.push({ color: colorOf("burger", "bun", bun), h: 26, kind: "bottom" });
    for (const p of list("patties")) layers.push({ color: colorOf("burger", "patties", p), h: 24, kind: "patty" });
    for (const t of list("stack")) layers.push({ color: colorOf("burger", "stack", t), h: t === "cheese" ? 8 : t === "lettuce" ? 12 : 9, kind: t });
    if (one("sauce") && one("sauce") !== "none") layers.push({ color: colorOf("burger", "sauce", one("sauce")), h: 6, kind: "sauce" });
    let y = 290;
    body = (
      <g>
        {layers.map((l, i) => {
          y -= l.h;
          const w = l.kind === "lettuce" ? 230 : l.kind === "cheese" ? 210 : l.kind === "patty" ? 204 : 196;
          return l.kind === "lettuce" ? (
            <path key={i} d={`M${160 - w / 2} ${y + 8} q12 -12 24 0 q12 -12 24 0 q12 -12 24 0 q12 -12 24 0 q12 -12 24 0 q12 -12 24 0 q12 -12 24 0 q12 -12 24 0 q12 -12 24 0 L${160 + w / 2} ${y + l.h} L${160 - w / 2} ${y + l.h} Z`} fill={l.color} />
          ) : l.kind === "cheese" ? (
            <path key={i} d={`M${160 - w / 2} ${y} L${160 + w / 2} ${y} L${160 + w / 2 - 10} ${y + l.h + 12} L${160 + 40} ${y + l.h} L${160 - 60} ${y + l.h + 10} L${160 - w / 2} ${y + l.h} Z`} fill={l.color} />
          ) : (
            <rect key={i} x={160 - w / 2} y={y} width={w} height={l.h} rx={l.kind === "bottom" ? 10 : l.h / 2} fill={l.color} />
          );
        })}
        {bun !== "lettuce" || layers.length ? <path d={`M62 ${y} Q160 ${y - 110} 258 ${y} Z`} fill={colorOf("burger", "bun", bun)} /> : null}
        {bun === "sesame" && Array.from({ length: 12 }, (_, i) => <ellipse key={i} cx={95 + ((i * 47) % 130)} cy={y - 18 - ((i * 23) % 40)} rx={5} ry={2.5} fill="#fbf1d0" />)}
      </g>
    );
  } else {
    const counts = (build.flowers ?? {}) as Record<string, number>;
    const heads: { id: string; i: number }[] = [];
    for (const [id, n] of Object.entries(counts)) for (let i = 0; i < n; i++) heads.push({ id, i: heads.length });
    const wrap = one("wrap");
    body = (
      <g>
        {heads.map((h, k) => {
          const a = -0.9 + (k / Math.max(1, heads.length - 1)) * 1.8;
          const x = 160 + Math.sin(a) * 70;
          const y = 120 + Math.abs(a) * 30 - (k % 3) * 14;
          return (
            <g key={k}>
              <path d={`M160 260 L${x} ${y}`} stroke="#3f8f3a" strokeWidth={4} />
              <Flower id={h.id} x={x} y={y} />
            </g>
          );
        })}
        {wrap === "vase" ? (
          <path d="M120 200 Q105 300 160 305 Q215 300 200 200 Z" fill="#cfe9f5" opacity={0.75} stroke="#9cc7dc" strokeWidth={3} />
        ) : wrap === "basket" ? (
          <g>
            <path d="M95 215 L225 215 L205 300 L115 300 Z" fill="#a87a45" />
            <path d="M100 235 L220 235 M105 255 L215 255 M110 275 L210 275" stroke="#7d5a32" strokeWidth={4} />
          </g>
        ) : wrap ? (
          <path d="M80 170 L240 170 L175 305 L145 305 Z" fill={colorOf("flowers", "wrap", wrap)} />
        ) : null}
        {one("ribbon") && one("ribbon") !== "none" && <path d="M135 255 L185 255 L200 280 L170 262 L150 262 L120 280 Z" fill={colorOf("flowers", "ribbon", one("ribbon"))} />}
        {one("card") && one("card") !== "none" && (
          <g transform="rotate(-8 240 260)">
            <rect x={212} y={240} width={70} height={44} rx={4} fill={colorOf("flowers", "card", one("card"))} stroke="#0002" />
            <text x={247} y={266} textAnchor="middle" fontSize={9} fontWeight={800}>
              {MENUS.flowers.steps[3].options.find((o) => o.id === one("card"))?.label}
            </text>
          </g>
        )}
      </g>
    );
  }

  return (
    <div className="relative">
      <svg
        ref={svg}
        viewBox="0 0 320 320"
        className={cn("size-72 rounded-full bg-[radial-gradient(circle,#ffffff,#efe9de)] shadow-inner sm:size-80", brush && "cursor-crosshair")}
        onClick={(e) => {
          if (!brush || !svg.current) return;
          const r = svg.current.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width;
          const y = (e.clientY - r.top) / r.height;
          // Only on the pizza.
          if (Math.hypot(x - 0.5, y - 0.5) > 0.4) return;
          onPlace(0.5 + (x - 0.5) * 1.15, 0.5 + (y - 0.5) * 1.15);
        }}
        role={brush ? "button" : "img"}
        aria-label={brush ? "Tap to put toppings on the pizza" : "What you're making"}
      >
        {body}
      </svg>
      {skill && <p className="mt-1 text-center text-xs font-bold text-black/50">Almost done…</p>}
    </div>
  );
}

function Topping({ id, x, y, r }: { id: string; x: number; y: number; r: number }) {
  const c = colorOf("pizza", "toppings", id);
  const t = `rotate(${(r * 180) / Math.PI} ${x} ${y})`;
  switch (id) {
    case "pepperoni":
    case "sausage":
      return <circle cx={x} cy={y} r={id === "pepperoni" ? 11 : 7} fill={c} stroke="#0003" strokeWidth={2} />;
    case "olive":
      return <circle cx={x} cy={y} r={6} fill="none" stroke={c} strokeWidth={4} />;
    case "mushroom":
      return <path d={`M${x - 8} ${y} a8 7 0 0 1 16 0 Z M${x - 3} ${y} h6 v6 h-6 Z`} fill={c} transform={t} />;
    case "pepper":
    case "onion":
      return <path d={`M${x - 9} ${y} q9 -10 18 0`} stroke={c} strokeWidth={4} fill="none" strokeLinecap="round" transform={t} />;
    case "pineapple":
      return <rect x={x - 6} y={y - 5} width={12} height={10} rx={2} fill={c} transform={t} />;
    default:
      return <ellipse cx={x} cy={y} rx={8} ry={4} fill={c} transform={t} />;
  }
}

function Flower({ id, x, y }: { id: string; x: number; y: number }) {
  const c = colorOf("flowers", "flowers", id);
  if (id === "tulip") return <path d={`M${x - 10} ${y} q0 -20 10 -22 q10 2 10 22 q-10 8 -20 0`} fill={c} />;
  if (id === "lavender") return <path d={`M${x} ${y + 10} L${x} ${y - 24}`} stroke={c} strokeWidth={8} strokeLinecap="round" strokeDasharray="4 3" />;
  const petals = id === "sunflower" ? 14 : id === "daisy" ? 10 : id === "lily" ? 6 : 8;
  const R = id === "sunflower" ? 22 : id === "lily" ? 20 : 14;
  return (
    <g>
      {Array.from({ length: petals }, (_, i) => {
        const a = (i / petals) * Math.PI * 2;
        return <ellipse key={i} cx={x + Math.cos(a) * R * 0.55} cy={y + Math.sin(a) * R * 0.55} rx={R * 0.5} ry={R * 0.24} fill={c} stroke="#0001" transform={`rotate(${(a * 180) / Math.PI} ${x + Math.cos(a) * R * 0.55} ${y + Math.sin(a) * R * 0.55})`} />;
      })}
      <circle cx={x} cy={y} r={R * 0.3} fill={id === "sunflower" ? "#5a3a1a" : id.includes("rose") ? "#0002" : "#ffd447"} />
    </g>
  );
}

// ---- The shift card -----------------------------------------------------------------------------

/** While you're on shift: where, the clock, your pay so far, walkouts, and what to do next. */
export function ShiftCard() {
  useGameVersion();
  useTicker(500);
  const s = jobs.shift;
  if (!s) return null;
  const { wages } = shiftPay();
  const next = s.carrying
    ? s.carrying.customer < 0
      ? `They left. Throw away the ${s.carrying.label}.`
      : `Hand the ${s.carrying.label} to ${s.carrying.name} at the counter.`
    : s.tickets.length
      ? `Make ${s.tickets[0].name}'s order at the prep table.`
      : untaken(s.shop).length
        ? `New order! Take it at the screen on the counter.`
        : "Waiting for customers…";
  return (
    <div className="pointer-events-none absolute top-[11.5rem] left-3 w-60 rounded-2xl border-[3px] border-black bg-white/95 p-3 text-black shadow-[0_4px_0_#000] sm:top-36">
      <div className="flex items-center gap-2">
        <span className="size-3 rounded-full" style={{ background: SHOP_COLOR[s.shop] }} />
        <p className="flex-1 truncate font-heading font-extrabold tracking-wide uppercase">{SHOPS[s.shop].name}</p>
        <p className="font-mono text-sm font-bold">{shiftClock()}</p>
      </div>
      <p className="text-xs text-black/60">
        {JOB_LEVELS[levelAt(s.shop)].title} · {usd(wageAt(s.shop))}/hr
      </p>
      <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
        <div className="rounded-lg bg-black/5 py-1">
          <p className="font-bold text-black/50">Pay</p>
          <p className="font-bold tabular-nums">{usd(wages)}</p>
        </div>
        <div className="rounded-lg bg-black/5 py-1">
          <p className="font-bold text-black/50">Tips</p>
          <p className="font-bold tabular-nums">{usd(s.tips)}</p>
        </div>
        <div className={cn("rounded-lg py-1", s.walkouts ? "bg-red-100" : "bg-black/5")}>
          <p className="font-bold text-black/50">Walkouts</p>
          <p className="font-bold tabular-nums">
            {s.walkouts}/{STRIKES}
          </p>
        </div>
      </div>
      <p className="mt-2 text-sm leading-tight font-semibold">{next}</p>
    </div>
  );
}
