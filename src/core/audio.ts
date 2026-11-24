// OWNER: audio agent. Contract — keep signatures.
// Fully synthesized WebAudio: pen/paper/ink/typewriter SFX + generative lo-fi loop.
import type { SfxName } from '../types';

// ------------------------------------------------------------------ state
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let noiseBufs: AudioBuffer[] = [];
let primed = false;

let soundOn = true;
let musicOn = true;
let suspended = false;

const SFX_LEVEL = 0.9;
const MUSIC_LEVEL = 0.22;
const MAX_VOICES = 24;
const MAX_VOICES_PRIORITY = 32;

let activeVoices = 0;
const lastPlay: Partial<Record<SfxName, number>> = {};
let pickupChain = 0;
let lastPickupAt = 0;

const MIN_INTERVAL: Partial<Record<SfxName, number>> = {
  shoot: 60, hit: 35, crit: 40, kill: 45, pickup: 30, zap: 50, enemyShoot: 90,
  click: 40, dash: 80, swoosh: 80, hurt: 90, explode: 60, heal: 120, chest: 150,
  pick: 80, wave: 300, boss: 500, bossDie: 500, levelup: 300, evolve: 300,
  legendary: 300, death: 800,
};
const PRIORITY = new Set<SfxName>(['boss', 'bossDie', 'death', 'levelup', 'legendary', 'evolve']);

function rnd(): number { return Math.random(); }
function pv(): number { return 1 + (rnd() - 0.5) * 0.12; }
function mtof(m: number): number { return 440 * Math.pow(2, (m - 69) / 12); }

// ---------------------------------------------------------------- helpers
interface ToneOpt {
  att?: number; hold?: number; dest?: AudioNode; det?: number; lp?: [number, number];
}

function tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number, o: ToneOpt = {}): void {
  const c = ctx!;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  if (o.det) osc.detune.value = o.det;
  const g = c.createGain();
  const att = Math.min(o.att ?? 0.004, dur * 0.5);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + att);
  if (o.hold && o.hold > att) g.gain.setValueAtTime(vol, t + Math.min(o.hold, dur * 0.95));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = osc;
  if (o.lp) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(o.lp[0], t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, o.lp[1]), t + dur);
    osc.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(o.dest ?? sfxGain!);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

/** Filtered noise burst; `freqs` are evenly spaced filter-frequency waypoints over dur. */
function noise(ftype: BiquadFilterType, freqs: number[], q: number, t: number, dur: number, vol: number,
  o: { att?: number; dest?: AudioNode } = {}): void {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBufs[(rnd() * noiseBufs.length) | 0];
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = ftype;
  f.Q.value = q;
  f.frequency.setValueAtTime(freqs[0], t);
  for (let i = 1; i < freqs.length; i++) {
    f.frequency.exponentialRampToValueAtTime(Math.max(20, freqs[i]), t + (dur * i) / (freqs.length - 1));
  }
  const g = c.createGain();
  const att = Math.min(o.att ?? 0.003, dur * 0.5);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(o.dest ?? sfxGain!);
  src.start(t, rnd() * 0.8);
  src.stop(t + dur + 0.03);
}

/** Bell: fundamental + inharmonic partials. */
function bell(f: number, t: number, dur: number, vol: number, dest?: AudioNode): void {
  tone('sine', f, f, t, dur, vol, { dest });
  tone('sine', f * 2.76, f * 2.76, t, dur * 0.6, vol * 0.4, { dest });
  tone('sine', f * 5.4, f * 5.4, t, dur * 0.3, vol * 0.15, { dest });
}

