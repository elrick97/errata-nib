// OWNER: orchestrator. Game state machine + main loop + wiring.
import type { World, GameEvents, MetaSave, Settings } from './types';
import { createWorld } from './game/world';
import { input, initInput, resetInput } from './core/input';
import { loadSave, writeSave, defaultSave } from './core/save';
import { haptic, setHapticsEnabled, onVisibilityChange, lockDownPage } from './core/platform';
import * as audio from './core/audio';
import * as fx from './game/fx';
import { initRender, resizeRender, render, renderIdle } from './game/render';
import { updateEnemies, updateEnemyBullets } from './game/enemies';
import { resetDirector, updateDirector, pageLabel } from './game/director';
import { updatePlayer } from './game/player';
import { updatePickups } from './game/pickups';
import { updateWeapons, updateBullets } from './game/weapons';
import { rollChoices, applyChoice, recomputeStats, ownedSummary, type UpgradeChoice } from './game/upgrades';
import { SHOP, buy, inkForRun } from './game/meta';
import * as ui from './ui/ui';

type State = 'title' | 'playing' | 'levelup' | 'paused' | 'dying' | 'results' | 'menu';

let state: State = 'title';
let meta: MetaSave;
let w: World | null = null;
let canvas: HTMLCanvasElement;
let raf = 0;
let last = 0;
let levelUpDelay = 0;
let dyingTimer = 0;
let hidden = false;
let idleT = 0;
let idleAcc = 0;

const events: GameEvents = {
  pageStart(page, label) {
    ui.pageBanner(label);
    audio.sfx('wave');
    if (w && !w.boss) audio.setMusicIntensity(Math.min(0.85, 0.25 + page * 0.04));
  },
  bossSpawn(name, sub) {
    ui.bossBanner(name, sub);
    audio.sfx('boss');
    audio.setMusicIntensity(1);
    if (w) { fx.shake(w, 14); fx.flash(w, '#1b1a22', 0.35); }
    haptic([40, 60, 40]);
  },
  bossDefeated(name) {
    ui.toast(name + ' — corrected!', '#e8a91c');
    audio.sfx('bossDie');
    if (w) { audio.setMusicIntensity(Math.min(0.85, 0.25 + w.page * 0.04)); fx.flash(w, '#fffaf0', 0.7); w.timeScale = 0.2; }
    haptic([60, 40, 120]);
  },
  playerHurt() { haptic(25); },
  playerDeath() {
    if (state !== 'playing' && state !== 'levelup') return;
    state = 'dying'; dyingTimer = 1.4;
    audio.sfx('death'); audio.stopMusic();
    if (w) { w.timeScale = 0.25; fx.flash(w, '#d7263d', 0.5); fx.shake(w, 18); }
    haptic([80, 50, 200]);
  },
  levelUp() {
    if (!w) return;
    if (levelUpDelay <= 0) levelUpDelay = 0.45;
    w.timeScale = 0.2;
    fx.ring(w, w.player.x, w.player.y, 140, '#ffe14d', 0.5, 6);
    fx.burst(w, w.player.x, w.player.y, '#ffe14d', 24, 260, 4);
    fx.flash(w, '#ffe14d', 0.25);
    audio.sfx('levelup');
    haptic(30);
  },
  toast(text, color) { ui.toast(text, color); },
  sfx(name, intensity) { audio.sfx(name, intensity); },
  haptic(ms) { haptic(ms); },
};

function applySettings(s: Settings) {
  audio.setSoundEnabled(s.sound);
  audio.setMusicEnabled(s.music);
  setHapticsEnabled(s.haptics);
}

function save() { if (meta) writeSave(meta); }

// ------------------------------------------------------------------ screens

function goTitle() {
  state = 'title';
  w = null;
  resetInput();
  ui.showHud(false);
  ui.showTitle(meta, {
    onStart: startRun,
    onShop: goShop,
    onSettings: goSettings,
  });
  ensureLoop();
}

function goShop() {
  state = 'menu';
  const refresh = () => ui.showShop(meta, SHOP, {
    onBuy(id) {
      if (buy(meta, id)) { audio.sfx('pick'); save(); } else audio.sfx('click');
      refresh();
    },
    onBack: goTitle,
  });
  refresh();
}

