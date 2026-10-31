import { TABLE_HEARING_FAR_WU, tableDoctrineTellCueWu } from '../tabletopPolicy.js';

// Doctrine tell presentation methods run on the owning VFX instance. Pool allocation, event
// registration, and update scheduling remain in vfx.js.
export function createDoctrineTellMethods({
  DOCTRINE_TELL_KIND,
  DOCTRINE_TELL_MIN_LIFE,
  DOCTRINE_TELL_POOL,
  DOCTRINE_TELL_PULSE,
  SPR_FLASH,
  SPR_FRESNEL,
  SPR_PUFF,
  SPR_RING,
  random,
}) {
  return {
    // AI telegraph / flee / formation break markers (spec2/02 §3 + M1 doctrine tells).
    // Doctrine telegraphs are enemy-linked (or truthful offscreen direction) and sustain for the
    // full pre-consequence window (default ≥30 sim ticks). Sim owns the hold-fire gate; VFX only
    // presents — never writes sim state, never uses wall-clock for lifetime.
    // Lifetime: state.tick / startTick / deadlineTick so pause/tab render frames cannot burn the window.
    _onAiTelegraph(p) {
      this._emitJuiceCue('ai.telegraph', p, 1);
      if (!this._scene) return;
      if (p && (p.kind === 'engine_flare' || p.kind === 'attach_spool' || p.kind === 'weapon_charge')) return;
      this._beginDoctrineTell(p || {});
    },

    _classifyDoctrineTell(p) {
      const kind = String((p && p.kind) || '');
      const doctrineId = String((p && p.doctrineId) || '');
      if (kind === 'engine_flare' || doctrineId === 'interceptor_flyby') return DOCTRINE_TELL_KIND.FLYBY;
      if (kind === 'attach_spool' || doctrineId === 'tether_control_raider') return DOCTRINE_TELL_KIND.TETHER;
      if (kind === 'weapon_charge' || doctrineId === 'ranged_disengager') return DOCTRINE_TELL_KIND.CHARGE;
      if (kind === 'detonator_fuse' || doctrineId === 'detonator_run') return DOCTRINE_TELL_KIND.DETONATOR;
      return DOCTRINE_TELL_KIND.GENERIC;
    },

    _doctrineTellStyle(tellKind, reduced) {
      // Locked palette tokens (spec2/00 §3). Reduced-motion/flash keeps shape+direction readable
      // with rings only, lower peak opacity, and no event lights.
      if (tellKind === DOCTRINE_TELL_KIND.FLYBY) {
        return {
          color0: '#ff5c5c', color1: '#ffb35c', light: '#ff7040',
          coreOp: reduced ? 0.55 : 0.78, ringOp: reduced ? 0.48 : 0.62,
          linkOp: reduced ? 0.42 : 0.55, useLight: !reduced,
        };
      }
      if (tellKind === DOCTRINE_TELL_KIND.TETHER) {
        return {
          color0: '#39d0ff', color1: '#d7e6ff', light: '#5fd7ff',
          coreOp: reduced ? 0.52 : 0.72, ringOp: reduced ? 0.46 : 0.58,
          linkOp: reduced ? 0.40 : 0.55, useLight: !reduced,
        };
      }
      if (tellKind === DOCTRINE_TELL_KIND.CHARGE) {
        return {
          color0: '#ffb35c', color1: '#ffffff', light: '#ffcc66',
          coreOp: reduced ? 0.55 : 0.80, ringOp: reduced ? 0.48 : 0.65,
          linkOp: reduced ? 0.42 : 0.58, useLight: !reduced,
        };
      }
      if (tellKind === DOCTRINE_TELL_KIND.DETONATOR) {
        // Fuse-lit kamikaze: hotter core than the CHARGE tell and a saturated danger link —
        // the line to the target IS the warning ("that fuse is burning toward YOU").
        return {
          color0: '#ff3b1f', color1: '#ffd23c', light: '#ff5030',
          coreOp: reduced ? 0.60 : 0.88, ringOp: reduced ? 0.52 : 0.70,
          linkOp: reduced ? 0.48 : 0.68, useLight: !reduced,
        };
      }
      return {
        color0: '#ffcc44', color1: '#ffb35c', light: '#ffcc44',
        coreOp: reduced ? 0.45 : 0.55, ringOp: reduced ? 0.40 : 0.55,
        linkOp: reduced ? 0.35 : 0.45, useLight: !reduced,
      };
    },

    _beginDoctrineTell(p) {
      const entityId = p.entityId;
      const targetId = p.targetId != null ? p.targetId : (this.state && this.state.playerId);
      const tellKind = this._classifyDoctrineTell(p);
      const durationTicks = Math.max(30, Math.floor(Number(p.durationTicks) || 30));
      // Prefer payload tick, else live sim tick; null → headless age/life fallback only.
      const startTick = Number.isInteger(p.tick) ? p.tick
        : (this.state && Number.isInteger(this.state.tick) ? this.state.tick : null);
      const deadlineTick = startTick != null ? startTick + durationTicks : null;
      // Frame-dt life is only used when tick is unavailable (headless / no sim clock).
      const life = Math.max(DOCTRINE_TELL_MIN_LIFE, durationTicks / 60);
      const reduced = this._isReduced();
      const enemy = this._ent(entityId);
      const offscreen = !this._doctrineTellOnScreen(enemy);

      // Prefer reusing a slot already tracking this entity; else free → LRU (soonest deadline / lowest life).
      let slot = null;
      const pool = this._doctrineTells;
      for (let i = 0; i < pool.length; i++) {
        if (pool[i].alive && pool[i].entityId === entityId) { slot = pool[i]; break; }
      }
      if (!slot) {
        for (let i = 0; i < pool.length; i++) {
          if (!pool[i].alive) { slot = pool[i]; break; }
        }
      }
      if (!slot) {
        let worst = pool[0];
        for (let i = 1; i < pool.length; i++) {
          const a = pool[i];
          const aRem = a.deadlineTick != null && Number.isInteger(this.state && this.state.tick)
            ? (a.deadlineTick - this.state.tick)
            : (a.life - a.age);
          const wRem = worst.deadlineTick != null && Number.isInteger(this.state && this.state.tick)
            ? (worst.deadlineTick - this.state.tick)
            : (worst.life - worst.age);
          if (aRem < wRem) worst = a;
        }
        slot = worst;
      }

      const wasAlive = slot.alive;
      slot.alive = true;
      slot.age = 0;
      slot.life = life;
      slot.pulse = 0;
      slot.entityId = entityId;
      slot.targetId = targetId;
      slot.kind = tellKind;
      slot.doctrineId = p.doctrineId || null;
      slot.telegraphKind = p.kind || null;
      slot.durationTicks = durationTicks;
      slot.startTick = startTick;
      slot.deadlineTick = deadlineTick;
      slot.offscreen = offscreen;
      slot.reduced = reduced;
      if (!wasAlive) this._doctrineTellActive = Math.min(DOCTRINE_TELL_POOL, (this._doctrineTellActive || 0) + 1);
      this._doctrineTellStarts = (this._doctrineTellStarts || 0) + 1;
      this._lastDoctrineTell = {
        kind: tellKind,
        telegraphKind: slot.telegraphKind,
        doctrineId: slot.doctrineId,
        entityId,
        targetId,
        durationTicks,
        life,
        startTick,
        deadlineTick,
        offscreen,
        reduced,
        tick: startTick,
      };

      this._spawnDoctrineTellPulse(slot, true);
    },

    _doctrineTellOnScreen(entity) {
      if (!entity || !entity.pos) return false;
      const camera = this.state && this.state.render && this.state.render.camera;
      const canProject = !!(
        camera
        && camera.isCamera
        && camera.projectionMatrix
        && typeof camera.updateMatrixWorld === 'function'
      );
      if (!canProject) {
        // Headless / no projectable camera: treat as on-screen if inside the live table.
        const pp = this._playerPos();
        const d = Math.hypot((entity.pos.x || 0) - (pp.x || 0), (entity.pos.z || 0) - (pp.z || 0));
        const tableWu = tableVfxDrawWuFromState(this.state);
        const limit = Number.isFinite(tableWu) && tableWu > 0 ? tableWu : TABLE_HEARING_FAR_WU;
        return d < limit;
      }
      const scratch = this._doctrineTellScreenScratch || this._trailScreenScratch;
      const local = this._toLocalXZ(
        Number.isFinite(entity.pos.x) ? entity.pos.x : 0,
        Number.isFinite(entity.pos.z) ? entity.pos.z : 0,
        this._entityLocalXZ,
      );
      scratch.set(local.x, 0, local.z);
      scratch.project(camera);
      const pad = 0.12;
      return scratch.x >= -1 - pad && scratch.x <= 1 + pad
        && scratch.y >= -1 - pad && scratch.y <= 1 + pad
        && scratch.z >= -1 && scratch.z <= 1;
    },

    _doctrineTellEndpoints(slot) {
      const enemy = this._ent(slot.entityId);
      const target = this._ent(slot.targetId) || this._ent(this.state && this.state.playerId);
      const player = this.helpers && this.helpers.player
        ? this.helpers.player()
        : this._ent(this.state && this.state.playerId);
      const enemyPos = enemy && enemy.pos ? enemy.pos : null;
      const targetPos = (target && target.pos) || (player && player.pos) || null;
      return { enemy, target, player, enemyPos, targetPos };
    },

    _spawnDoctrineTellPulse(slot, isStart) {
      if (!this._scene || !slot) return;
      const style = this._doctrineTellStyle(slot.kind, slot.reduced);
      const { enemy, enemyPos, targetPos, player } = this._doctrineTellEndpoints(slot);
      const onScreen = this._doctrineTellOnScreen(enemy);
      slot.offscreen = !onScreen;

      // Truthful offscreen directional cue near the player along the real enemy bearing.
      if (!onScreen || !enemyPos) {
        const origin = (player && player.pos) || targetPos || this._playerPos();
        if (!origin) return;
        let dx = 0;
        let dz = 1;
        if (enemyPos) {
          dx = (enemyPos.x || 0) - (origin.x || 0);
          dz = (enemyPos.z || 0) - (origin.z || 0);
        } else if (Number.isFinite(slot._lastDx) && Number.isFinite(slot._lastDz)) {
          dx = slot._lastDx;
          dz = slot._lastDz;
        }
        const len = Math.hypot(dx, dz) || 1;
        const ux = dx / len;
        const uz = dz / len;
        slot._lastDx = dx;
        slot._lastDz = dz;
        const cue = this._doctrineTellOffscreenPoint(origin, ux, uz);
        this._spawnDoctrineTellOffscreenCue(slot, style, cue.x, cue.z, ux, uz, isStart);
        return;
      }

      // On-screen: mark the live enemy and draw a contact link toward the actual target.
      const r = (enemy && enemy.radius) || 8;
      this._spawnDoctrineTellEnemyMark(slot, style, enemyPos.x, enemyPos.z, r, isStart);
      if (targetPos) {
        this._spawnDoctrineTellLink(slot, style, enemyPos.x, enemyPos.z, targetPos.x, targetPos.z, isStart);
      }
    },

    _spawnDoctrineTellEnemyMark(slot, style, x, z, r, isStart) {
      const reduced = slot.reduced;
      const life = reduced ? 0.38 : (isStart ? 0.48 : 0.28);
      const s0 = Math.max(4, r * 0.9);
      const s1 = Math.max(10, r * (slot.kind === DOCTRINE_TELL_KIND.CHARGE ? 3.2 : 2.6));
      // Rings carry the tell under reduced flash; full mode adds a core flash on start only.
      this._spawnSprite(SPR_RING, x, 0, z, life, s0, s1, style.ringOp, 0.0, style.color0, 0, 0);
      if (isStart && !reduced) {
        this._spawnSprite(SPR_FLASH, x, 0, z, 0.18, s0 * 0.55, s1 * 0.75, style.coreOp, 0.0, style.color1, 0, 0);
      } else if (isStart && reduced) {
        this._spawnSprite(SPR_RING, x, 0, z, 0.42, s0 * 0.7, s1 * 0.95, style.coreOp * 0.9, 0.0, style.color1, 0, 0);
      }
      if (slot.kind === DOCTRINE_TELL_KIND.FLYBY) {
        // Engine-flare twin rings trailing the intercept read.
        this._spawnSprite(SPR_RING, x, 0, z, life * 1.15, s0 * 0.55, s1 * 1.35, style.ringOp * 0.7, 0.0, style.color1, 0, 0);
      } else if (slot.kind === DOCTRINE_TELL_KIND.TETHER) {
        this._spawnSprite(SPR_FRESNEL, x, 0, z, life * 1.1, s0 * 0.8, s1 * 1.1, style.ringOp * 0.85, 0.0, style.color0, 0, 0);
      } else if (slot.kind === DOCTRINE_TELL_KIND.CHARGE) {
        this._spawnSprite(SPR_FLASH, x, 0, z, reduced ? 0.28 : 0.22, s0 * 0.4, s0 * 1.1, style.coreOp, 0.0, style.color1, 0, 0);
      }
      if (style.useLight && isStart) {
        this._eventLight({ x, z }, 'tell', {
          severity: reduced ? 'mark-calm' : 'mark',
          color: style.light,
        });
      }
    },

    _spawnDoctrineTellLink(slot, style, ax, az, bx, bz, isStart) {
      const dx = bx - ax;
      const dz = bz - az;
      const dist = Math.hypot(dx, dz) || 1;
      const ux = dx / dist;
      const uz = dz / dist;
      const reduced = slot.reduced;
      const segs = reduced ? 5 : (isStart ? 9 : 6);
      const burstMul = this._burst || 1;
      const n = Math.max(3, Math.round(segs * burstMul));
      this._c0.set(style.color0);
      this._c1.set(style.color1);

      // Contact-linked filament: samples the real segment so the tell cannot lie about who is aiming.
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        const px = ax + dx * t;
        const pz = az + dz * t;
        const drift = (random() - 0.5) * (reduced ? 2.5 : 5);
        const pxp = -uz * drift;
        const pzp = ux * drift;
        const sp = (reduced ? 4 : 8) + random() * (reduced ? 6 : 14);
        // Doctrine-shaped motion bias along the link.
        let vx = ux * sp * 0.35 + pxp * 0.4;
        let vz = uz * sp * 0.35 + pzp * 0.4;
        if (slot.kind === DOCTRINE_TELL_KIND.FLYBY) {
          vx = ux * sp * 1.4;
          vz = uz * sp * 1.4;
        } else if (slot.kind === DOCTRINE_TELL_KIND.TETHER) {
          vx = ux * sp * 0.25 + pxp;
          vz = uz * sp * 0.25 + pzp;
        } else if (slot.kind === DOCTRINE_TELL_KIND.CHARGE) {
          vx = ux * sp * 0.9;
          vz = uz * sp * 0.9;
        }
        this._spawnParticle(
          px + pxp * 0.2, pz + pzp * 0.2,
          vx, vz,
          (reduced ? 0.28 : 0.22) + random() * 0.12,
          slot.kind === DOCTRINE_TELL_KIND.CHARGE ? 2.2 : 1.6,
          0.15,
          this._c0, this._c1,
          2.2, 0, 0,
        );
      }

      // Midpoint accent so the link reads at a glance even when ships are small on screen.
      const mx = ax + dx * 0.5;
      const mz = az + dz * 0.5;
      const midLife = reduced ? 0.36 : 0.24;
      if (slot.kind === DOCTRINE_TELL_KIND.TETHER) {
        this._spawnSprite(SPR_RING, mx, 0, mz, midLife, 3.5, 9.0, style.linkOp, 0.0, style.color0, 0, 0);
      } else if (slot.kind === DOCTRINE_TELL_KIND.CHARGE) {
        this._spawnSprite(SPR_FLASH, mx, 0, mz, midLife * 0.85, 2.5, 6.5, style.linkOp, 0.0, style.color1, 0, 0);
      } else if (slot.kind === DOCTRINE_TELL_KIND.FLYBY) {
        this._spawnSprite(SPR_PUFF, mx, 0, mz, midLife, 3.0, 8.0, style.linkOp * 0.85, 0.0, style.color1, ux * 6, uz * 6);
      }

      // Target end tick — confirms who is under threat without HUD text.
      this._spawnSprite(
        reduced ? SPR_RING : SPR_FLASH,
        bx, 0, bz,
        reduced ? 0.32 : 0.16,
        3.0, reduced ? 8.0 : 6.0,
        style.linkOp * 0.9, 0.0, style.color0, 0, 0,
      );
    },

    _doctrineTellOffscreenPoint(origin, ux, uz) {
      const ox = Number(origin && origin.x) || 0;
      const oz = Number(origin && origin.z) || 0;
      const fallbackR = tableDoctrineTellCueWu(this.state);
      const camera = this.state && this.state.render && this.state.render.camera;
      const canProject = !!(
        camera
        && camera.isCamera
        && camera.projectionMatrix
        && typeof camera.updateMatrixWorld === 'function'
      );
      if (!canProject) {
        return { x: ox + ux * fallbackR, z: oz + uz * fallbackR };
      }
      const scratch = this._doctrineTellScreenScratch || this._trailScreenScratch;
      const pad = 0.78;
      let lo = 0;
      let hi = Math.max(fallbackR, 8);
      let best = 0;
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) * 0.5;
        const local = this._toLocalXZ(ox + ux * mid, oz + uz * mid, this._entityLocalXZ);
        scratch.set(local.x, 0, local.z);
        scratch.project(camera);
        const inside = Math.abs(scratch.x) <= pad
          && Math.abs(scratch.y) <= pad
          && scratch.z >= -1
          && scratch.z <= 1;
        if (inside) {
          best = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }
      return { x: ox + ux * best, z: oz + uz * best };
    },

    _spawnDoctrineTellOffscreenCue(slot, style, cx, cz, ux, uz, isStart) {
      const reduced = slot.reduced;
      const life = reduced ? 0.42 : 0.32;
      // Directional chevron of rings/particles pointing at the real bearing (not a random edge).
      this._spawnSprite(SPR_RING, cx, 0, cz, life, 5.0, 14.0, style.ringOp, 0.0, style.color0, 0, 0);
      if (isStart) {
        this._spawnSprite(
          reduced ? SPR_RING : SPR_FLASH,
          cx, 0, cz, life * 0.9, 3.5, 9.0, style.coreOp, 0.0, style.color1, 0, 0,
        );
      }
      this._c0.set(style.color0);
      this._c1.set(style.color1);
      const n = reduced ? 5 : 8;
      for (let i = 0; i < n; i++) {
        const along = 6 + i * (reduced ? 4.5 : 5.5);
        const px = cx + ux * along;
        const pz = cz + uz * along;
        const sp = 10 + i * 3;
        this._spawnParticle(
          px, pz,
          ux * sp, uz * sp,
          0.22 + i * 0.02, 1.8, 0.1,
          this._c0, this._c1, 2.4, 0, 0,
        );
      }
      // Kind glyph so FLYBY / TETHER / CHARGE remain distinct off-screen.
      if (slot.kind === DOCTRINE_TELL_KIND.TETHER) {
        this._spawnSprite(SPR_FRESNEL, cx, 0, cz, life * 1.1, 4.0, 11.0, style.ringOp * 0.8, 0.0, style.color0, 0, 0);
      } else if (slot.kind === DOCTRINE_TELL_KIND.CHARGE) {
        this._spawnSprite(SPR_FLASH, cx, 0, cz, life * 0.85, 3.0, 7.5, style.coreOp, 0.0, style.color1, 0, 0);
      } else if (slot.kind === DOCTRINE_TELL_KIND.FLYBY) {
        this._spawnSprite(SPR_PUFF, cx + ux * 8, 0, cz + uz * 8, life, 4.0, 10.0, style.linkOp, 0.0, style.color1, ux * 12, uz * 12);
      }
      if (style.useLight && isStart) {
        this._eventLight({ x: cx, z: cz }, 'tell', { severity: 'link', color: style.light });
      }
    },

    // A tell's deadline is a sim tick, and retry starts that clock over. The slot would
    // keep pulsing for an entity id the new run has already torn down. This pool is the
    // one that survives game:new; releasing it is not a wipe of every other effect.
    _releaseDoctrineTells() {
      const pool = this._doctrineTells;
      if (!pool) return;
      for (let i = 0; i < pool.length; i++) {
        const slot = pool[i];
        if (!slot.alive) continue;
        slot.alive = false;
        slot.entityId = null;
        slot.startTick = null;
        slot.deadlineTick = null;
        slot.age = slot.life || 0;
      }
      this._doctrineTellActive = 0;
    },

    _updateDoctrineTells(dt) {
      const pool = this._doctrineTells;
      if (!pool || !this._doctrineTellActive) return;
      const tick = this.state && Number.isInteger(this.state.tick) ? this.state.tick : null;
      let live = 0;
      for (let i = 0; i < pool.length; i++) {
        const slot = pool[i];
        if (!slot.alive) continue;
        // Tick-owned lifetime: paused/tab render frames (dt) must not burn the sim warning window.
        if (slot.deadlineTick != null && tick != null) {
          if (tick > slot.deadlineTick) {
            slot.alive = false;
            slot.startTick = null;
            slot.deadlineTick = null;
            continue;
          }
        } else {
          // Headless fallback only when sim tick is unavailable.
          slot.age += dt;
          if (slot.age >= slot.life) {
            slot.alive = false;
            continue;
          }
        }
        live++;
        // Re-resolve on/off screen each pulse so a flyby that enters frame gains the enemy link.
        // Pulse cadence still uses frame dt (visual only; does not retire the tell).
        slot.pulse += dt;
        if (slot.pulse >= DOCTRINE_TELL_PULSE) {
          slot.pulse = 0;
          // Keep reduced flag current if the player toggles accessibility mid-telegraph.
          slot.reduced = this._isReduced();
          this._spawnDoctrineTellPulse(slot, false);
        }
      }
      this._doctrineTellActive = live;
    },

    _onAiFlee(p) {
      this._emitJuiceCue('ai.flee', p, 1);
    },

    _onAiFormationBroken(p) {
      this._emitJuiceCue('ai.formation_broken', p, 1);
    },
  };
}
