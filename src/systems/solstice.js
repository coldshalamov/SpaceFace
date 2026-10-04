// src/systems/solstice.js — Solstice / SL-9 system owner.
// Manages Solstice core, 3 focus prisms, the lumen wisp companion, beam projection, and resonance bloom.
import { SOLSTICE as C, SOLSTICE_LINES, freshSolsticeMemory, normalizeSolsticeMemory } from '../data/solstice.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import {
  finiteXZ, clamp, distanceXZ, wrapAngle,
  prismFocalGoal, isPrismInFocalZone, boundedPrismServo,
  isPlayerInBeam, playerOwnsPrismTether, wispFollowServo,
} from '../characters/solsticeRules.js';

export const SOLSTICE_GLOBAL_ANCHOR = Object.freeze(sectorLocalToGlobalForSector(C.anchor, C.sectorId));

export function solsticeEntitySpec(part = 'core', index = 0, memory = freshSolsticeMemory()) {
  const isCore = part === 'core';
  const isPrism = part === 'prism';
  const isWisp = part === 'wisp';
  const radius = isCore ? C.coreRadius : isPrism ? C.prismRadius : C.wispRadius;
  const mass = isCore ? C.coreMass : isPrism ? C.prismMass : 5;

  const pos = isCore
    ? { ...SOLSTICE_GLOBAL_ANCHOR }
    : isPrism
      ? prismFocalGoal(index, 0, SOLSTICE_GLOBAL_ANCHOR)
      : { x: SOLSTICE_GLOBAL_ANCHOR.x + 25, z: SOLSTICE_GLOBAL_ANCHOR.z + 25 };

  return {
    type: 'drone',
    name: isCore
      ? C.name
      : isPrism
        ? `Focus Prism ${['Alpha (Amber)', 'Beta (Emerald)', 'Gamma (Sapphire)'][index]}`
        : 'Lumen Wisp',
    team: 2,
    factionId: null,
    pos,
    vel: { x: 0, y: 0, z: 0 },
    radius,
    mass,
    hull: isCore ? memory.hull : isPrism ? C.prismHull : 200,
    hullMax: isCore ? C.hull : isPrism ? C.prismHull : 200,
    collides: !isWisp,
    flags: { invuln: true },
    physicsBody: {
      dynamic: !isCore && !isWisp,
      sensor: isWisp,
      shape: 'ball',
      radius,
      mass,
      useMeasuredSkin: false,
      material: isCore ? 'machinery' : 'debris',
      ccd: isPrism,
      contact: {
        friction: 0.12,
        restitution: isPrism ? 0.75 : 0.2,
        linearDamping: 0.05,
        angularDamping: 0.2,
      },
    },
    data: {
      solsticePart: part,
      solsticeIndex: index,
      authoredCharacter: C.id,
      identityKey: isCore ? C.id : `${C.id}:${part}:${index}`,
      homeSectorId: C.sectorId,
      callsign: C.callsign,
      scanLabel: isCore
        ? 'SL-9 · SOLSTICE · scan to hail'
        : isPrism
          ? `Focus Prism ${['Alpha', 'Beta', 'Gamma'][index]} · tether to align`
          : 'Lumen Wisp · friendly companion',
      scannerSignalKind: 'anomaly',
      visualRadius: isCore ? 300 : isPrism ? 20 : 14,
      solsticePose: {
        simTime: 0,
        phase: memory.bloomed ? 'resonance' : memory.met ? 'awake' : 'sleep',
        beamAngle: 0,
        beamActive: true,
        beamIntensity: 1.0,
        bloomProgress: 0,
        prismResonance: [false, false, false],
        bloomed: memory.bloomed,
        folded: false,
        wispActive: memory.wispActive,
      },
    },
  };
}

