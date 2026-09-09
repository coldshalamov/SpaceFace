// PQ-013 / SF-14 — planetary site runtime: THE registration adapter + band state machine + skim
// harvest + staged reentry (BUILD_PLAN_CORRECTED.md STEP 12).
//
// Q18 IDENTITY TRANSACTION. The Atlas zone record (src/data/authoredPlaces.js ZONE_TETHYS_ANVIL)
// is the canonical identity. This system is the ONE registration adapter: when the player's sector
// carries an authored site (src/data/planets.js), it binds — in one transaction — the visual/
// physics body (a 'planet' entity with a static exclusion circle), the attraction profile (an
// annular WELL registered into the PQ-012 field kernel through fields.registerExternal — the SAME
// kernel, SAME membrane, SAME predictor seam as every field), the atmosphere band state machine,
// and the published runtime (state.planet). No physics planet without an atlas record: the adapter
// refuses to spawn unless the zone record resolves and its converted global centre is where the
// site will live. Everything unwinds on sector exit.
//
// AUTHORITY BOUNDARIES (single-writer law):
//   • forces      — ONLY the field kernel (attraction) and queuePhysicsImpulse (bounded drag +
//                   recovery assist; additive, never a control overwrite — dockingCorridor idiom).
//   • hull damage — ONLY combat.kernel.routeDamage with the named damageType 'reentry_burn';
//                   terminal destruction is an ordinary hull death (wreck/aftermath compat free).
//   • cargo       — ONLY the cargo system's addCargo (mining idiom; partial-add handled).
//   • energy      — NOT touched. The emergency burn requires HELD BOOST, whose energy cost the
//                   propulsion kernel already owns; this system adds only heat + the assist shape
//                   (which opposes tangential velocity — the momentum cost). Zero new writers.
//
// DETERMINISM / GOLDEN SAFETY (three independent layers, the fields.js recipe):
//   1. PLANET_FLAGS Tier-B — OFF under node, so sf-sim / the 47a golden never construct anything.
//   2. The site lives in sector_tethys_junction; the 47a scenario never enters it.
//   3. This system is NOT in sf-sim.mjs's curated list.
// All math is pure in (positions, authored constants, dt, state.simTime); no rng, no wall clock.
//
// SAVE POLICY: transient (the fields.js precedent — "deliberately sidesteps the save-schema
// mutex"). state.planet normalizes away on save:loaded/game:new and the adapter re-registers from
// authored data on the next tick, so the IDENTITY (the Atlas zone id), the player's position, and
// all harvested cargo persist through their existing owners while heat/stage — seconds-lived,
// escape-window-forgiving scalars — reset. No save version bump, no golden hash movement.

import { PLANET_SITE, planetSitesForSector, planetFlag, classifyPlanetRegion, PLANET_REGION_RANK } from '../data/planets.js';
import { SECTOR_ZONES } from '../data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { queuePhysicsImpulse, isDynamicPhysicsBodyEntity } from '../core/physicsAuthority.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';

const MAX_TRACKED_SHIPS = 8;   // bounded per-tick work: player + the nearest 7 ships in the bands
const MAX_AFTERMATH = 4;       // bounded presentation memory of recent plunge terminations
const REGION_ORDER = ['outside', 'influence', 'sling', 'skim', 'danger', 'reentry'];

function finite(v, fb = 0) { return Number.isFinite(v) ? v : fb; }
function nowOf(state) { return Number.isFinite(state.simTime) ? state.simTime : state.tick / 60; }

