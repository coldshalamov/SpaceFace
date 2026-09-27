import * as THREE from 'three';
import { SweptSurfaceBatch } from '../forceLanguage/sweptSurfaceBatch.js';
import { ActionPrimitiveComposer } from '../vfx/actionPrimitives.js';
import { SURFACE_ROLE } from '../forceLanguage/weaponDischargePool.js';
import { weaponEffectSeed } from './energyBoltPool.js';

const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const smooth = n => { const t = clamp(n); return t * t * (3 - 2 * t); };
const RECIPES = Object.freeze({
  'siege-lance': Object.freeze({ color: new THREE.Color('#efac63'), life: 1.65 }),
  railgun: Object.freeze({ color: new THREE.Color('#a1bdcc'), life: 1.12 }),
  'thermal-bolt': Object.freeze({ color: new THREE.Color('#ed762b'), life: 2.05 }),
  disruptor: Object.freeze({ color: new THREE.Color('#b291ed'), life: .94 }),
  'concussion-slug': Object.freeze({ color: new THREE.Color('#8dbed0'), life: 1.18 }),
  missile: Object.freeze({ color: new THREE.Color('#e99345'), life: 1.28 }),
  torpedo: Object.freeze({ color: new THREE.Color('#eeb575'), life: 1.85 }),
});