function goSettings() {
  state = 'menu';
  const refresh = () => ui.showSettings(meta.settings, {
    onToggle(k) { meta.settings[k] = !meta.settings[k]; applySettings(meta.settings); save(); audio.sfx('click'); refresh(); },
    onResetSave() { const s = meta.settings; meta = defaultSave(); meta.settings = s; save(); refresh(); },
    onBack: goTitle,
  });
  refresh();
}

function startRun() {
  audio.unlockAudio();
  const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  w = createWorld(meta, events, seed);
  fx.resetFx();
  sizeCanvas();
  recomputeStats(w);
  w.player.hp = w.player.maxHp = w.stats.maxHp;
  w.rerolls = 1 + (meta.shop['reroll'] ?? 0);
  // starting weapon: Red Ink Dart
  applyChoice(w, { id: 'dart', name: 'Red Ink Dart', desc: '', icon: '', rarity: 'common', kind: 'weapon', level: 1, isNew: true });
  resetDirector(w);
  resetInput();
  ui.hideAll();
  ui.showHud(true);
  state = 'playing';
  levelUpDelay = 0;
  audio.startMusic();
  audio.setMusicIntensity(0.25);
  meta.runs++;
  save();
  ensureLoop();
}

function openLevelUp() {
  if (!w) return;
  state = 'levelup';
  resetInput();
  const choices = rollChoices(w, 3);
  if (choices.some(c => c.rarity === 'legendary')) { audio.sfx('legendary'); haptic([20, 30, 20, 30, 60]); }
  ui.showLevelUp(choices, w.rerolls, {
    onPick(c: UpgradeChoice) {
      if (!w) return;
      applyChoice(w, c);
      audio.sfx(c.kind === 'evolution' ? 'evolve' : c.rarity === 'legendary' ? 'legendary' : 'pick');
      const p = w.player;
      if (c.kind === 'evolution' || c.rarity === 'legendary') {
        fx.ring(w, p.x, p.y, 260, c.rarity === 'legendary' ? '#e8a91c' : '#2f6fd0', 0.7, 10);
        fx.flash(w, c.rarity === 'legendary' ? '#e8a91c' : '#2f6fd0', 0.45);
        fx.shake(w, 10);
        fx.floatText(w, p.x, p.y - 30, c.kind === 'evolution' ? 'EVOLVED!' : 'LEGENDARY!', '#e8a91c', 22);
      } else {
        fx.ring(w, p.x, p.y, 90, '#d7263d', 0.35, 4);
      }
      w.pendingLevelUps = Math.max(0, w.pendingLevelUps - 1);
      if (w.pendingLevelUps > 0) { openLevelUp(); return; }
      ui.hideAll();
      ui.showHud(true);
      state = 'playing';
      w.timeScale = 0.5;
      ensureLoop();
    },
    onReroll() {
      if (!w || w.rerolls <= 0) return;
      w.rerolls--;
      audio.sfx('swoosh');
      openLevelUp();
    },
  });
}

function pauseGame() {
  if (state !== 'playing' || !w) return;
  state = 'paused';
  resetInput();
  audio.suspendAudio();
  ui.showPause(meta.settings, w, {
    onResume() {
      if (!w) return;
      ui.hideAll(); ui.showHud(true);
      audio.resumeAudio();
      state = 'playing';
      ensureLoop();
    },
    onQuit() {
      audio.resumeAudio();
      endRun();
    },
    onToggle(k) {
      meta.settings[k] = !meta.settings[k]; applySettings(meta.settings); save();
      if (w) pauseRefresh();
    },
  });
  render(w, 0);
}
function pauseRefresh() { state = 'playing'; pauseGame(); }