function defaultRuntime() {
  return {
    schemaVersion: 1,      // transient — normalized away on load (fields.js precedent)
    active: false,
    siteId: null,
    zoneId: null,          // THE canonical Atlas identity (save/nav/mission reference)
    sectorId: null,
    entityId: null,        // the spawned 'planet' entity (visual + static exclusion body)
    fieldId: null,         // the annular attraction profile in the PQ-012 kernel
    center: { x: 0, z: 0 },// global centre (converted once from the authored sector-local anchor)
    player: {
      region: 'outside', regionRank: 0, r: Infinity,
      heat: 0, stage: null, stageAt: 0, outwardS: 0, burnNextAt: 0,
      collectorOn: false, pendingShallow: 0, pendingRich: 0, harvestedUnits: 0,
      recoveryBurn: false, commitCueAt: -Infinity,
    },
    ships: {},             // entityId -> tracked non-player record (bounded MAX_TRACKED_SHIPS-1)
    aftermath: [],         // [{x,z,at,until}] recent plunge terminations (presentation memory)
    telemetry: { tracked: 0, inBands: 0, burnsRouted: 0, harvestUnits: 0, dragImpulses: 0 },
  };
}

function ensureRuntime(state) {
  const p = state.planet;
  if (p && p.schemaVersion === 1) return p;
  state.planet = defaultRuntime();
  return state.planet;
}

function newShipRecord() {
  return { region: 'outside', regionRank: 0, r: Infinity, heat: 0, stage: null, stageAt: 0, outwardS: 0, burnNextAt: 0 };
}

