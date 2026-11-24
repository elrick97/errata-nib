// OWNER: ui agent. Contract — keep signatures.
import type { MetaSave, Settings, World } from '../types';
import type { UpgradeChoice } from '../game/upgrades';
import { ownedSummary } from '../game/upgrades';
import type { ShopItem } from '../game/meta';
import { pageLabel } from '../game/director';

export interface RunSummary {
  page: number; pageLabel: string; time: number; kills: number; score: number; level: number;
  ink: number; bosses: number; newBest: boolean;
  build: { icon: string; level: number; evolved: boolean; name: string }[];
}

let hud: HTMLElement, screen: HTMLElement, bannerL: HTMLElement, toastL: HTMLElement;
let token = 0; // invalidates timers/handlers of a previous screen

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
function el(tag: string, cls = '', html = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
function btn(label: string, cls: string, fn: () => void): HTMLButtonElement {
  const b = el('button', 'btn ' + cls, label) as HTMLButtonElement;
  b.type = 'button';
  b.addEventListener('click', fn);
  return b;
}
function layer(id: string): HTMLElement {
  const d = el('div', 'ui-layer');
  d.id = id;
  return d;
}
function mmss(t: number): string {
  const s = Math.max(0, Math.floor(t));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function fmt(n: number): string { return Math.floor(n).toLocaleString('en-US'); }

/** Replace modal content. Returns the new root. */
function open(cls: string): HTMLElement {
  token++;
  screen.textContent = '';
  const s = el('div', 'scr ' + cls);
  s.setAttribute('data-noinput', '');
  screen.appendChild(s);
  screen.classList.add('on');
  return s;
}
function scrollEl(): HTMLElement {
  const s = el('div', 'scroll');
  s.setAttribute('data-scroll', '');
  s.setAttribute('data-noinput', '');
  return s;
}
function toggleBtn(label: string, on: boolean, fn: () => void, note = ''): HTMLButtonElement {
  const b = el('button', 'tog' + (on ? ' on' : ''),
    `<span>${esc(label)}${note ? `<small>${esc(note)}</small>` : ''}</span><span class="sw"></span>`) as HTMLButtonElement;
  b.type = 'button';
  b.addEventListener('click', fn);
  return b;
}
function confirmBtn(label: string, armedLabel: string, cls: string, fn: () => void): HTMLButtonElement {
  let armed = false, timer = 0;
  const b = btn(label, cls, () => {
    if (!armed) {
      armed = true; b.textContent = armedLabel; b.classList.add('warn');
      timer = window.setTimeout(() => { armed = false; b.textContent = label; b.classList.remove('warn'); }, 2500);
    } else { clearTimeout(timer); fn(); }
  });
  return b;
}

// ------------------------------------------------------------------ init
export function initUI(root: HTMLElement, onPause: () => void): void {
  root.textContent = '';
  hud = layer('ui-hud'); screen = layer('ui-screen'); bannerL = layer('ui-banner'); toastL = layer('ui-toast');
  hud.classList.add('hide');
  hud.innerHTML = `
    <div class="hud-top">
      <div class="hud-main">
        <div class="bar hp"><i></i><b>0/0</b></div>
        <div class="bar xp"><i></i></div>
        <div class="hud-info"><span class="lvl">Lv 1</span><span class="pg"></span><span class="kills"><span class="xk"></span><span class="kn">0</span></span></div>
      </div>
      <button class="pause" type="button" data-noinput aria-label="Pause">❚❚</button>
    </div>
    <div class="bossbar hide"><div class="bn"></div><div class="bar boss"><i></i></div></div>`;
  hud.querySelector('.pause')!.addEventListener('click', onPause);
  root.append(hud, screen, bannerL, toastL);
  cache.hp = cache.max = cache.xp = cache.lv = cache.kills = cache.sec = -1;
  cache.page = ''; cache.boss = -1; cache.bossName = '';
  const q = (s: string) => hud.querySelector(s) as HTMLElement;
  hpFill = q('.hp i'); hpTxt = q('.hp b'); xpFill = q('.xp i'); lvEl = q('.lvl'); pgEl = q('.pg'); knEl = q('.kn');
  bossBox = q('.bossbar'); bossName = q('.bn'); bossFill = q('.boss i');
}

export function hideAll(): void {
  token++;
  screen.classList.remove('on');
  screen.textContent = '';
}

// ------------------------------------------------------------------ title
export function showTitle(meta: MetaSave, h: { onStart(): void; onShop(): void; onSettings(): void }): void {
  const s = open('title');
  s.innerHTML = `
    <h1 class="logo">ERRATA<span class="strike"></span><span class="fix">ERRATA</span></h1>
    <div class="sub">The Last Proofreader</div>
    <div class="stats">
      <span class="chip">Best page ${fmt(meta.bestPage)}</span>
      <span class="chip"><span class="drop"></span>${fmt(meta.ink)} ink</span>
      <span class="chip">${fmt(meta.runs)} runs</span>
    </div>`;
  s.append(
    btn('Begin Editing', 'primary big', h.onStart),
    btn('Inkwell', 'wide', h.onShop),
    btn('Settings', 'wide', h.onSettings),
    el('div', 'hint', 'Drag anywhere to move · your pen writes by itself'),
    el('div', 'small', 'v1 · offline'));
}

// ------------------------------------------------------------------ shop
export function showShop(meta: MetaSave, items: ShopItem[], h: { onBuy(id: string): void; onBack(): void }): void {
  const prev = screen.querySelector('[data-scroll]') as HTMLElement | null;
  const keep = prev ? prev.scrollTop : 0;
  const s = open('shop');
  s.append(el('div', 'hdr', `<h2>Inkwell</h2><span class="bal"><span class="drop"></span>${fmt(meta.ink)}</span>`));
  const list = scrollEl();
  for (const it of items) {
    const lv = meta.shop[it.id] || 0;
    const maxed = lv >= it.maxLevel;
    const cost = maxed ? 0 : it.cost(lv);
    const row = el('div', 'item',
      `<div class="ico">${esc(it.icon)}</div><div class="mid"><div class="nm">${esc(it.name)}</div><div class="ds">${esc(it.desc)}</div>` +
      `<div class="pips">${'●'.repeat(lv)}${'○'.repeat(Math.max(0, it.maxLevel - lv))}</div></div>`);
    const b = btn(maxed ? 'MAX' : String(cost), 'primary', () => h.onBuy(it.id));
    if (!maxed) b.innerHTML = `<span class="drop" style="background:#fffaf0"></span>${cost}`;
    b.disabled = maxed || meta.ink < cost;
    row.appendChild(b);
    list.appendChild(row);
  }
  s.append(list, btn('Back', 'wide', h.onBack));
  list.scrollTop = keep;
}

// ------------------------------------------------------------------ settings
const SETTING_ROWS: [keyof Settings, string][] = [['sound', 'Sound'], ['music', 'Music'], ['haptics', 'Haptics'], ['shake', 'Screen shake']];
export function showSettings(s0: Settings, h: { onToggle(k: keyof Settings): void; onResetSave(): void; onBack(): void }): void {
  const s = open('settings');
  s.append(el('h2', '', 'Settings'));
  for (const [k, label] of SETTING_ROWS) {
    const note = k === 'haptics' && !('vibrate' in navigator) ? '(not supported on iPhone)' : '';
    s.append(toggleBtn(label, !!s0[k], () => h.onToggle(k), note));
  }
  s.append(
    confirmBtn('Erase progress', 'Tap again to erase everything', 'wide', h.onResetSave),
    btn('Back', 'primary wide', h.onBack));
}

// ------------------------------------------------------------------ level up
export function showLevelUp(choices: UpgradeChoice[], rerolls: number, h: { onPick(c: UpgradeChoice): void; onReroll(): void }): void {
  const s = open('dim');
  const my = token;
  let armed = false, done = false;
  s.append(el('h2', '', 'Margin Note!'));
  const cards = el('div', 'cards');
  choices.forEach((c, i) => {
    const evo = c.kind === 'evolution';
    const legend = c.rarity === 'legendary' || c.kind === 'legendary';
    const cls = evo ? 'evolution' : legend ? 'legendary' : c.rarity;
    const b = el('button', 'card ' + cls,
      `<div class="ico">${esc(c.icon)}</div><div class="body"><div class="nm">${esc(c.name)}</div>` +
      `<div class="meta"><span>${evo ? 'evolution' : esc(c.rarity)}</span>${c.isNew ? '<span class="badge">NEW</span>' : `<span class="badge lv">Lv ${c.level}</span>`}</div>` +
      `<div class="ds">${esc(c.desc)}</div></div>` +
      (evo ? '<span class="ribbon evo">EVOLUTION</span>' : legend ? '<span class="ribbon">LEGENDARY</span>' : '')) as HTMLButtonElement;
    b.type = 'button';
    b.style.animationDelay = `${i * 60}ms${evo || legend ? ',0.5s' : ''}`;
    b.addEventListener('click', () => {
      if (!armed || done || my !== token) return;
      done = true;
      h.onPick(c);
    });
    cards.appendChild(b);
  });
  s.append(cards);
  if (rerolls > 0) {
    const r = btn(`↻ Reroll (${rerolls})`, 'wide', () => {
      if (!armed || done || my !== token) return;
      done = true;
      h.onReroll();
    });
    s.append(r);
  }
  setTimeout(() => { if (my === token) { armed = true; cards.classList.add('armed'); } }, 400);
}

// ------------------------------------------------------------------ pause
export function showPause(s0: Settings, w: World, h: { onResume(): void; onQuit(): void; onToggle(k: keyof Settings): void }): void {
  const s = open('paused');
  s.append(el('h2', '', 'Paused'), el('div', 'small', `${esc(pageLabel(w.page))} · ${mmss(w.time)}`));
  const list = scrollEl();
  let items: { icon: string; level: number; evolved: boolean; name: string }[] = [];
  try { items = ownedSummary(w); } catch { /* stub */ }
  const b = el('div', 'build');
  if (items.length) {
    for (const it of items) {
      b.append(el('div', 'bi' + (it.evolved ? ' evo' : ''), `${esc(it.icon)}<small>${esc(it.name)} ${it.level}</small>`));
    }
  } else {
    for (const wp of w.weapons) b.append(el('div', 'bi' + (wp.evolved ? ' evo' : ''), `✎<small>${esc(wp.id)} ${wp.level}</small>`));
    for (const id of Object.keys(w.passives)) b.append(el('div', 'bi', `✦<small>${esc(id)} ${w.passives[id]}</small>`));
  }
  for (const id of w.legendaries) b.append(el('div', 'bi leg', `★<small>${esc(id)}</small>`));
  list.append(b);
  for (const [k, label] of SETTING_ROWS.slice(0, 2)) list.append(toggleBtn(label, !!s0[k], () => h.onToggle(k)));
  s.append(list,
    btn('Resume', 'primary big', h.onResume),
    confirmBtn('Quit run', 'Tap again to abandon', 'wide', h.onQuit));
}

// ------------------------------------------------------------------ results
export function showResults(sum: RunSummary, h: { onContinue(): void }): void {
  const s = open('results');
  s.append(el('h2', '', sum.newBest ? 'Final Draft' : 'The End?'));
  const cell = (v: string, l: string) => `<div class="cell"><b>${esc(v)}</b><span>${l}</span></div>`;
  s.append(el('div', 'grid',
    cell(sum.pageLabel, 'Page') + cell(mmss(sum.time), 'Time') + cell(fmt(sum.kills), 'Kills') +
    cell(String(sum.level), 'Level') + cell(fmt(sum.score), 'Score') + cell(String(sum.bosses), 'Bosses')));
  const ink = el('div', 'inkbig', '<span class="drop"></span><span class="n">0</span>');
  s.append(ink);
  const n = ink.querySelector('.n') as HTMLElement;
  const my = token, t0 = performance.now(), dur = 1000;
  const tick = (now: number) => {
    if (my !== token) return;
    const p = Math.min(1, (now - t0) / dur);
    n.textContent = '+' + fmt(sum.ink * (1 - (1 - p) * (1 - p)));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  if (sum.newBest) s.append(el('div', 'stamp', 'NEW RECORD!'));
  const b = el('div', 'build');
  for (const it of sum.build) b.append(el('div', 'bi' + (it.evolved ? ' evo' : ''), `${esc(it.icon)}<small>${it.level}</small>`));
  s.append(b, btn('Continue', 'primary big', h.onContinue));
}

// ------------------------------------------------------------------ HUD
let hpFill: HTMLElement, hpTxt: HTMLElement, xpFill: HTMLElement, lvEl: HTMLElement, pgEl: HTMLElement, knEl: HTMLElement;
let bossBox: HTMLElement, bossName: HTMLElement, bossFill: HTMLElement;
const cache = { hp: -1, max: -1, xp: -1, lv: -1, kills: -1, sec: -1, page: '', boss: -1, bossName: '' };

export function showHud(on: boolean): void {
  hud.classList.toggle('hide', !on);
  if (on) { cache.hp = cache.max = cache.xp = cache.lv = cache.kills = cache.sec = -1; cache.page = ''; cache.boss = -2; cache.bossName = ''; }
}

export function updateHud(w: World): void {
  const p = w.player;
  const hp = Math.max(0, Math.ceil(p.hp)), max = Math.ceil(p.maxHp);
  if (hp !== cache.hp || max !== cache.max) {
    cache.hp = hp; cache.max = max;
    hpFill.style.transform = `scaleX(${max > 0 ? Math.min(1, hp / max) : 0})`;
    hpTxt.textContent = hp + '/' + max;
  }
  const xr = Math.round(Math.min(1, Math.max(0, p.xp / (p.xpNext || 1))) * 200);
  if (xr !== cache.xp) { cache.xp = xr; xpFill.style.transform = `scaleX(${xr / 200})`; }
  if (p.level !== cache.lv) { cache.lv = p.level; lvEl.textContent = 'Lv ' + p.level; }
  if (w.kills !== cache.kills) { cache.kills = w.kills; knEl.textContent = String(w.kills); }

  const boss = w.boss && w.boss.active ? w.boss : null;
  const sec = Math.floor(boss ? w.time : w.pageTime);
  const label = boss ? 'Boss Edit' : pageLabel(w.page);
  if (sec !== cache.sec || label !== cache.page) {
    cache.sec = sec; cache.page = label;
    pgEl.textContent = `${label} · ${mmss(sec)}`;
  }
  const br = boss ? Math.round(Math.max(0, Math.min(1, boss.hp / (boss.maxHp || 1))) * 200) : -1;
  if (br !== cache.boss) {
    if ((br < 0) !== (cache.boss < 0)) bossBox.classList.toggle('hide', br < 0);
    cache.boss = br;
    if (br >= 0) bossFill.style.transform = `scaleX(${br / 200})`;
  }
  if (boss && w.bossName !== cache.bossName) { cache.bossName = w.bossName; bossName.textContent = w.bossName; }
}

// ------------------------------------------------------------------ banners & toasts
function transient(parent: HTMLElement, e: HTMLElement, ms: number): void {
  parent.appendChild(e);
  setTimeout(() => e.remove(), ms);
}
export function pageBanner(label: string): void {
  transient(bannerL, el('div', 'pbn', esc(label)), 1950);
}
export function bossBanner(name: string, sub: string): void {
  transient(bannerL, el('div', 'bbn', `<div class="n">${esc(name)}</div><div class="s">${esc(sub)}</div>`), 2250);
}
export function toast(text: string, color?: string): void {
  const t = el('div', 'toast', esc(text));
  if (color) { t.style.borderColor = color; t.style.color = color === '#ffe14d' ? '#1b1a22' : color; }
  transient(toastL, t, 1850);
}