export function createSolstice() {
  return {
    name: 'solstice',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this.state.solstice = normalizeSolsticeMemory(this.state.solstice);
      this._unsubs = [];
      this._restoring = false;
      this._reset();

      const on = (name, fn) => {
        const off = this.bus.on(name, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('scan:pulse', p => this._scan(p));
      on('combat:damage', p => this._damage(p));
      on('entity:killed', p => this._killed(p));
      on('game:newGame', () => this.newGame());
      on('save:restoring', () => { this._restoring = true; this._cancel(); });
      on('save:loaded', () => { this._restoring = false; this._reset(); this._sync(); });
      on('sector:enter', p => {
        if (!deferSectorEnterMaterialization(this.state, p, this._cookProvider)) this._sync();
      });

      this._cookProvider = () => this._sync();
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = [])).push(this._cookProvider);
      this._sync();
    },

    _reset() {
      this._coreRef = null;
      this._prisms = [null, null, null];
      this._wispRef = null;
      this._beamAngle = 0;
      this._beamSweepDir = 1;
      this._beamInPlayer = false;
      this._beamContinuousTime = 0;
      this._bloomHoldTime = 0;
      this._bloomFxTime = 0;
      this._lastVoice = -100;
      this._scanSeq = 0;
      this._scanSource = null;
      this._discovered = false;
      this._foldedUntil = 0;
      this._quietSeconds = 0;
      this._alignedPrisms = [false, false, false];
      this._outImpulse = { x: 0, z: 0 };
    },

    _entity(ref) {
      return ref && this.state?.entities?.get(ref.id) === ref && ref.alive ? ref : null;
    },
    _core() { return this._entity(this._coreRef); },
    _player() { return this.state?.entities?.get(this.state.playerId); },
    _adventure() {
      const r = this.state?.run;
      return (!r || !r.kind || r.kind === 'adventure' || r.kind === 'campaign')
        && this.state?.world?.currentSectorId === C.sectorId;
    },
    _live() {
      const p = this._player();
      return !this._restoring && this._adventure() && this.state.mode === 'flight'
        && this.state.timeScale > 0 && p?.alive && !p.flags?.docked && finiteXZ(p.pos) && finiteXZ(p.vel);
    },

    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.solsticePart) this.helpers?.removeEntity?.(e.id);
      }
      this._coreRef = null;
      this._prisms = [null, null, null];
      this._wispRef = null;
    },

    _sync() {
      if (this._restoring) return;
      const m = this.state.solstice;
      if (!this._adventure() || m.destroyed) {
        this._removeOwned();
        return;
      }

      let core = null;
      const prisms = [null, null, null];
      let wisp = null;

      for (const e of this.state.entityList || []) {
        if (!e?.alive || !e.data?.solsticePart) continue;
        if (e.data.solsticePart === 'core') core = e;
        else if (e.data.solsticePart === 'prism') {
          const idx = e.data.solsticeIndex;
          if (idx >= 0 && idx < 3) prisms[idx] = e;
        } else if (e.data.solsticePart === 'wisp') wisp = e;
      }

      if (!core) core = this.helpers.spawnEntity?.(solsticeEntitySpec('core', 0, m)) || null;
      for (let i = 0; i < 3; i++) {
        if (!prisms[i]) prisms[i] = this.helpers.spawnEntity?.(solsticeEntitySpec('prism', i, m)) || null;
      }
      if (m.wispActive && !wisp) {
        wisp = this.helpers.spawnEntity?.(solsticeEntitySpec('wisp', 0, m)) || null;
      } else if (!m.wispActive && wisp) {
        this.helpers.removeEntity?.(wisp.id);
        wisp = null;
      }

      this._coreRef = core;
      this._prisms = prisms;
      this._wispRef = wisp;
      this._publish();
    },

    newGame() {
      this._removeOwned();
      this.state.solstice = freshSolsticeMemory();
      this._restoring = false;
      this._reset();
    },
    serialize() {
      return normalizeSolsticeMemory({
        ...this.state.solstice,
        hull: this._core()?.hull ?? this.state.solstice.hull,
      });
    },
    deserialize(raw) {
      this._removeOwned();
      this.state.solstice = normalizeSolsticeMemory(raw);
      this._reset();
    },
    destroy() {
      for (const off of this._unsubs || []) off();
      this._unsubs = [];
      this._removeOwned();
      const providers = this.helpers?.sectorCookProviders;
      if (providers) {
        const i = providers.indexOf(this._cookProvider);
        if (i >= 0) providers.splice(i, 1);
      }
      this._cookProvider = null;
    },

    _say(key, important = false) {
      const now = this.state.simTime || 0;
      if (!SOLSTICE_LINES[key] || (!important && now - this._lastVoice < C.voiceCooldown)) return false;
      this._lastVoice = now;
      const text = SOLSTICE_LINES[key];
      if (this.helpers.voice?.say) {
        this.helpers.voice.say({ id: `solstice:${key}`, channel: 'comms', priority: important ? 60 : 25, text, ttl: 8 });
      } else {
        this.bus.emit('toast', { text, kind: 'info', ttl: 8 });
      }
      this.bus.emit('solstice:voice', { key, text });
      return true;
    },

    _sound(id) {
      this.bus.emit('audio:cue', { id, position: { ...SOLSTICE_GLOBAL_ANCHOR }, gain: 0.65 });
    },

    _scan(p) {
      if (!this._live()) return;
      const player = this._player(), core = this._core();
      if (!core || p?.source !== 'player-scanner' || p.scannerId !== player.id
        || !Number.isSafeInteger(p.seq) || p.seq < 1
        || !finiteXZ(p.pos) || distanceXZ(p.pos, player.pos) > 2
        || !Number.isFinite(p.radius) || p.radius <= 0) return;

      if (this._scanSource === player && p.seq <= this._scanSeq) return;
      this._scanSource = player;
      this._scanSeq = p.seq;

      if (distanceXZ(core.pos, player.pos) > Math.min(C.scanRadius, p.radius)) return;

      const m = this.state.solstice;
      m.visits++;
      if (!m.met) {
        m.met = true;
        this._say('hello', true);
        this._sound('sfx_solstice_wake');
        this._publish();
        return;
      }

      // If bloomed, toggle Lumen Wisp companion!
      if (m.bloomed) {
        m.wispActive = !m.wispActive;
        this._say(m.wispActive ? 'wispDeploy' : 'wispRecall', true);
        this._sound('sfx_solstice_wisp');
        this._sync();
        this.bus.emit('solstice:wisp_toggle', { active: m.wispActive });
        return;
      }

      this._say('welcome', true);
      this._publish();
    },

    _cancel() {
      this._beamInPlayer = false;
      this._beamContinuousTime = 0;
      this._bloomHoldTime = 0;
      this._publish();
    },

    _damage(p) {
      const core = this._core();
      if (core && p?.targetId === core.id && p.applied > 0) {
        this.state.solstice.hull = core.hull;
        this._foldedUntil = (this.state.simTime || 0) + 12;
        this._say('hurt', true);
        this._publish();
      }
    },

    _killed(p) {
      if (!p || !this._adventure()) return;
      const core = this._coreRef;
      if (core && p.id === core.id && this.state.entities.get(core.id) === core) {
        this.state.solstice.destroyed = true;
        this.state.solstice.hull = 0;
        this._say('memorial', true);
        this.bus.emit('solstice:destroyed', {});
        this._removeOwned();
      }
    },

    _impulse(e, dv) {
      const mass = e.physicsBody?.mass ?? e.mass;
      if (!finiteXZ(dv) || !Number.isFinite(mass) || mass <= 0) return false;
      this._outImpulse.x = dv.x * mass;
      this._outImpulse.z = dv.z * mass;
      return queuePhysicsImpulse(e, this._outImpulse, { source: 'solstice', part: e.data?.solsticePart || 'player' });
    },

    _publish() {
      const core = this._core();
      if (!core) return;
      const m = this.state.solstice;
      const p = core.data.solsticePose;
      const now = this.state.simTime || 0;

      p.simTime = now;
      p.beamAngle = this._beamAngle;
      p.beamActive = now > this._foldedUntil;
      p.beamIntensity = this._beamInPlayer ? 1.4 : 1.0;
      p.bloomProgress = clamp(this._bloomHoldTime / C.bloomHoldTime, 0, 1);
      p.prismResonance = [...this._alignedPrisms];
      p.bloomed = m.bloomed;
      p.folded = now <= this._foldedUntil;
      p.wispActive = m.wispActive;

      for (let i = 0; i < 3; i++) {
        const prism = this._entity(this._prisms[i]);
        if (prism?.data?.solsticePose) {
          prism.data.solsticePose.simTime = now;
          prism.data.solsticePose.aligned = this._alignedPrisms[i];
          prism.data.solsticePose.beamAngle = this._beamAngle;
        }
      }
    },

    update(dt) {
      if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1 || this._restoring) return;
      const core = this._core();
      if (!core) return;
      const player = this._player();
      const now = this.state.simTime || 0;
      const m = this.state.solstice;

      // 1. Beam steering: slow gentle astronomical sweep or soft lock towards player if hailed
      if (now > this._foldedUntil) {
        if (player && m.met && distanceXZ(player.pos, core.pos) < C.beamLength * 1.2) {
          const targetAngle = Math.atan2(player.pos.z - core.pos.z, player.pos.x - core.pos.x);
          const diff = wrapAngle(targetAngle - this._beamAngle);
          this._beamAngle = wrapAngle(this._beamAngle + diff * clamp(dt * 1.5, 0, 0.15));
        } else {
          this._beamAngle = wrapAngle(this._beamAngle + dt * 0.15 * this._beamSweepDir);
        }
      }

      // 2. Beam riding & solar recharge
      if (player && now > this._foldedUntil) {
        const inBeam = isPlayerInBeam(player.pos, core.pos, this._beamAngle, C.beamLength, C.beamHalfAngle);
        if (inBeam) {
          if (!this._beamInPlayer) {
            this._beamInPlayer = true;
            this._say('beamEnter');
            this.bus.emit('solstice:beam_enter', { playerId: player.id });
          }
          this._beamContinuousTime += dt;

          // Recharge shields & energy
          if (player.shield != null && player.shieldMax != null) {
            player.shield = Math.min(player.shieldMax, player.shield + C.beamRechargeRate * dt);
          }
          if (player.energy != null && player.energyMax != null) {
            player.energy = Math.min(player.energyMax, player.energy + C.beamRechargeRate * dt * 2);
          }

          // Full charge buff threshold
          if (this._beamContinuousTime >= C.beamChargeTimeNeeded && !player.flags?.lumenCharged) {
            if (!player.flags) player.flags = {};
            player.flags.lumenCharged = true;
            player.flags.lumenChargeUntil = now + C.chargeBuffDuration;
            m.chargesCount++;
            this._say('charged', true);
            this._sound('sfx_solstice_charge');
            this.bus.emit('solstice:charged', { duration: C.chargeBuffDuration });
          }
        } else {
          this._beamInPlayer = false;
          this._beamContinuousTime = 0;
        }

        // Clean expired lumenCharge buff
        if (player.flags?.lumenCharged && now > (player.flags.lumenChargeUntil || 0)) {
          player.flags.lumenCharged = false;
        }
      }

      // 3. Prism mechanics & Harmonic alignment
      let allAligned = true;
      const targetGoals = [];
      for (let i = 0; i < 3; i++) {
        const goal = prismFocalGoal(i, this._beamAngle, core.pos);
        targetGoals.push(goal);
        const prism = this._entity(this._prisms[i]);
        if (!prism) {
          allAligned = false;
          continue;
        }

        const isTethered = playerOwnsPrismTether(this.state, prism);
        const aligned = isPrismInFocalZone(prism.pos, goal, C.focalTolerance);
        this._alignedPrisms[i] = aligned;
        if (!aligned) allAligned = false;

        // Physical spring restoration when not actively towed by player
        if (!isTethered) {
          const force = boundedPrismServo(prism, goal, dt);
          if (force) this._impulse(prism, force);
        }
      }

      // 4. Supernova Bloom Trigger
      if (allAligned && now > this._foldedUntil) {
        this._bloomHoldTime += dt;
        if (this._bloomHoldTime >= C.bloomHoldTime && !m.bloomed) {
          m.bloomed = true;
          m.bloomsCount++;
          this._bloomFxTime = now;
          this._say('bloom', true);
          this._sound('sfx_solstice_bloom');

          // Reward: spawn rare crystal pickups in the bloom perimeter
          if (this.helpers.spawnEntity) {
            for (let k = 0; k < 3; k++) {
              const ang = (k * Math.PI * 2 / 3) + 0.3;
              const rPos = {
                x: core.pos.x + Math.cos(ang) * 55,
                z: core.pos.z + Math.sin(ang) * 55,
              };
              this.helpers.spawnEntity({
                type: 'pickup',
                name: 'Resonant Light Crystal',
                pos: rPos,
                radius: 4,
                mass: 1,
                data: {
                  commodity: 'cmdty_ore_rare',
                  amount: 2,
                  pickupRole: 'crystal',
                },
              });
            }
          }

          this.bus.emit('solstice:bloom', {
            pos: { ...core.pos },
            radius: C.bloomRadius,
          });
        }
      } else {
        this._bloomHoldTime = 0;
      }

      // 5. Lumen Wisp Follower
      if (m.wispActive) {
        let wisp = this._entity(this._wispRef);
        if (!wisp && this.helpers.spawnEntity) {
          wisp = this.helpers.spawnEntity(solsticeEntitySpec('wisp', 0, m));
          this._wispRef = wisp;
        }
        if (wisp && player) {
          const out = {};
          if (wispFollowServo(wisp, player, dt, out)) {
            wisp.pos.x += out.x;
            wisp.pos.z += out.z;
            wisp.vel = wisp.vel || { x: 0, y: 0, z: 0 };
            wisp.vel.x = out.vx;
            wisp.vel.z = out.vz;
          }
        }
      }

      // 6. Easter Eggs
      if (player && m.met && !m.destroyed) {
        const dist = distanceXZ(player.pos, core.pos);

        // Speed orbit easter egg
        if (!m.orbitHeard && dist < 140) {
          const speed = Math.hypot(player.vel.x, player.vel.z);
          if (speed >= C.orbitSpeedEasterEgg) {
            m.orbitHeard = true;
            this._say('speedOrbit', true);
          }
        }

        // Drifting in quiet stillness easter egg
        if (!m.quietHeard && dist < 70) {
          const speed = Math.hypot(player.vel.x, player.vel.z);
          if (speed < 1.0) {
            this._quietSeconds += dt;
            if (this._quietSeconds >= C.quietSeconds) {
              m.quietHeard = true;
              this._say('quiet', true);
            }
          } else {
            this._quietSeconds = 0;
          }
        }

        // Eclipse easter egg: player blocks line between core and a prism while in beam
        if (!m.eclipseHeard && this._beamInPlayer) {
          for (let i = 0; i < 3; i++) {
            const prism = this._entity(this._prisms[i]);
            if (!prism) continue;
            const pDist = distanceXZ(prism.pos, core.pos);
            const playerDist = distanceXZ(player.pos, core.pos);
            if (playerDist < pDist && distanceXZ(player.pos, prism.pos) < 22) {
              m.eclipseHeard = true;
              this._say('eclipse', true);
              break;
            }
          }
        }
      }

      this._publish();
    },
  };
}

export const solstice = createSolstice();
