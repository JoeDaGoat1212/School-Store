/*
 * Cartoon sound effects for the city, made on the fly with the browser's
 * Web Audio (no sound files to download): a wailing siren, a cash register
 * "ka-ching", glass smashing, the vault drill and clunks, and little tunes
 * for getting away (or getting busted). Quiet by default, and there's a mute
 * button. Sounds only ever start after you press a key or tap, so browsers
 * allow them.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let siren: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;

function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.32;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** A short note: frequency, start (seconds from now), length, wave shape, loudness. */
function tone(freq: number, at: number, length: number, type: OscillatorType = "sine", volume = 0.5, slideTo?: number) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + length);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

/** A burst of noise (glass, thuds), through a filter. */
function noise(at: number, length: number, volume: number, filter: BiquadFilterType, freq: number) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + at;
  const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * length), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const f = a.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  const gain = a.createGain();
  gain.gain.value = volume;
  src.connect(f).connect(gain).connect(master);
  src.start(t);
}

export const sound = {
  mute(on: boolean) {
    muted = on;
    if (master && ctx) master.gain.setTargetAtTime(on ? 0 : 0.32, ctx.currentTime, 0.05);
  },
  /** The police siren: on while they're after you. */
  alarm(on: boolean) {
    const a = audio();
    if (!a || !master) return;
    if (on && !siren) {
      const osc = a.createOscillator();
      const lfo = a.createOscillator();
      const depth = a.createGain();
      const gain = a.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = 760;
      // Wee-woo: the pitch swings up and down twice a second.
      lfo.type = "square";
      lfo.frequency.value = 1.6;
      depth.gain.value = 170;
      lfo.connect(depth).connect(osc.frequency);
      const soft = a.createBiquadFilter();
      soft.type = "lowpass";
      soft.frequency.value = 1800;
      gain.gain.value = 0.0001;
      gain.gain.exponentialRampToValueAtTime(0.09, a.currentTime + 0.4);
      osc.connect(soft).connect(gain).connect(master);
      osc.start();
      lfo.start();
      siren = { osc, lfo, gain };
    } else if (!on && siren) {
      const s = siren;
      siren = null;
      s.gain.gain.setTargetAtTime(0.0001, a.currentTime, 0.25);
      s.osc.stop(a.currentTime + 1.2);
      s.lfo.stop(a.currentTime + 1.2);
    }
  },
  /** Ka-ching! */
  cash() {
    tone(1318, 0, 0.12, "square", 0.18);
    tone(1760, 0.08, 0.35, "square", 0.16);
    noise(0, 0.08, 0.25, "highpass", 5000);
  },
  /** Glass smashing. */
  smash() {
    noise(0, 0.5, 0.9, "highpass", 2500);
    for (let i = 0; i < 6; i++) tone(2400 + Math.random() * 2600, 0.03 + i * 0.05, 0.12, "triangle", 0.08);
  },
  /** The vault drill, then a big clunk. */
  drill() {
    tone(180, 0, 1.6, "sawtooth", 0.12, 260);
    tone(90, 1.6, 0.4, "square", 0.3, 40);
    noise(1.6, 0.4, 0.8, "lowpass", 300);
    noise(2.3, 0.6, 1, "lowpass", 220);
  },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.3, "square", 0.14));
  },
  busted() {
    [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.18, 0.35, "sawtooth", 0.12));
  },
};
