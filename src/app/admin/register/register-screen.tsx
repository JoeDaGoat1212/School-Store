"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloudOffIcon, CheckIcon, MaximizeIcon, ScanBarcodeIcon, SearchIcon, Undo2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatCents, formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { recordTally, saveBarcode } from "./actions";

export type RegisterProduct = {
  id: string;
  name: string;
  emoji: string | null;
  photo: string | null;
  price: number;
  stock: number;
  category: string;
  soldToday: number;
  popularity: number;
};

type Line = { productId: string; qty: number };
type Batch = { batchId: string; items: Line[] };
type FeedItem = { key: number; productId: string; how: "scan" | "tap"; undone?: boolean };

// Sales not sent yet live here, so nothing is lost if the Wi-Fi drops or the page reloads.
const QUEUE_KEY = "register-queue";
const INFLIGHT_KEY = "register-inflight";
const SEND_EVERY_MS = 2500;

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: the sale still goes up on the next send */
  }
}

export function RegisterScreen({
  products,
  barcodes: initialBarcodes,
  today,
}: {
  products: RegisterProduct[];
  barcodes: Record<string, string>;
  today: string;
}) {
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const [barcodes, setBarcodes] = useState(initialBarcodes);
  const [sold, setSold] = useState<Record<string, number>>(() => Object.fromEntries(products.map((p) => [p.id, p.soldToday])));
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [search, setSearch] = useState("");
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(0); // sales not saved yet
  const [offline, setOffline] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const feedKey = useRef(0);

  // ---- Sounds: a short high beep for a sale, a low one for "don't know that barcode" ----
  const audio = useRef<AudioContext | null>(null);
  const beep = useCallback((ok: boolean) => {
    try {
      audio.current ??= new AudioContext();
      const ctx = audio.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = ok ? 1250 : 330;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.09 : 0.3));
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (ok ? 0.1 : 0.32));
    } catch {
      /* no sound available */
    }
  }, []);

  // ---- Counting a sale (or taking one back) ----
  const add = useCallback(
    (productId: string, qty: number, how: FeedItem["how"]) => {
      const queue = load<Line[]>(QUEUE_KEY, []);
      queue.push({ productId, qty });
      save(QUEUE_KEY, queue);
      setWaiting((w) => w + 1);
      setSold((s) => ({ ...s, [productId]: (s[productId] ?? 0) + qty }));
      if (qty > 0) {
        setFeed((f) => [{ key: ++feedKey.current, productId, how }, ...f].slice(0, 12));
        setFlash(productId);
        setTimeout(() => setFlash((x) => (x === productId ? null : x)), 350);
      }
    },
    [],
  );

  const undoLast = useCallback(() => {
    const last = feed.find((f) => !f.undone);
    if (!last) return;
    add(last.productId, -1, last.how);
    setFeed((f) => f.map((x) => (x.key === last.key ? { ...x, undone: true } : x)));
  }, [feed, add]);

  // ---- Sending to the site in the background ----
  const sending = useRef(false);
  const send = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      // Finish a batch that was cut off first (same id, so it can't count twice).
      let batch = load<Batch | null>(INFLIGHT_KEY, null);
      if (!batch) {
        const queue = load<Line[]>(QUEUE_KEY, []);
        if (queue.length === 0) return;
        batch = { batchId: crypto.randomUUID(), items: queue.slice(0, 200) };
        save(INFLIGHT_KEY, batch);
        save(QUEUE_KEY, queue.slice(batch.items.length));
      }
      const res = await recordTally(batch);
      if ("error" in res && res.error) throw new Error(res.error);
      save(INFLIGHT_KEY, null);
      setOffline(false);
      setWaiting(load<Line[]>(QUEUE_KEY, []).length);
    } catch {
      setOffline(true);
    } finally {
      sending.current = false;
    }
  }, []);

  useEffect(() => {
    setWaiting(load<Line[]>(QUEUE_KEY, []).length + (load<Batch | null>(INFLIGHT_KEY, null)?.items.length ?? 0));
    const t = setInterval(send, SEND_EVERY_MS);
    window.addEventListener("online", send);
    const flush = () => void send();
    document.addEventListener("visibilitychange", flush);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", send);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [send]);

  // ---- The scanner ----
  // Scanners "type" the barcode very fast and press Enter. Fast typing + Enter = a scan;
  // normal typing in the search box is left alone.
  const onScan = useCallback(
    (code: string) => {
      const productId = barcodes[code.toLowerCase()];
      if (productId && byId.has(productId)) {
        beep(true);
        add(productId, 1, "scan");
      } else {
        beep(false);
        setUnknownCode(code);
      }
    },
    [barcodes, byId, beep, add],
  );

  useEffect(() => {
    let buf = "";
    let first = 0;
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const now = performance.now();
      if (e.key === "Enter") {
        const fast = buf.length >= 6 && (last - first) / (buf.length - 1) < 40 && now - last < 150;
        if (fast) {
          e.preventDefault();
          const code = buf;
          // If the search box had focus, take the barcode digits back out of it.
          if (e.target instanceof HTMLInputElement) setSearch((v) => (v.endsWith(code) ? v.slice(0, -code.length) : v));
          onScan(code);
        }
        buf = "";
        return;
      }
      if (e.key.length !== 1) return;
      if (now - last > 80) {
        buf = "";
        first = now;
      }
      buf += e.key;
      last = now;
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onScan]);

  async function assign(productId: string) {
    const code = unknownCode;
    if (!code) return;
    setUnknownCode(null);
    setBarcodes((b) => ({ ...b, [code.toLowerCase()]: productId }));
    add(productId, 1, "scan");
    beep(true);
    const res = await saveBarcode(code, productId);
    if ("error" in res && res.error) toast.error(`Barcode not saved: ${res.error}`);
    else toast.success(`Saved: that barcode is ${byId.get(productId)?.name}`);
  }

  // ---- Numbers for the top bar ----
  const itemsToday = (Object.values(sold) as number[]).reduce((a, b) => a + b, 0);
  const valueToday = products.reduce((s, p) => s + (sold[p.id] ?? 0) * p.price, 0);
  const shown = search.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : products;

  return (
    <div className="grid gap-5">
      {/* Top bar: today's totals and status */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">Register</h1>
          <p className="text-sm text-muted-foreground">
            {formatDay(today, { weekday: "long" })}: hold each item over the scanner, or tap it below.
          </p>
        </div>
        <Stat label="Items sold today" value={itemsToday.toLocaleString()} />
        <Stat label="Worth" value={formatCents(valueToday)} />
        <span
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium",
            offline ? "border-warning/50 bg-warning/10 text-warning" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          {offline ? <CloudOffIcon className="size-4" /> : <CheckIcon className="size-4 text-success" />}
          {offline ? `Offline: ${waiting} waiting, will send` : waiting > 0 ? "Saving…" : "All saved"}
        </span>
        <Button variant="outline" className="h-10" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
          <MaximizeIcon /> Full screen
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Tap buttons, best sellers first */}
        <section aria-label="Products" className="grid content-start gap-3">
          <label className="relative block">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find an item without a barcode…"
              aria-label="Find an item"
              className="h-11 w-full rounded-xl border bg-card pr-3 pl-9 text-sm shadow-soft focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            />
          </label>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    beep(true);
                    add(p.id, 1, "tap");
                  }}
                  className={cn(
                    "relative flex h-full w-full touch-manipulation items-center gap-3 rounded-2xl border bg-card p-3 text-left shadow-soft transition-transform select-none active:scale-[0.97]",
                    flash === p.id && "border-primary bg-primary/10",
                  )}
                >
                  <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-2xl">
                    {p.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo} alt="" className="size-full object-cover" />
                    ) : (
                      (p.emoji ?? "📦")
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-tight font-semibold">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{formatCents(p.price)}</span>
                  </span>
                  {(sold[p.id] ?? 0) > 0 && (
                    <span className="absolute top-2 right-2 grid min-w-6 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground tabular-nums">
                      {sold[p.id]}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {shown.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No items match “{search}”.</p>}
        </section>

        {/* What was just rung up */}
        <aside className="grid content-start gap-3 lg:sticky lg:top-20 lg:self-start">
          <Button onClick={undoLast} disabled={!feed.some((f) => !f.undone)} variant="outline" className="h-14 text-base font-semibold">
            <Undo2Icon className="size-5" /> Undo last
          </Button>
          <div className="rounded-2xl border bg-card p-4 shadow-soft">
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Just now</h2>
            {feed.length === 0 ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <ScanBarcodeIcon className="size-5" /> Scan an item to start.
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {feed.map((f) => {
                  const p = byId.get(f.productId);
                  return (
                    <li key={f.key} className={cn("flex items-center gap-2 text-sm", f.undone && "text-muted-foreground line-through")}>
                      <span aria-hidden>{p?.emoji ?? "📦"}</span>
                      <span className="min-w-0 flex-1 truncate">{p?.name}</span>
                      <span className="text-xs text-muted-foreground">{f.how === "scan" ? "scanned" : "tapped"}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            New barcode? Just scan it: the site asks which item it is once and remembers it after that. Counts only take items
            out of stock. Money still comes from the End of Period Summary.
          </p>
        </aside>
      </div>

      {/* "Which item is this?" for a barcode the site hasn't seen yet */}
      {unknownCode && (
        <AssignBarcode code={unknownCode} products={products} onPick={assign} onClose={() => setUnknownCode(null)} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-1.5 shadow-soft">
      <div className="text-[0.7rem] font-medium text-muted-foreground">{label}</div>
      <div className="font-heading text-lg leading-tight font-extrabold tabular-nums">{value}</div>
    </div>
  );
}

function AssignBarcode({
  code,
  products,
  onPick,
  onClose,
}: {
  code: string;
  products: RegisterProduct[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const list = q.trim() ? products.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())) : products;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="assign-title" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="grid max-h-[85vh] w-full max-w-lg grid-rows-[auto_auto_1fr] gap-3 rounded-2xl border bg-card p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 id="assign-title" className="font-heading text-xl font-bold">
              New barcode
            </h2>
            <p className="text-sm text-muted-foreground">
              Tap the item with barcode <span className="font-mono">{code}</span>. It&apos;ll be remembered and counted.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cancel">
            <XIcon />
          </Button>
        </div>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search items…"
          aria-label="Search items"
          className="h-11 rounded-xl border bg-background px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        />
        <ul className="grid gap-1.5 overflow-y-auto">
          {list.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p.id)}
                className="flex w-full items-center gap-3 rounded-xl border p-2.5 text-left hover:border-primary/50 hover:bg-primary/5"
              >
                <span aria-hidden className="text-xl">
                  {p.emoji ?? "📦"}
                </span>
                <span className="flex-1 text-sm font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">{formatCents(p.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