// ------------------------------------------------------------ lifecycle
export function unlockAudio(): void {
  try {
    if (!ctx) {
      const Ctor: typeof AudioContext | undefined =
        (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      const c = ctx;
      master = c.createGain();
      master.gain.value = 0.9;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 18;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      sfxGain = c.createGain();
      sfxGain.gain.value = soundOn ? SFX_LEVEL : 0;
      musicGain = c.createGain();
      musicGain.gain.value = musicOn ? MUSIC_LEVEL : 0;
      sfxGain.connect(master);
      musicGain.connect(master);
      master.connect(comp);
      comp.connect(c.destination);
      // noise buffers (white, 1s, 3 variants)
      noiseBufs = [];
      for (let k = 0; k < 3; k++) {
        const len = c.sampleRate;
        const b = c.createBuffer(1, len, c.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        noiseBufs.push(b);
      }
      initMusicGraph();
      c.onstatechange = () => { updateScheduler(); };
    }
    const c = ctx;
    if (c.state !== 'running' || !primed) {
      try {
        const p = c.resume();
        if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
      } catch { /* ignore */ }
      try {
        const buf = c.createBuffer(1, 1, 22050);
        const s = c.createBufferSource();
        s.buffer = buf;
        s.connect(c.destination);
        s.start(0);
        primed = true;
      } catch { /* ignore */ }
    }
    suspended = false;
    updateScheduler();
  } catch { /* never throw */ }
}

export function setSoundEnabled(on: boolean): void {
  soundOn = on;
  try {
    if (ctx && sfxGain) sfxGain.gain.setTargetAtTime(on ? SFX_LEVEL : 0, ctx.currentTime, 0.02);
  } catch { /* ignore */ }
}

export function setMusicEnabled(on: boolean): void {
  musicOn = on;
  try {
    if (ctx && musicGain) musicGain.gain.setTargetAtTime(on ? MUSIC_LEVEL : 0, ctx.currentTime, 0.05);
    updateScheduler();
  } catch { /* ignore */ }
}

export function suspendAudio(): void {
  suspended = true;
  try {
    stopScheduler();
    if (ctx && ctx.state === 'running') {
      const p = ctx.suspend();
      if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
    }
  } catch { /* ignore */ }
}

export function resumeAudio(): void {
  suspended = false;
  try {
    if (!ctx) return;
    const p = ctx.resume();
    if (p && typeof p.then === 'function') p.then(() => updateScheduler(), () => { /* ignore */ });
    updateScheduler();
  } catch { /* ignore */ }
}

// -------------------------------------------------------------------- SFX
export function sfx(name: SfxName, intensity: number = 0.5): void {
  try {
    if (!ctx || !sfxGain || !soundOn || suspended || ctx.state === 'closed') return;
    const nowMs = performance.now();
    const min = MIN_INTERVAL[name] ?? 40;
    const last = lastPlay[name];
    if (last !== undefined && nowMs - last < min) return;
    const cap = PRIORITY.has(name) ? MAX_VOICES_PRIORITY : MAX_VOICES;
    if (activeVoices >= cap) return;
    lastPlay[name] = nowMs;

    const it = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity;
    const vs = 0.7 + 0.6 * it;
    const t = ctx.currentTime + 0.005;
    const dur = playSfx(name, t, vs);
    activeVoices++;
    setTimeout(() => { if (activeVoices > 0) activeVoices--; }, dur * 1000 + 80);
  } catch { /* never throw */ }
}

/** Builds the sound; returns its approximate duration in seconds. */
function playSfx(name: SfxName, t: number, vs: number): number {
  const p = pv();
  switch (name) {
    case 'shoot':
      noise('bandpass', [3500 * p, 2000 * p], 2, t, 0.04, 0.25 * vs);
      tone('sine', 1800 * p, 2500 * p, t, 0.05, 0.06 * vs);
      return 0.06;
    case 'hit':
      noise('lowpass', [2400 * p, 500], 0.8, t, 0.07, 0.4 * vs);
      tone('sine', 170 * p, 70, t, 0.09, 0.45 * vs);
      return 0.1;
    case 'crit':
      noise('bandpass', [5500 * p, 2500], 1.2, t, 0.06, 0.4 * vs);
      tone('triangle', 240 * p, 90, t, 0.08, 0.4 * vs);
      tone('sine', 2400 * p, 2400 * p, t, 0.28, 0.14 * vs);
      tone('sine', 3350 * p, 3350 * p, t, 0.2, 0.07 * vs);
      return 0.3;
    case 'kill':
      noise('bandpass', [2600 * p, 280], 3, t, 0.16, 0.5 * vs);
      tone('sine', 150 * p, 50, t, 0.14, 0.5 * vs);
      return 0.18;
    case 'pickup': {
      if (performance.now() - lastPickupAt > 400) pickupChain = 0;
      lastPickupAt = performance.now();
      const pent = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33];
      const semi = pent[Math.min(pickupChain, pent.length - 1)];
      pickupChain++;
      const f = 523.25 * Math.pow(2, semi / 12) * (1 + (rnd() - 0.5) * 0.01);
      tone('sine', f, f, t, 0.16, 0.28 * vs);
      tone('triangle', f * 2, f * 2, t, 0.08, 0.08 * vs);
      return 0.18;
    }
    case 'levelup': {
      noise('highpass', [3000, 3000], 0.7, t, 0.03, 0.2 * vs); // carriage tick
      bell(880, t + 0.02, 0.6, 0.3 * vs);
      bell(1760, t + 0.02, 0.35, 0.08 * vs);
      const arp = [0, 4, 7, 12];
      for (let i = 0; i < arp.length; i++) {
        tone('triangle', 440 * Math.pow(2, arp[i] / 12), 440 * Math.pow(2, arp[i] / 12), t + 0.18 + i * 0.06, 0.14, 0.18 * vs);
      }
      return 0.65;
    }
    case 'pick':
      noise('bandpass', [1600 * p, 800], 1, t, 0.05, 0.4 * vs);
      tone('sine', 130 * p, 70, t, 0.06, 0.35 * vs);
      tone('sine', 1319, 1319, t + 0.04, 0.35, 0.2 * vs);
      tone('sine', 1976, 1976, t + 0.08, 0.3, 0.1 * vs);
      return 0.45;
    case 'hurt':
      tone('sine', 95 * p, 48, t, 0.22, 0.6 * vs, { lp: [400, 150] });
      tone('sawtooth', 230 * p, 110, t, 0.25, 0.18 * vs, { lp: [1000, 300] });
      tone('sawtooth', 230 * p, 110, t, 0.25, 0.14 * vs, { lp: [1000, 300], det: 35 });
      noise('lowpass', [700, 250], 0.7, t, 0.1, 0.3 * vs);
      return 0.28;
    case 'boss': {
      const f = 55;
      tone('sawtooth', f, f, t, 1.5, 0.22 * vs, { att: 0.7, hold: 1.0, lp: [120, 900] });
      tone('sawtooth', f * 1.008, f * 1.008, t, 1.5, 0.2 * vs, { att: 0.7, hold: 1.0, lp: [120, 900], det: 12 });
      tone('sawtooth', f * 1.5, f * 1.5, t, 1.5, 0.12 * vs, { att: 0.7, hold: 1.0, lp: [120, 700], det: -10 });
      tone('sine', 120, 52, t + 0.8, 0.6, 0.6 * vs);
      noise('lowpass', [800, 150], 0.7, t + 0.8, 0.25, 0.4 * vs);
      return 1.5;
    }
    case 'bossDie':
      tone('sawtooth', 900, 40, t, 1.4, 0.28 * vs, { lp: [3500, 200] });
      tone('sawtooth', 910, 41, t, 1.4, 0.2 * vs, { lp: [3500, 200], det: 20 });
      noise('lowpass', [6000, 150], 0.8, t, 1.2, 0.6 * vs);
      tone('sine', 95, 28, t, 0.9, 0.7 * vs);
      bell(440, t + 0.25, 1.3, 0.25 * vs);
      return 1.55;
    case 'explode':
      noise('lowpass', [4200 * p, 110], 0.8, t, 0.5, 0.7 * vs);
      tone('sine', 105 * p, 34, t, 0.4, 0.75 * vs);
      return 0.55;
    case 'zap':
      tone('square', 2500 * p, 320, t, 0.12, 0.16 * vs, { lp: [6000, 1200] });
      tone('square', 1900 * p, 220, t + 0.05, 0.1, 0.11 * vs, { lp: [5000, 1000] });
      noise('highpass', [6000, 3000], 0.7, t, 0.06, 0.1 * vs);
      return 0.17;
    case 'evolve': {
      const sc = [0, 4, 7, 12, 16, 19, 24];
      for (let i = 0; i < sc.length; i++) {
        const f = 392 * Math.pow(2, sc[i] / 12);
        const tt = t + i * 0.055;
        tone('triangle', f, f, tt, 0.28, 0.16 * vs, { det: -14 });
        tone('triangle', f, f, tt, 0.28, 0.16 * vs, { det: 14 });
        tone('sine', f * 2, f * 2, tt, 0.2, 0.05 * vs);
      }
      noise('highpass', [5000, 9000], 0.7, t, 0.5, 0.08 * vs, { att: 0.2 });
      return 0.75;
    }
    case 'legendary': {
      const chord = [220, 440, 660, 880, 1320, 1760]; // I - V - I octaves (A, E)
      for (let i = 0; i < chord.length; i++) {
        bell(chord[i], t + i * 0.05, 1.5 - i * 0.05, (0.22 - i * 0.02) * vs);
      }
      for (let i = 0; i < 9; i++) {
        const f = 3000 + rnd() * 3500;
        tone('sine', f, f, t + 0.1 + rnd() * 0.9, 0.12, 0.05 * vs);
      }
      noise('highpass', [7000, 10000], 0.7, t, 0.9, 0.06 * vs, { att: 0.3 });
      return 1.6;
    }
    case 'death':
      tone('sawtooth', 440, 38, t, 1.5, 0.22 * vs, { lp: [2000, 150] });
      tone('triangle', 330, 30, t, 1.5, 0.3 * vs);
      for (let i = 0; i < 6; i++) {
        noise('highpass', [2500 + rnd() * 2500, 1800], 0.8, t + 0.05 + rnd() * 0.9, 0.04 + rnd() * 0.04, 0.22 * vs);
      }
      return 1.6;
    case 'click':
      tone('square', 1500 * p, 1300, t, 0.015, 0.1 * vs);
      noise('highpass', [4000, 4000], 0.7, t, 0.01, 0.1 * vs);
      return 0.03;
    case 'wave':
      noise('bandpass', [350, 3000, 450], 1.4, t, 0.55, 0.32 * vs, { att: 0.12 });
      return 0.58;
    case 'heal':
      tone('sine', 523.25, 523.25, t, 0.45, 0.2 * vs, { lp: [3000, 1500] });
      tone('sine', 659.25, 659.25, t + 0.07, 0.45, 0.2 * vs, { lp: [3000, 1500] });
      tone('triangle', 1046.5, 1046.5, t + 0.07, 0.3, 0.05 * vs);
      return 0.55;
    case 'chest': {
      for (let i = 0; i < 6; i++) {
        const tt = t + i * 0.04 + rnd() * 0.02;
        noise('bandpass', [900 + rnd() * 500, 600], 3, tt, 0.04, 0.3 * vs);
        tone('square', 180 + rnd() * 60, 120, tt, 0.03, 0.08 * vs, { lp: [1200, 400] });
      }
      tone('sine', 1568, 1568, t + 0.3, 0.3, 0.18 * vs);
      tone('sine', 2093, 2093, t + 0.37, 0.25, 0.14 * vs);
      return 0.65;
    }
    case 'swoosh':
      noise('bandpass', [500 * p, 2500 * p], 1, t, 0.3, 0.3 * vs, { att: 0.08 });
      return 0.33;
    case 'dash':
      noise('bandpass', [1200 * p, 4200 * p], 1.2, t, 0.14, 0.35 * vs, { att: 0.03 });
      return 0.17;
    case 'enemyShoot':
      tone('sine', 700 * p, 190, t, 0.12, 0.25 * vs);
      noise('bandpass', [1500, 600], 2, t, 0.04, 0.08 * vs);
      return 0.15;
    default:
      return 0.05;
  }
}

// ------------------------------------------------------------------ music
const BPM = 92;
const STEP = 60 / BPM / 4; // 16th note
const PENT = [0, 3, 5, 7, 10]; // A minor pentatonic
const CHORDS: number[][] = [
  [45, 57, 60, 64], // Am  (bass root A2, then A3 C4 E4)
  [41, 53, 57, 60], // F
  [48, 60, 64, 67], // C
  [43, 55, 59, 62], // G
];

interface Layers {
  kick: GainNode; hat: GainNode; bass: GainNode; pluck: GainNode;
  snare: GainNode; hat16: GainNode; pad: GainNode; drone: GainNode;
}
let layers: Layers | null = null;
const targets = { kick: 0.7, hat: 0.6, bass: 1, pluck: 0.7, snare: 0, hat16: 0, pad: 0, drone: 0 };
let musicInt = 0.25;
let musicPlaying = false;
let schedTimer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0;
let stepIdx = 0;
let melIdx = 4;
let seed = 1337;

function mulberry(): number {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function initMusicGraph(): void {
  const c = ctx!;
  const mk = (): GainNode => { const g = c.createGain(); g.gain.value = 0; g.connect(musicGain!); return g; };
  layers = { kick: mk(), hat: mk(), bass: mk(), pluck: mk(), snare: mk(), hat16: mk(), pad: mk(), drone: mk() };
  computeTargets(true);
}

function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x; }

function computeTargets(immediate: boolean): void {
  const v = musicInt;
  const boss = v >= 0.9;
  targets.kick = boss ? 1.0 : v < 0.3 ? 0.6 : 0.8;
  targets.hat = boss ? 0.5 : v < 0.3 ? 0.45 : 0.8;
  targets.bass = boss ? 0.9 : 1;
  targets.pluck = boss ? 0.45 : v < 0.3 ? 0.55 : 1;
  targets.snare = boss ? 0.85 : clamp01((v - 0.3) / 0.25) * 0.8;
  targets.hat16 = boss ? 0.8 : clamp01((v - 0.5) / 0.25) * 0.8;
  targets.pad = boss ? 0 : clamp01((v - 0.25) / 0.3) * 0.8;
  targets.drone = boss ? 1 : 0;
  if (!layers || !ctx) return;
  const now = ctx.currentTime;
  (Object.keys(targets) as (keyof Layers)[]).forEach((k) => {
    const g = layers![k].gain;
    if (immediate) g.setValueAtTime(targets[k], now);
    else g.setTargetAtTime(targets[k], now, 0.5);
  });
}

export function setMusicIntensity(v: number): void {
  try {
    musicInt = clamp01(v);
    computeTargets(false);
  } catch { /* ignore */ }
}

export function startMusic(): void {
  try {
    if (!musicPlaying) {
      musicPlaying = true;
      seed = 1337;
      stepIdx = 0;
      melIdx = 4;
      nextTime = 0;
    }
    updateScheduler();
  } catch { /* ignore */ }
}

export function stopMusic(): void {
  musicPlaying = false;
  stopScheduler();
}

function stopScheduler(): void {
  if (schedTimer !== null) { clearInterval(schedTimer); schedTimer = null; }
}

function updateScheduler(): void {
  const should = musicPlaying && musicOn && !suspended && !!ctx && !!layers && ctx.state !== 'closed';
  if (!should) { stopScheduler(); return; }
  if (schedTimer !== null) return;
  const c = ctx!;
  if (nextTime < c.currentTime + 0.05) nextTime = c.currentTime + 0.06;
  schedTimer = setInterval(schedTick, 50);
  schedTick();
}

function schedTick(): void {
  try {
    const c = ctx;
    if (!c || !layers) return;
    if (c.state !== 'running') return; // don't pile up while interrupted
    if (nextTime < c.currentTime - 0.1) nextTime = c.currentTime + 0.05; // fell behind
    while (nextTime < c.currentTime + 0.15) {
      const swing = stepIdx % 2 === 1 ? STEP * 0.12 : 0;
      scheduleStep(stepIdx, nextTime + swing);
      stepIdx++;
      nextTime += STEP;
    }
  } catch { /* ignore */ }
}

function scheduleStep(step: number, t: number): void {
  const L = layers!;
  const s = step % 16;
  const bar = Math.floor(step / 16) % 4;
  const chord = CHORDS[bar];
  const boss = musicInt >= 0.9;
  const full = musicInt >= 0.3;
  const r = mulberry();

  // (1) drums
  if (targets.kick > 0.02) {
    const hit = boss ? (s === 0 || s === 4 || s === 8 || s === 12 || (s === 14 && r < 0.4)) : (s === 0 || s === 8);
    if (hit) {
      const vol = boss ? 0.95 : 0.7;
      tone('sine', boss ? 140 : 120, 42, t, boss ? 0.2 : 0.14, vol, { dest: L.kick });
      noise('lowpass', [1500, 300], 0.7, t, 0.02, 0.15, { dest: L.kick });
    }
  }
  if (targets.hat > 0.02 && s % 4 === 2) {
    noise('bandpass', [9000, 7000], 0.8, t, 0.05, 0.1 + r * 0.03, { att: 0.004, dest: L.hat });
  }
  if (targets.snare > 0.02 && (s === 4 || s === 12)) {
    noise('bandpass', [2200, 1500], 0.9, t, 0.14, 0.22, { dest: L.snare });
    tone('triangle', 200, 150, t, 0.09, 0.22, { dest: L.snare });
  }
  if (targets.hat16 > 0.02 && (s % 2 === 1 || s % 4 === 0)) {
    noise('highpass', [8000, 8000], 0.7, t, 0.025, s % 2 === 1 ? 0.06 : 0.04, { dest: L.hat16 });
  }

  // (2) bass
  if (targets.bass > 0.02) {
    const root = chord[0];
    let bn = -1;
    if (s === 0) bn = root;
    else if (s === 6) bn = root;
    else if (s === 10 && r < 0.6) bn = root + 7;
    else if (s === 14 && r < 0.4) bn = root + 12;
    if (bn > 0) {
      const f = mtof(bn);
      tone('triangle', f, f, t, boss ? 0.45 : 0.3, 0.5, { att: 0.008, lp: [boss ? 300 : 500, 150], dest: L.bass });
    }
  }

  // (3) typewriter plucks
  if (targets.pluck > 0.02) {
    const p = boss ? 0.28 : full ? 0.5 : 0.3;
    if ((s % 2 === 0 && r < p) || (s % 2 === 1 && full && r < 0.12)) {
      const stepMove = [-2, -1, -1, 0, 1, 1, 2][(mulberry() * 7) | 0];
      melIdx = Math.max(0, Math.min(9, melIdx + stepMove));
      const m = 69 + PENT[melIdx % 5] + 12 * Math.floor(melIdx / 5);
      const f = mtof(m);
      tone('square', f, f, t, 0.1, 0.1, { lp: [3000, 900], dest: L.pluck });
      tone('triangle', f * 2, f * 2, t, 0.06, 0.06, { dest: L.pluck });
      noise('highpass', [5000, 5000], 0.7, t, 0.008, 0.07, { dest: L.pluck });
    }
  }

  // (4) pad + drone, once per bar
  if (s === 0) {
    const barDur = STEP * 16;
    if (targets.pad > 0.02) {
      for (let i = 1; i < chord.length; i++) {
        const f = mtof(chord[i]);
        tone('sawtooth', f, f, t, barDur + 0.3, 0.05, { att: 0.5, hold: barDur * 0.8, det: -9, lp: [700, 500], dest: L.pad });
        tone('sawtooth', f, f, t, barDur + 0.3, 0.05, { att: 0.5, hold: barDur * 0.8, det: 9, lp: [700, 500], dest: L.pad });
      }
    }
    if (targets.drone > 0.02) {
      const f = 55;
      tone('sine', f, f, t, barDur + 0.3, 0.45, { att: 0.3, hold: barDur * 0.9, dest: L.drone });
      tone('sawtooth', f, f, t, barDur + 0.3, 0.12, { att: 0.3, hold: barDur * 0.9, det: 7, lp: [220, 160], dest: L.drone });
    }
  }
}