/** Local consequences of a received hit, never another beam or damage owner. */
export class HeavyImpactVfx {
  constructor(scene, { capacity = 24 } = {}) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.batch = new SweptSurfaceBatch(scene, { capacity: this.capacity * 12,
      name: 'SF_HeavyWeaponContactMatter', fieldVolume: true });
    this.mesh = this.batch.mesh;
    this.composer = new ActionPrimitiveComposer(this.batch, null);
    this.slots = Array.from({ length: this.capacity }, () => ({ alive: false }));
    this.drawSlot = { y: 0, born: 0, seed: 0, recipe: null };
    this.time = 0; this.serial = 0; this.live = 0; this.dirty = false; this.disposed = false;
  }

  spawn(variant, captured, payload, targetRadius, now = this.time) {
    const recipe = RECIPES[variant];
    if (!recipe || this.disposed) return false;
    if (now < this.time) this.clear();
    this.time = now;
    let slot = null;
    for (const s of this.slots) if (!s.alive) { slot = s; break; }
    if (!slot) return true; // Admission remains bounded; never restore the generic flash.
    const nx = captured.nx, nz = captured.nz;
    const wnx = finite(payload.normal?.x, nx), wnz = finite(payload.normal?.z, nz);
    const ax = finite(payload.approach?.x, -wnx), az = finite(payload.approach?.z, -wnz);
    const slant = Math.atan2(ax * wnz - az * wnx, Math.max(.25, -(ax * wnx + az * wnz)));
    Object.assign(slot, { alive: true, variant, recipe, born: now, life: recipe.life,
      role: SURFACE_ROLE.IMPACT, targetId: payload.targetId ?? null, attached: captured.attached,
      x: captured.x, y: captured.y, z: captured.z, angle: Math.atan2(nz, nx),
      pitch: Math.atan2(captured.ny, Math.hypot(nx, nz)), slant,
      radius: clamp(Math.sqrt(Math.max(1, targetRadius)) * 1.55, 3.2, 8.5),
      seed: weaponEffectSeed((payload.projectileId ?? payload.id ?? payload.targetId ?? 0) + ':' + this.serial++),
    });
    this.live++; this.dirty = true;
    return true;
  }

  update(now, resolvePose, profile) {
    if (this.disposed) return;
    if (now < this.time) { this.clear(); this.time = now; return; }
    if (!this.live && !this.dirty) { this.time = now; return; }
    if (now === this.time && !this.dirty) return;
    this.time = now;
    const reduced = profile?.id === 'reduced-motion' || profile?.id === 'reduced-motion-and-flash';
    const flash = (profile?.flashOpacityScale ?? 1) < 1;
    this.batch.begin(now, reduced, flash);
    for (const s of this.slots) {
      if (!s.alive) continue;
      const age = now - s.born, pose = resolvePose(s);
      if (age >= s.life || !pose) { s.alive = false; this.live--; continue; }
      this.drawSlot.y = pose.y; this.drawSlot.born = s.born;
      this.drawSlot.seed = s.seed; this.drawSlot.recipe = s.recipe;
      this.composer.slot = this.drawSlot;
      this._render(s, pose, age, reduced, profile?.flashOpacityScale ?? 1);
    }
    this.batch.end(); this.dirty = false;
  }

  _render(s, p, age, reduced, flash) {
    const c = this.composer, r = s.radius, a = Math.atan2(p.az, p.ax);
    const x = p.x, z = p.z, phase = s.seed * Math.PI * 2;
    const t = age / s.life, motion = age * (reduced ? .24 : 1);
    const alpha = smooth(age / .035) * (1 - smooth((t - .66) / .34)) * flash;
    const cutoff = smooth((t - .35) / .63) * 1.15 - .1;
    const heat = 1 - smooth((t - .16) / .7);
    if (s.variant === 'siege-lance') {
      // The captured slug bores locally, then the two cut lips vent at unequal times.
      // This never connects back to a muzzle or claims a beam is still applying damage.
      c.piece(2, x, z, a, -r * .62, r * .12, r * .24, r * .22, r * .08, 0, 0,
        phase, alpha * .85, clamp(age / .11), cutoff, .42 + heat * .65);
      for (let i = 0; i < 3; i++) {
        const delay = .065 + i * .085, open = smooth((age - delay) / .12), side = i % 2 ? -1 : 1;
        const shear = (1 - Math.exp(-motion * (2.1 + i * .7))) * r * .35;
        c.piece(1, x, z, a + side * (.32 + i * .13) + s.slant * .24,
          r * .02, r * (1.15 + i * .25), r * (.26 - i * .035), r * (.35 - i * .04),
          side * r * .30, side * shear, 0, phase + i * 1.9,
          alpha * open * .80, clamp((age - delay) / .20), cutoff + i * .10, heat * .95);
      }
      for (let side = -1; side <= 1; side += 2) c.piece(3, x, z, a,
        -r * .55, r * .16, r * .18, r * .09, 0, side * r * .29, 0,
        phase + side, alpha * .75, clamp(age / .18), cutoff * .7, heat * .35);
    } else if (s.variant === 'railgun') {
      // One narrow hot gouge follows penetration; material travels back out along the
      // received normal. The ejecta separates before the gouge has finished cooling.
      c.piece(3, x, z, a + s.slant * .42, -r * .80, r * .25, r * .14, r * .06, 0, 0, 0,
        phase, alpha, clamp(age / .06), cutoff * .8, heat * .65);
      for (let i = 0; i < 4; i++) {
        const local = Math.max(0, motion - i * .026), travel = (1 - Math.exp(-local * (5 + i))) * r;
        const heading = a + (i - 1.5) * .16 + s.slant * .35;
        const rx = x + Math.cos(heading) * travel, rz = z + Math.sin(heading) * travel;
        const shed = smooth((age - i * .026) / .025) * (1 - smooth((age - .17 - i * .035) / .38));
        c.piece(6, rx, rz, heading, 0, r * (.38 + i * .11), r * .055, r * .10,
          (i - 1.5) * r * .06, 0, 0, phase + i, alpha * shed, 1, -.1, heat * .45);
      }
      c.piece(1, x, z, a, 0, r * 1.8, r * .17, r * .16, r * .10, 0, 0,
        phase + 3, alpha * (1 - smooth((age - .06) / .24)), clamp(age / .045), cutoff, heat * .75);
    } else if (s.variant === 'thermal-bolt') {
      // Molten material deposits at three unequal seats, swells locally and sheds rolled
      // discharge. Later, a cooling front crosses each deposit instead of shrinking it.
      for (let i = 0; i < 3; i++) {
        const delay = i * .08, feed = clamp((age - delay) / (.19 + i * .05));
        const side = (i - 1) * r * .31;
        c.piece(3, x, z, a + Math.PI / 2, -r * (.50 - i * .08), r * (.42 + i * .05),
          r * (.32 - i * .045), r * (.13 + i * .025), 0, side, 0, phase + i * 2,
          alpha * smooth(feed), feed, cutoff + i * .07, heat * .72);
      }
      for (let i = 0; i < 2; i++) {
        const delay = .10 + i * .17, flow = smooth((age - delay) / .20);
        const peel = (1 - Math.exp(-motion * (1.6 + i))) * r * .32;
        c.piece(1, x, z, a + (i ? -.58 : .44), 0, r * (1.00 + i * .38), r * .32, r * .34,
          r * (i ? -.32 : .4), peel * (i ? -1 : 1), 0, phase + 4 + i,
          alpha * flow * .70, clamp((age - delay) / .25), cutoff + i * .11, heat * .90);
      }
    } else if (s.variant === 'disruptor') {
      // Received current crawls from the contact across the nearby surface in unequal
      // branches. These are local induction paths, never invented links to other targets.
      for (let i = 0; i < 3; i++) {
        const side = i % 2 ? -1 : 1, onset = smooth((age - i * .055) / .09);
        const h = a + Math.PI / 2 + side * (.23 + i * .18);
        c.piece(5, x, z, h, -r * .12, r * (.55 + i * .28), r * .12, r * .17,
          side * r * .25, side * r * .10, 0, phase + i * 1.8, alpha * onset,
          clamp((age - i * .055) / .15), cutoff + i * .12, heat * .80);
      }
      c.piece(3, x, z, a, -r * .22, r * .2, r * .25, r * .10, 0, 0, 0,
        phase, alpha * .6, clamp(age / .07), cutoff, heat * .5);
    } else if (s.variant === 'concussion-slug') {
      // Compression bends one substantial front away from the hit; its two shoulders
      // travel at different rates and peel. No concentric all-direction shock rings.
      for (let i = 0; i < 3; i++) {
        const delay = i * .05, local = Math.max(0, motion - delay);
        const reach = r * (.20 + (1 - Math.exp(-local * (3.5 + i))) * (1.05 + i * .28));
        c.piece(4, x, z, a + (i - 1) * .22 + s.slant * .2,
          -.62 + i * .08, .73 - i * .06, r * .24, r * .38, 0, 0, reach,
          phase + i * 2.2, alpha * smooth((age - delay) / .07), 1, cutoff + i * .10, heat * .78);
      }
      c.piece(3, x, z, a + Math.PI / 2, -r * .5, r * .5, r * .17, r * .12, 0, 0, 0,
        phase, alpha * .65, clamp(age / .045), cutoff, heat * .45);
    } else {
      // A nonlethal warhead still displaces material at the received contact. Torpedo
      // carries a delayed second vent; this does not start a ship-destruction lifecycle.
      const heavy = s.variant === 'torpedo', count = heavy ? 5 : 3;
      for (let i = 0; i < count; i++) {
        const delay = i * (heavy ? .075 : .035), side = i % 2 ? -1 : 1;
        const local = Math.max(0, motion - delay), drift = (1 - Math.exp(-local * 3.8)) * r * .35;
        const h = a + side * (.25 + i * .19) + s.slant * .2;
        c.piece(1, x + Math.cos(h) * drift, z + Math.sin(h) * drift, h,
          0, r * (.9 + i * .16), r * (.29 - i * .022), r * (.34 - i * .018),
          side * r * .27, 0, 0, phase + i * 1.7, alpha * smooth((age - delay) / .06) * .85,
          clamp((age - delay) / .13), cutoff + i * .08, heat * .80);
      }
      c.piece(4, x, z, a, -.74, .60, r * .20, r * .33, 0, 0,
        r * (.18 + (1 - Math.exp(-motion * 5)) * .9), phase + 2,
        alpha * (1 - smooth((age - .12) / .4)), 1, cutoff, heat * .65);
      c.piece(3, x, z, a, -r * .34, r * .22, r * .30, r * .10, 0, 0, 0,
        phase, alpha * .64, clamp(age / .12), cutoff * .8, heat * .3);
    }
  }

  reproject(dx, dz) {
    for (const s of this.slots) if (s.alive && !s.attached) { s.x += dx; s.z += dz; }
    this.batch.reproject(dx, dz);
    if (this.live) this.dirty = true;
  }
  clear() {
    for (const s of this.slots) s.alive = false;
    this.live = 0; this.dirty = false; this.batch.begin(this.time); this.batch.end();
  }
  dispose() { if (this.disposed) return; this.clear(); this.disposed = true; this.batch.dispose(); }
}