export const planetRuntime = {
  name: 'planetRuntime',

  init(ctx) {
    for (const unsub of this._lifecycleUnsubs || []) unsub();
    this._lifecycleUnsubs = [];
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    this._queryOut = [];
    this._scratchIds = [];
    ensureRuntime(ctx.state);
    if (this.bus && typeof this.bus.on === 'function') {
      // Transient normalize-away (fields.js precedent): the adapter rebuilds from authored data.
      this._lifecycleUnsubs = [
        this.bus.on('game:new', () => this._unwind('new_game')),
        this.bus.on('save:loaded', () => this._unwind('save_loaded')),
        this.bus.on('sector:exit', () => this._unwind('sector_exit')),
      ];
    }
  },

  newGame() { this._unwind('new_game'); },

  destroy() {
    for (const unsub of this._lifecycleUnsubs || []) unsub();
    this._lifecycleUnsubs = [];
  },

  update(dt, state) {
    let rt = ensureRuntime(state);
    if (!planetFlag('enabled')) return;                       // golden-safety layer 1
    const sectorId = state.world && state.world.currentSectorId;
    const site = (planetSitesForSector(sectorId)[0]) || null; // layer 2: authored sectors only

    if (rt.active && (!site || rt.sectorId !== sectorId)) {
      this._unwind('sector_changed');
      rt = ensureRuntime(state); // _unwind replaces state.planet — never keep the stale reference
    }
    if (site && !rt.active) this._register(state, rt, site, sectorId);
    if (!rt.active || !site) return;

    // The kernel is cleared by fields._clearAll on lifecycle boundaries; re-bind when missing so
    // the profile and the body can never drift apart (identity transaction stays whole).
    const fsys = this.registry && this.registry.get ? this.registry.get('fields') : null;
    if (fsys && typeof fsys.hasExternal === 'function' && !fsys.hasExternal(rt.fieldId)) {
      this._registerField(fsys, rt, site);
    }

    if (state.mode !== 'flight' || dt <= 0) return;
    this._tickShips(dt, state, rt, site);
    this._tickHarvest(dt, state, rt, site);
    this._expireAftermath(state, rt);
  },

  // ── Q18 registration transaction ──────────────────────────────────────────────────────────────

  _register(state, rt, site, sectorId) {
    // "No physics planet without an atlas record": resolve the canonical zone and derive the ONE
    // global centre from its authored sector-local anchor. A missing/renamed record refuses spawn.
    const zones = SECTOR_ZONES[sectorId] || [];
    const zone = zones.find((z) => z && z.id === site.zoneId) || null;
    if (!zone) return;
    const global = sectorLocalToGlobalForSector(zone.center, sectorId);
    if (!global || !Number.isFinite(global.x) || !Number.isFinite(global.z)) return;

    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    const fsys = this.registry && this.registry.get ? this.registry.get('fields') : null;
    if (typeof spawnEntity !== 'function' || !fsys || typeof fsys.registerExternal !== 'function') return;

    const entity = spawnEntity({
      type: 'planet',
      team: 0,
      pos: { x: global.x, z: global.z },
      vel: { x: 0, z: 0 },
      rot: 0,
      angVel: 0,
      radius: site.bodyRadius,          // the exclusion/collision policy: one static circle
      collides: true,
      hull: 1e9, hullMax: 1e9,          // a world does not die; ramming it is the ram's problem
      physicsBody: {
        schemaVersion: 1, radius: site.bodyRadius, mass: 1e9, inertiaY: 1e9,
        dynamic: false, ccd: false, material: 'station', revision: 0,
      },
      data: {
        kind: 'planet_site',
        planetSite: {
          siteId: site.id, zoneId: site.zoneId, name: site.name,
          planetType: site.planetType, seed: site.seed,
          radius: site.radius, centerY: site.centerY, bodyRadius: site.bodyRadius,
          bands: site.bands,
        },
      },
    });
    if (!entity) return;

    rt.active = true;
    rt.siteId = site.id;
    rt.zoneId = site.zoneId;
    rt.sectorId = sectorId;
    rt.entityId = entity.id;
    rt.fieldId = `${site.id}_pull`;
    rt.center.x = global.x;
    rt.center.z = global.z;
    this._registerField(fsys, rt, site);
    this.bus.emit('planet:registered', {
      siteId: site.id, zoneId: site.zoneId, entityId: entity.id, fieldId: rt.fieldId,
      center: { x: global.x, z: global.z },
    });
  },

  _registerField(fsys, rt, site) {
    fsys.registerExternal({
      id: rt.fieldId,
      kind: 'well',
      center: { x: rt.center.x, z: rt.center.z },
      radius: site.field.radius,
      strength: site.field.strength,
      falloff: site.field.falloff,
      innerRadius: site.field.innerRadius,
      innerSoft: site.field.innerSoft,
      sourceId: rt.entityId,
      createdAt: nowOf(this.state),
    });
  },

  _unwind(why) {
    const state = this.state;
    if (!state) return;
    const rt = ensureRuntime(state);
    if (rt.active) {
      const fsys = this.registry && this.registry.get ? this.registry.get('fields') : null;
      if (fsys && typeof fsys.unregisterExternal === 'function' && rt.fieldId) fsys.unregisterExternal(rt.fieldId);
      const entity = state.entities && state.entities.get ? state.entities.get(rt.entityId) : null;
      if (entity && entity.alive !== false) entity.alive = false;
      this.bus && this.bus.emit && this.bus.emit('planet:unregistered', { siteId: rt.siteId, why });
    }
    state.planet = defaultRuntime();
  },

  // ── band state machine + heat + drag + the Plunge ─────────────────────────────────────────────

  _tickShips(dt, state, rt, site) {
    const now = nowOf(state);
    const tel = rt.telemetry;
    tel.tracked = 0; tel.inBands = 0;

    // Bounded candidate set: one spatial query at the influence radius (dormant sectors = zero).
    const queryRadius = this.helpers && this.helpers.queryRadius;
    const player = state.entities.get(state.playerId);
    const candidates = this._queryOut;
    candidates.length = 0;
    if (typeof queryRadius === 'function') queryRadius(rt.center, site.bands.influence, candidates);

    // Track the player always (if in influence) + the nearest ships, bounded.
    const seen = this._scratchIds;
    seen.length = 0;
    if (player && player.alive !== false) {
      this._tickOneShip(dt, state, rt, site, player, rt.player, now, /*isPlayer*/ true);
      seen.push(player.id);
    }
    let tracked = 0;
    for (let i = 0; i < candidates.length && tracked < MAX_TRACKED_SHIPS - 1; i++) {
      const e = candidates[i];
      if (!e || e.alive === false || e === player) continue;
      if (e.type !== 'ship' && e.type !== 'drone') continue;
      if (!isDynamicPhysicsBodyEntity(e)) continue;
      const rec = rt.ships[e.id] || (rt.ships[e.id] = newShipRecord());
      this._tickOneShip(dt, state, rt, site, e, rec, now, false);
      seen.push(e.id);
      tracked++;
    }
    // Drop records for ships that left the influence volume or died (bounded sweep).
    for (const id of Object.keys(rt.ships)) {
      if (!seen.includes(Number.isFinite(Number(id)) ? Number(id) : id) && !seen.includes(id)) delete rt.ships[id];
    }
    tel.tracked = seen.length;
  },

  _tickOneShip(dt, state, rt, site, e, rec, now, isPlayer) {
    const dx = e.pos.x - rt.center.x;
    const dz = e.pos.z - rt.center.z;
    const r = Math.hypot(dx, dz);
    rec.r = r;

    // Hysteresis: instantly ACCEPT a deeper (higher-rank) classification; stepping back OUT
    // requires clearing the CURRENT region's outer boundary plus the hysteresis margin (the edge
    // being crossed on the way out). Never flaps on the line.
    const raw = classifyPlanetRegion(site, r);
    const rawRank = PLANET_REGION_RANK[raw];
    if (rawRank > rec.regionRank) {
      rec.region = raw; rec.regionRank = rawRank;
    } else if (rawRank < rec.regionRank) {
      const currentOuterEdge = this._outerEdgeOf(site, rec.region);
      if (r > currentOuterEdge + site.hysteresis) { rec.region = raw; rec.regionRank = rawRank; }
    }
    const region = rec.region;
    if (rec.regionRank >= PLANET_REGION_RANK.skim) rt.telemetry.inBands++;

    // Heat: ONE scalar 0..1 (the sheath, the HUD arc and the stage machine all read this number).
    const h = site.heat;
    let dHeat = 0;
    if (region === 'skim') dHeat = h.skimRate;
    else if (region === 'danger') dHeat = h.dangerRate;
    else if (region === 'reentry') dHeat = h.reentryRate;
    else dHeat = -(h.coolRate);
    if (region === 'skim' && rec.heat > 0.6) dHeat = -h.coolSkimRate; // hot ships barely cool in-band
    rec.heat = Math.min(1, Math.max(0, rec.heat + dHeat * dt));

    // Atmosphere drag (bounded additive impulse through the membrane — never a velocity write).
    const dragRate = region === 'reentry' ? site.drag.reentry : region === 'danger' ? site.drag.danger : region === 'skim' ? site.drag.skim : 0;
    if (dragRate > 0) {
      const vx = finite(e.vel && e.vel.x), vz = finite(e.vel && e.vel.z);
      const speed = Math.hypot(vx, vz);
      if (speed > 1e-3) {
        let a = Math.min(site.drag.maxAccel, speed * dragRate);
        const mass = Math.max(1, finite(e.physicsBody && e.physicsBody.mass, finite(e.mass, 1)));
        queuePhysicsImpulse(e, { x: (-vx / speed) * a * mass * dt, y: 0, z: (-vz / speed) * a * mass * dt });
        rt.telemetry.dragImpulses++;
      }
    }

    // The Plunge (staged, escape windows preserved).
    this._tickPlunge(dt, state, rt, site, e, rec, r, region, now, isPlayer);

    // Player-only: recovery burn + the one-voice commit cue.
    if (isPlayer) this._tickRecovery(dt, state, rt, site, e, rec, r, now);
  },

  _outerEdgeOf(site, region) {
    // The planar radius at which `region` ENDS (its outer boundary — the edge crossed leaving it).
    switch (region) {
      case 'reentry': return site.bands.reentry;
      case 'danger': return site.bands.danger;
      case 'skim': return site.bands.skim;
      case 'sling': return site.bands.sling;
      case 'influence': return site.bands.influence;
      default: return Infinity;
    }
  },

  _tickPlunge(dt, state, rt, site, e, rec, r, region, now, isPlayer) {
    const p = site.plunge;
    const prev = rec.stage;
    const inHot = region === 'danger' || region === 'reentry';

    // Outward-escape accumulator: any time spent OUT of the hot bands counts toward regression.
    if (!inHot && rec.stage) rec.outwardS += dt; else rec.outwardS = 0;

    // Stage ladder (advance requires presence + heat; regress requires sustained escape).
    if (!rec.stage) {
      if (inHot) this._setStage(rt, e, rec, 'skim', now, isPlayer);
    }
    if (rec.stage === 'skim') {
      if (rec.heat >= p.commitHeat || region === 'reentry') this._setStage(rt, e, rec, 'commit', now, isPlayer);
      else if (rec.outwardS >= p.regressS && rec.heat < p.commitHeat * 0.7) this._setStage(rt, e, rec, null, now, isPlayer);
    }
    if (rec.stage === 'commit') {
      if (rec.heat >= p.breakupHeat && inHot) this._setStage(rt, e, rec, 'breakup', now, isPlayer);
      else if (rec.outwardS >= p.regressS) this._setStage(rt, e, rec, 'skim', now, isPlayer);
    }
    if (rec.stage === 'breakup') {
      if (r < p.descentRadius) this._setStage(rt, e, rec, 'descent', now, isPlayer);
      else if (rec.outwardS >= p.regressS && rec.heat < p.breakupHeat * 0.85) this._setStage(rt, e, rec, 'commit', now, isPlayer);
    }
    if (rec.stage === 'descent') {
      // Descent regression is possible but hard: you must actually climb out of the reentry band.
      if (region !== 'reentry' && region !== 'danger' && rec.outwardS >= p.regressS) this._setStage(rt, e, rec, 'breakup', now, isPlayer);
    }

    // Burn damage — routed, named, ordinary hull consequence (terminal = normal combat kill).
    // Cadence-batched at 0.5s: the real router applies flat armor PER PACKET, so per-tick
    // micro-packets (dps·dt ≈ 0.1) would be silently erased by any armorFlat > 0 — a defect the
    // live route capture caught (node's seam recorder had no armor model). Batching keeps the
    // authored dps truthful against armored hulls; the schedule derives from simTime (no drift).
    const dps = rec.stage === 'descent' ? p.descentDps : rec.stage === 'breakup' ? p.burnDps : 0;
    if (dps > 0 && e.alive !== false) {
      if (!(rec.burnNextAt > 0)) rec.burnNextAt = now + 0.5;
      if (now >= rec.burnNextAt) {
        rec.burnNextAt = now + 0.5;
        this._routeBurn(state, rt, e, dps * 0.5);
      }
      if (e.alive === false || (e.hull != null && e.hull <= 0)) {
        // Terminal at the site: remember the plunge point briefly (Aftermath — the band remembers).
        if (rt.aftermath.length >= MAX_AFTERMATH) rt.aftermath.shift();
        rt.aftermath.push({ x: e.pos.x, z: e.pos.z, at: now, until: now + p.aftermathS });
        this.bus.emit('planet:plungeStage', { id: e.id, stage: 'aftermath', siteId: rt.siteId, isPlayer });
      }
    }
    if (prev !== rec.stage && rec.stage !== null) rt.telemetry.burnsRouted += 0; // stages logged via events
  },

  _setStage(rt, e, rec, stage, now, isPlayer) {
    if (rec.stage === stage) return;
    rec.stage = stage;
    rec.stageAt = now;
    rec.outwardS = 0;
    if (stage !== 'breakup' && stage !== 'descent') rec.burnNextAt = 0; // re-schedule on re-entry
    this.bus.emit('planet:plungeStage', { id: e.id, stage: stage || 'clear', siteId: rt.siteId, isPlayer });
  },

  _routeBurn(state, rt, e, damage) {
    const combat = this.registry && this.registry.get ? this.registry.get('combat') : null;
    const kernel = combat && (combat.kernel || (typeof combat.ensureKernel === 'function' ? combat.ensureKernel() : null));
    if (!kernel || typeof kernel.routeDamage !== 'function') return;
    // damageType 'plasma' is the real damage vocabulary member (src/combat/damage.js channel
    // table) — reentry burn IS plasma; the reentry NAME travels in source.kind/origin.kind so
    // attribution/telemetry can distinguish it from weapon plasma.
    const packet = scalarHitToDamagePacket({
      damage,
      damageType: 'plasma',
      pos: { x: e.pos.x, z: e.pos.z },
      source: { kind: 'planet_reentry' },
    });
    packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
    kernel.routeDamage({
      attackerId: rt.entityId,
      targetId: e.id,
      packet,
      origin: { kind: 'planet_reentry', id: rt.siteId },
    });
    rt.telemetry.burnsRouted++;
  },

  // ── player recovery (the asymmetric out: costly, visible, never a teleport) ───────────────────

  _tickRecovery(dt, state, rt, site, player, rec, r, now) {
    const actions = state.input && state.input.actions;
    const committed = rec.stage === 'commit' || rec.stage === 'breakup' || rec.stage === 'descent';

    // One-voice commit cue (bible §8.3): fires once per commit entry, routed through the arbiter.
    if (committed && now - rt.player.commitCueAt > 8 && rec.stage === 'commit' && rec.stageAt === now) {
      rt.player.commitCueAt = now;
      const voice = this.helpers && this.helpers.voice;
      if (voice && typeof voice.say === 'function') {
        voice.say({ channel: 'alert', kind: 'danger', priority: 110, ttl: 3.5, id: 'planet_commit', text: 'BURN NOW OR BREAK UP' });
      }
    }

    // Boost is a held LEVEL on state.input (input.js writes inp.boost; actions carries edges).
    const boosting = !!((state.input && state.input.boost) || (actions && actions.boost));
    let burning = false;
    if (committed && boosting) {
      const vx = finite(player.vel && player.vel.x), vz = finite(player.vel && player.vel.z);
      const dx = player.pos.x - rt.center.x, dz = player.pos.z - rt.center.z;
      const rr = Math.max(1e-3, r);
      const ox = dx / rr, oz = dz / rr; // outward unit
      // The assist engages when the pilot is actually trying to leave: nose outward-ish.
      const heading = { x: Math.cos(finite(player.rot)), z: Math.sin(finite(player.rot)) };
      if (heading.x * ox + heading.z * oz > 0.2) {
        burning = true;
        const mass = Math.max(1, finite(player.physicsBody && player.physicsBody.mass, 1));
        // Outward assist + tangential opposition (the momentum cost): burn out, not around.
        const tangX = -oz, tangZ = ox;
        const vTan = vx * tangX + vz * tangZ;
        const ax = ox * site.recovery.assistAccel - tangX * vTan * site.recovery.tangentialDamp;
        const az = oz * site.recovery.assistAccel - tangZ * vTan * site.recovery.tangentialDamp;
        queuePhysicsImpulse(player, { x: ax * mass * dt, y: 0, z: az * mass * dt });
        // The heat cost — the burn itself cooks you a little more on the way out.
        rec.heat = Math.min(1, rec.heat + site.recovery.heatSpike * dt);
      }
    }
    if (burning !== rt.player.recoveryBurn) {
      rt.player.recoveryBurn = burning;
      this.bus.emit('planet:recoveryBurn', { on: burning, siteId: rt.siteId });
    }
  },

  // ── skim harvest (yield = path × density through the explicit collector) ──────────────────────

  _tickHarvest(dt, state, rt, site, ) {
    const actions = state.input && state.input.actions;
    const player = state.entities.get(state.playerId);
    const rec = rt.player;
    if (!player || player.alive === false) return;

    if (actions && actions.toggleSkimCollector) {
      actions.toggleSkimCollector = false;
      rec.collectorOn = !rec.collectorOn;
      this.bus.emit('planet:collector', { on: rec.collectorOn, siteId: rt.siteId });
      this.bus.emit('audio:cue', { id: rec.collectorOn ? 'confirm' : 'ui_deny', gain: 0.5 });
    }
    if (!rec.collectorOn) return;

    const region = rec.region;
    const inSkim = region === 'skim';
    const inDanger = region === 'danger';
    if (!inSkim && !inDanger) return;

    const speed = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));
    if (speed < site.harvest.minSpeed) return; // path × density: parked ships gather nothing

    const path = speed * dt; // WU flown this tick — THE yield driver (never a hold timer)
    if (inDanger) rec.pendingRich += path * site.harvest.densityDanger;
    else rec.pendingShallow += path * site.harvest.densitySkim;

    // Settle whole units through the cargo owner (mining idiom, partial-add honest).
    const cargoSys = this.registry && this.registry.get ? this.registry.get('cargo') : null;
    if (!cargoSys || typeof cargoSys.addCargo !== 'function') return;
    this._settle(rt, rec, cargoSys, 'pendingShallow', site.harvest.commodityShallow);
    this._settle(rt, rec, cargoSys, 'pendingRich', site.harvest.commodityRich);
  },

  _settle(rt, rec, cargoSys, key, commodityId) {
    const whole = Math.floor(rec[key]);
    if (whole < 1) return;
    const got = cargoSys.addCargo(commodityId, whole);
    const accepted = Number.isFinite(got) ? got : (got ? whole : 0);
    rec[key] -= whole;
    if (accepted > 0) {
      rec.harvestedUnits += accepted;
      rt.telemetry.harvestUnits += accepted;
      this.bus.emit('planet:harvest', { commodityId, qty: accepted, siteId: rt.siteId });
      this._emitHarvestMotes(rt, rec, commodityId, accepted);
    }
    if (accepted < whole) {
      this.bus.emit('planet:harvestDenied', { commodityId, reason: 'cargo_full', siteId: rt.siteId });
    }
  },

  // Harvest motes (bible §7.1: yield = path × density MADE VISIBLE — bright flecks drifting from
  // the band into the collector). One directional cue per settled batch through the shipped
  // presentation lane (pooled, bounded, flash-reduced automatically) — mote rate IS the yield rate.
  _emitHarvestMotes(rt, rec, commodityId, qty) {
    const state = this.state;
    const player = state.entities.get(state.playerId);
    if (!player) return;
    const vx = finite(player.vel && player.vel.x), vz = finite(player.vel && player.vel.z);
    const sp = Math.hypot(vx, vz) || 1;
    const fx = vx / sp, fz = vz / sp;
    // Deterministic side alternation (pattern idiom — the running unit count, never Math.random).
    const side = (rec.harvestedUnits & 1) === 0 ? 1 : -1;
    const px = player.pos.x + fx * 10 - fz * 22 * side;
    const pz = player.pos.z + fz * 10 + fx * 22 * side;
    const dx = player.pos.x - px, dz = player.pos.z - pz;
    const dl = Math.hypot(dx, dz) || 1;
    this.bus.emit('presentation:vfxCue', {
      id: 'planet.harvest.mote',
      lane: 'field',
      particles: Math.min(10, 3 + qty * 2),
      magnitude: 0.5,
      radius: 8,
      position: { x: px, z: pz },
      direction: { x: dx / dl, z: dz / dl },
      material: 'energy',
      color: commodityId === 'cmdty_gas_helium3' ? '#ffb35c' : '#9fd8e8',
      flashReduced: true,
    });
  },

  _expireAftermath(state, rt) {
    if (!rt.aftermath.length) return;
    const now = nowOf(state);
    while (rt.aftermath.length && rt.aftermath[0].until <= now) rt.aftermath.shift();
  },

  // ── diagnostics (perf contract: shares + counters declared) ───────────────────────────────────

  inspect() {
    const rt = this.state ? ensureRuntime(this.state) : null;
    return {
      active: !!(rt && rt.active),
      siteId: rt && rt.siteId,
      zoneId: rt && rt.zoneId,
      trackedShips: rt ? Object.keys(rt.ships).length : 0,
      maxTracked: MAX_TRACKED_SHIPS,
      playerRegion: rt && rt.player.region,
      playerHeat: rt && rt.player.heat,
      playerStage: rt && rt.player.stage,
      telemetry: rt && rt.telemetry,
    };
  },
};

export default planetRuntime;
