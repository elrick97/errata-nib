// OWNER: combat agent. Contract — keep signatures.
import type { World, Enemy } from '../types';
import { PALETTE } from '../types';
import { damageEnemy, clearEnemyBulletsInRadius } from './enemies';
import * as fx from './fx';
import { getSprite } from './render';

const scratch: Enemy[] = [];

// ink trail ring buffer (module-level, no allocation)
const TRAIL_N = 14;
const trX = new Float32Array(TRAIL_N);
const trY = new Float32Array(TRAIL_N);
const trT = new Float32Array(TRAIL_N).fill(99); // age
let trHead = 0;

export function updatePlayer(w: World, dt: number): void {
  const p = w.player;
  const st = w.stats;
  for (let i = 0; i < TRAIL_N; i++) trT[i] += dt;
  if (!p.alive) { p.vx = 0; p.vy = 0; p.moving = false; return; }

  let mx = w.input.mx, my = w.input.my;
  const ml = Math.sqrt(mx * mx + my * my);
  if (ml > 1) { mx /= ml; my /= ml; }
  const hasInput = ml > 0.05;
  const tx = hasInput ? mx * st.moveSpeed : 0;
  const ty = hasInput ? my * st.moveSpeed : 0;
  const k = Math.min(1, dt / (hasInput ? 0.08 : 0.1));
  p.vx += (tx - p.vx) * k;
  p.vy += (ty - p.vy) * k;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const sp2 = p.vx * p.vx + p.vy * p.vy;
  p.moving = sp2 > 400;
  if (hasInput && sp2 > 100) p.facing = Math.atan2(p.vy, p.vx);

  if (st.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + st.regen * dt);
  if (p.iframes > 0) p.iframes -= dt;
  if (p.hurtFlash > 0) p.hurtFlash -= dt;

  // ink trail drops
  if (p.moving) {
    p.trail += dt;
    if (p.trail >= 0.045) {
      p.trail = 0;
      const a = p.facing + Math.PI;
      trX[trHead] = p.x + Math.cos(a) * p.r * 0.9 + (w.rng.next() - 0.5) * 4;
      trY[trHead] = p.y + Math.sin(a) * p.r * 0.9 + (w.rng.next() - 0.5) * 4;
      trT[trHead] = 0;
      trHead = (trHead + 1) % TRAIL_N;
    }
  }
}

export function hurtPlayer(w: World, dmg: number): void {
  const p = w.player;
  if (!p.alive || p.iframes > 0) return;
  const d = Math.max(1, Math.round(dmg * w.stats.dmgTaken - w.stats.armor));
  p.hp -= d;
  p.iframes = 0.5;
  p.hurtFlash = 0.25;
  fx.burst(w, p.x, p.y, PALETTE.red, 14, 220, 3);
  fx.shake(w, 6);
  fx.flash(w, '#d7263d', 0.18);
  fx.dmgNumber(w, p.x, p.y - 14, d, false);
  w.events.sfx('hurt');
  if (p.hp <= 0) {
    if (p.revives > 0) {
      p.revives--;
      p.hp = p.maxHp;
      p.iframes = 2;
      fx.ring(w, p.x, p.y, 300, '#ffffff', 0.7, 14);
      fx.ring(w, p.x, p.y, 200, PALETTE.gold, 0.5, 8);
      fx.burst(w, p.x, p.y, '#ffffff', 40, 420, 5);
      fx.floatText(w, p.x, p.y - 34, 'Ctrl+Z!', PALETTE.gold, 26);
      fx.flash(w, '#ffffff', 0.7);
      fx.shake(w, 14);
      w.events.sfx('legendary');
      const n = w.grid.query(p.x, p.y, 300, scratch);
      for (let i = 0; i < n; i++) {
        const e = scratch[i];
        if (!e.active) continue;
        const dx = e.x - p.x, dy = e.y - p.y;
        const rr = 300 + e.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        // bosses take a big chunk instead of an instant kill
        damageEnemy(w, e, e.boss ? e.maxHp * 0.25 : 9999, false, dx * 2, dy * 2);
      }
      clearEnemyBulletsInRadius(w, p.x, p.y, 320);
    } else {
      p.hp = 0;
      p.alive = false;
      w.events.playerHurt(d);
      w.events.playerDeath();
      return;
    }
  }
  w.events.playerHurt(d);
}

export function healPlayer(w: World, amount: number): void {
  const p = w.player;
  if (!p.alive) return;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + amount);
  const got = Math.round(p.hp - before);
  if (got > 0) fx.floatText(w, p.x, p.y - 20, '+' + got, PALETTE.green, 14);
}

function nibSprite(): HTMLCanvasElement {
  return getSprite('nib_body', 64, 40, (c) => {
    c.lineJoin = 'round';
    c.lineCap = 'round';
    // body: tail at left, tip at right
    c.beginPath();
    c.moveTo(62, 20);
    c.bezierCurveTo(50, 17, 42, 4, 22, 5);
    c.lineTo(9, 9);
    c.quadraticCurveTo(3, 20, 9, 31);
    c.lineTo(22, 35);
    c.bezierCurveTo(42, 36, 50, 23, 62, 20);
    c.closePath();
    c.fillStyle = PALETTE.red;
    c.fill();
    c.lineWidth = 2.4;
    c.strokeStyle = PALETTE.redDark;
    c.stroke();
    // slit
    c.beginPath();
    c.moveTo(61, 20);
    c.lineTo(30, 20);
    c.lineWidth = 1.6;
    c.strokeStyle = '#4a0a14';
    c.stroke();
    // breather hole
    c.beginPath();
    c.arc(28, 20, 3.4, 0, Math.PI * 2);
    c.fillStyle = '#f3ead6';
    c.fill();
    c.lineWidth = 1.4;
    c.strokeStyle = '#4a0a14';
    c.stroke();
    // highlight
    c.beginPath();
    c.moveTo(16, 11);
    c.bezierCurveTo(26, 9, 38, 11, 48, 16);
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.stroke();
  });
}

export function renderPlayer(ctx: CanvasRenderingContext2D, w: World): void {
  const p = w.player;
  // ink trail
  ctx.fillStyle = PALETTE.red;
  for (let i = 0; i < TRAIL_N; i++) {
    const a = trT[i];
    if (a > 0.55) continue;
    const f = 1 - a / 0.55;
    ctx.globalAlpha = f * 0.7;
    ctx.beginPath();
    ctx.arc(trX[i], trY[i], 1 + f * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (!p.alive) return;

  // shadow
  ctx.fillStyle = 'rgba(40,30,20,0.2)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + p.r * 0.9, p.r * 0.95, p.r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();

  if (p.iframes > 0 && Math.floor(w.time * 20) % 2 === 0) return; // blink

  const bob = p.moving ? Math.sin(w.time * 20) * 1.4 : Math.sin(w.time * 3) * 0.6;
  const len = p.r * 2.2 * (64 / 56);
  const hgt = len * (40 / 64);
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  ctx.rotate(p.facing);
  if (p.hurtFlash > 0) {
    ctx.globalAlpha = Math.min(1, p.hurtFlash * 4) * 0.8;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, p.r * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(nibSprite(), -len * 0.5, -hgt * 0.5, len, hgt);
  ctx.restore();
}