function endRun() {
  if (!w) { goTitle(); return; }
  audio.stopMusic();
  const ink = inkForRun(w.kills, w.page, w.bossesKilled);
  const newBest = w.page > meta.bestPage || w.score > meta.bestScore;
  meta.ink += ink;
  meta.bestPage = Math.max(meta.bestPage, w.page);
  meta.bestScore = Math.max(meta.bestScore, Math.floor(w.score));
  meta.bestTime = Math.max(meta.bestTime, Math.floor(w.time));
  meta.totalKills += w.kills;
  save();
  state = 'results';
  ui.showHud(false);
  ui.showResults({
    page: w.page, pageLabel: pageLabel(w.page), time: w.time, kills: w.kills, score: Math.floor(w.score),
    level: w.player.level, ink, bosses: w.bossesKilled, newBest, build: ownedSummary(w),
  }, { onContinue: goTitle });
}

// ------------------------------------------------------------------ loop

function stepSim(dt: number) {
  if (!w) return;
  w.time += dt;
  updatePlayer(w, dt);
  updateDirector(w, dt);
  updateEnemies(w, dt);
  updateWeapons(w, dt);
  updateBullets(w, dt);
  updateEnemyBullets(w, dt);
  updatePickups(w, dt);
}

function frame(now: number) {
  raf = 0;
  if (hidden) return;
  let realDt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;

  if (state === 'title' || state === 'menu' || state === 'results') {
    // low-power idle backdrop at ~30fps
    idleAcc += realDt; idleT += realDt;
    if (idleAcc >= 1 / 30) { idleAcc = 0; renderIdle(idleT); }
    raf = requestAnimationFrame(frame);
    return;
  }
  if (!w) return;

  if (state === 'playing' || state === 'dying') {
    // ease slow-mo back to 1
    w.timeScale = Math.min(1, w.timeScale + realDt * (state === 'dying' ? 0.3 : 1.6));
    if (w.hitstop > 0) {
      w.hitstop -= realDt;
    } else {
      // substep to keep collisions stable on slow frames
      const dt = realDt * w.timeScale;
      const steps = dt > 1 / 45 ? 2 : 1;
      for (let i = 0; i < steps; i++) stepSim(dt / steps);
    }
    fx.updateFx(w, realDt);
    // camera follow
    const p = w.player;
    const k = 1 - Math.exp(-realDt * 10);
    w.cam.x += (p.x - w.cam.x) * k;
    w.cam.y += (p.y - w.cam.y) * k;
    ui.updateHud(w);

    if (state === 'playing' && w.pendingLevelUps > 0 && p.alive) {
      levelUpDelay -= realDt;
      if (levelUpDelay <= 0) { levelUpDelay = 0; openLevelUp(); }
    }
    if (state === 'dying') {
      dyingTimer -= realDt;
      if (dyingTimer <= 0) { render(w, realDt); endRun(); return; }
    }
  }
  render(w, realDt);
  if (state === 'playing' || state === 'dying') raf = requestAnimationFrame(frame);
  else if (state === 'levelup') raf = requestAnimationFrame(frame); // keep fx animating behind cards
}

function ensureLoop() {
  if (raf || hidden) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ boot

function sizeCanvas() {
  const host = canvas.parentElement!;
  const r = host.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const v = resizeRender(r.width, r.height, dpr);
  if (w) { w.viewW = v.viewW; w.viewH = v.viewH; }
  if (w && state !== 'playing') render(w, 0);
}

export function boot() {
  lockDownPage();
  meta = loadSave();
  applySettings(meta.settings);
  canvas = document.getElementById('game') as HTMLCanvasElement;
  initRender(canvas);
  sizeCanvas();
  window.addEventListener('resize', sizeCanvas);
  window.visualViewport?.addEventListener('resize', sizeCanvas);
  initInput(document.getElementById('stage')!, () => {
    if (state === 'playing') pauseGame();
  });
  ui.initUI(document.getElementById('ui')!, () => pauseGame());
  // first gesture unlocks audio (iOS)
  const unlock = () => audio.unlockAudio();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('touchend', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  onVisibilityChange((h) => {
    if (h) {
      if (state === 'playing') pauseGame();
      hidden = true;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      audio.suspendAudio();
      save();
    } else {
      hidden = false;
      if (state !== 'paused') audio.resumeAudio();
      ensureLoop();
    }
  });
  // debug hook for automated verification (harmless in prod)
  (window as any).__errata = { get world() { return w; }, get state() { return state; }, events };
  goTitle();
}
