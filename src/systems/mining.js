// Mining system (ARCHITECTURE §2.3 step 9). Owns asteroid extraction, ore ejection as
// collectible pickups, the magnet auto-collect pull, and wreck salvage.
//
// Drive: the player holds RIGHT-MOUSE / gamepad LT / touch MINE -> state.input.fireGroup === 2.
// The active mining beam
// runtime lives on state.player.miningBeam (gameState §3.5); we also honor a per-entity
// entity.data.miningBeam override if a future ships/outfitting pass writes one there.
//
// Each tick we shave miningBeam.dps*dt ore-HP off the soft-locked asteroid, accrue fractional
// ore, and release whole units in 25% ejection bursts (+ a final flush on destruction). Released
// ore either spawns drifting 'pickup' entities (magnet-pulled to the ship) or, when the beam has
// directToCargo, is credited straight to cargo. Salvage drains a wreck's pool the same way.
//
// Determinism (§0.5): all weighted ore rolls use state.rng() — never Math.random().
// Single-writer (§0.6): cargo is owned by the cargo module; we route ore through its addCargo
// helper / pickup:collected event and only fall back to a direct write while cargo is a stub.
import { ORES, ASTEROIDS, BEAMS, deriveAsteroidSeams } from '../data/mining.js';
import { COMMODITIES } from '../data/commodities.js';
import { MODULES } from '../data/modules.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';

export const MAGNET_RANGE = 420; // wu pull radius for Mining 2.0's stronger ore vacuum
export const MAGNET_ACCEL = 520; // wu/s² pull toward ship inside magnetRange
export const RICH_CORE_CHANCE = 0.15;
export const RICH_CORE_DURATION_S = 3.5;
export const RICH_CORE_WINDOW_LO = 0.12;
export const RICH_CORE_WINDOW_HI = 0.22;
export const BULK_HAUL_MIN_U = 20;
export const BULK_HAUL_PAY_MULT = 0.8;
export const BULK_HAUL_REFINERY_FEE = 0.06;
const MAGNET_MAX_SPEED = 210;   // wu/s cap on pulled pickups
const PICKUP_RADIUS = 2.2;      // wu collectible radius
const PICKUP_TTL = 90;          // s before an uncollected pickup despawns
const SALVAGE_TIME_DEFAULT = 6; // s to fully drain a wreck if combat didn't set one
const MINEABLE_QUERY_RADIUS_PAD = 64;
const SEAM_HIT_RADIUS = 14;
export const SEAM_YIELD_OFF = 0.35;
const SEAM_HIT_EVENT_INTERVAL = 0.5;
const BEAM_PICKUP_DIRECT_RADIUS = 60;
const MINING_NOISE_GAIN_PER_S = 8;
const MINING_NOISE_DECAY_PER_S = 3;
const MINING_NOISE_DANGER = 70;

const ORE_BY_ID = new Map(ORES.map((o) => [o.id, o]));
const AST_BY_ID = new Map(ASTEROIDS.map((a) => [a.id, a]));
const BEAM_BY_ID = new Map(BEAMS.map((b) => [b.id, b]));
const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));

export const mining = {
  name: 'mining',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    this._pickupScratch = [];
    this._mineableScratch = [];
    this._diag = {
      pickupScans: 0,
      pickupSpatialQueries: 0,
      pickupCandidates: 0,
      pickupsMagnetized: 0,
      pickupsCollected: 0,
      targetSpatialQueries: 0,
      targetCandidates: 0,
    };

    this._beaming = false;     // was the player beam active last tick (start/stop edges)
    this._lockTargetId = null; // currently soft-locked asteroid/wreck id
    this._activeBeamLine = null;

    const bus = this.bus;
    // Combat spawns a wreck on ship death so the player can salvage it.
    bus.on('entity:killed', (p) => this._onShipDestroyed(p));
    // Combat loot drops → materialize as collectible pickups (shared pickup path).
    bus.on('loot:drop', (p) => this._onLootDrop(p));
    // Collect ore/cargo pickups into the hold (physics emits this on contact; we also self-emit).
    bus.on('pickup:collected', (p) => this._onPickupCollected(p));
    bus.on('dock:docked', (p) => this._onDocked(p));
    // Fresh sector → drop the stale beam lock (world regenerates the field).
    bus.on('sector:enter', () => { this._lockTargetId = null; this._stopBeam(); });
  },

  // ---- main per-tick update -------------------------------------------------
  update(dt, state) {
    resetMiningDiagnostics(this._diag);
    const player = state.entities.get(state.playerId);
    const firing = !!player && player.alive && !player.flags.docked
      && state.mode === 'flight' && state.input.fireGroup === 2;

    if (player) {
      const beam = this._beamRuntime(player);
      if (firing && beam) this._runPlayerBeam(player, beam, dt, state);
      else {
        this._stopBeam();
      }
    }
    this._updateRichCoreCharge(firing, dt, state);
    this._updateMiningNoise(this._beaming, dt, state);

    this._updatePickups(dt, state);
  },

  // ---- beam runtime resolution ----------------------------------------------
  // The beam's mutable runtime (directToCargo/tierId) lives on the player record;
  // dps/range come from the BEAMS tier table keyed by tierId.
  _beamRuntime(player) {
    const beam = (player.data && player.data.miningBeam) || this.state.player.miningBeam;
    if (!beam) return null;
    const tier = BEAM_BY_ID.get(beam.tierId) || BEAM_BY_ID.get('beam_mk1');
    if (tier) {
      if (!beam.dps) beam.dps = tier.dps;
      if (!beam.range) beam.range = tier.range;
    }
    delete beam.heat;
    delete beam.heatRate;
    delete beam.coolRate;
    delete beam.overheated;
    delete beam._heat;
    delete beam.heatMax;
    return beam;
  },

  _runPlayerBeam(player, beam, dt, state) {
    const target = this._acquireTarget(player, beam.range, state);
    if (!target) { this._stopBeam(); return; }

    // start edge (or re-lock onto a different rock)
    if (!this._beaming || this._lockTargetId !== target.id) {
      this._lockTargetId = target.id;
      this.bus.emit('mining:start', { minerId: player.id, targetId: target.id, position: { x: target.pos.x, z: target.pos.z } });
    }
    this._beaming = true;

    this._activeBeamLine = beamLineFor(player, target);

    const dps = (beam.dps || 18) * (beam.directToCargo ? 1.08 : 1);
    if (target.type === 'wreck') this._drainWreck(player, target, dps, dt);
    else this.applyMining(target.id, dps, dt, player.id);
  },

  _stopBeam() {
    if (!this._beaming) {
      this._activeBeamLine = null;
      return;
    }
    this._beaming = false;
    this._activeBeamLine = null;
    this.bus.emit('mining:stop', { minerId: this.state.playerId, targetId: this._lockTargetId, position: null });
  },

  // Nearest mineable target (asteroid or salvageable wreck) within range, biased toward aim.
  _acquireTarget(ship, range, state) {
    const tetherTarget = activeMineableTetherTarget(state, ship, range);
    if (tetherTarget !== undefined) return tetherTarget;

    const aim = state.input.aimAngle || 0;
    const ax = Math.cos(aim), az = Math.sin(aim);
    let best = null, bestScore = -Infinity;
    const mineables = mineablesNearShip(state, ship, range + MINEABLE_QUERY_RADIUS_PAD, this._mineableScratch);
    this._diag.targetSpatialQueries = mineables === this._mineableScratch ? 1 : 0;
    this._diag.targetCandidates = mineables.length;
    for (const e of mineables) {
      if (!e.alive) continue;
      if (e.type !== 'asteroid' && e.type !== 'wreck') continue;
      if (e.type === 'asteroid' && e.data && e.data.respawnAt != null) continue; // mined-out, awaiting respawn
      const dx = e.pos.x - ship.pos.x, dz = e.pos.z - ship.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + (e.radius || 0)) continue;
      const inv = 1 / (dist || 1);
      const dot = (dx * inv) * ax + (dz * inv) * az; // -1..1 alignment with the aim direction
      // alignment dominates so the cursor picks the rock; nearer breaks ties.
      const score = dot * 2 - dist / Math.max(1, range);
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  },

  // ---- core extraction (callable so mining drones reuse the exact mechanic) --
  // Shave ore-HP, accrue fractional ore, release whole units on 25% ejection steps + final burst.
  // Returns the number of ore units released this call.
  applyMining(targetId, dps, dt, minerId = this.state.playerId) {
    const state = this.state;
    const ast = state.entities.get(targetId);
    if (!ast || !ast.alive || ast.type !== 'asteroid') return 0;
    const d = ast.data || (ast.data = {});
    this._ensureAsteroidSeams(ast);

    // Normalize ore-HP fields from whatever the spawner gave us (bootstrap uses oreHP/oreHPMax).
    const hpMax = d.oreHPMax || d.oreHP || ast.hullMax || 1;
    if (d.oreHPMax == null) d.oreHPMax = hpMax;
    if (d.oreHP == null) d.oreHP = (ast.hull != null && ast.hull > 0) ? ast.hull : hpMax;

    const def = AST_BY_ID.get(d.typeId) || AST_BY_ID.get('ast_common_rock');
    const yieldTotal = d.yieldU != null ? d.yieldU : this._defaultYield(def, hpMax);
    if (d.yieldU == null) d.yieldU = yieldTotal;
    if (d.isChunk && bulkChunkMass(ast) > BULK_HAUL_MIN_U) {
      this.bus.emit('mining:bulkRequiresTether', {
        asteroidId: ast.id,
        massU: bulkChunkMass(ast),
        commodityId: d.commodityId || this._dominantOre(def),
      });
      return 0;
    }
    if (d.pctEjected == null) d.pctEjected = 0;
    if (d._oreCarry == null) d._oreCarry = 0; // fractional ore awaiting a whole unit

    const miner = state.entities.get(minerId);
    const contact = this._beamContactPoint(ast, miner);
    const seam = this._seamYield(ast, contact);
    if (seam.onSeam) this._emitSeamHit(ast, d, state);

    const before = d.oreHP;
    d.oreHP = Math.max(0, d.oreHP - dps * seam.mult * dt);
    ast.hull = d.oreHP; // keep the hull alias in sync
    const lost = before - d.oreHP;
    if (lost <= 0) return 0;

    this.bus.emit('mining:tick', {
      contactPos: contact,
      oreType: this._dominantOre(def),
      seamHit: seam.onSeam,
      yieldMult: seam.mult,
    });

    // Continuous ore delivery (Mining 2.0 feel fix — see design/WORLD_OVERHAUL_2_1.md §Mining).
    // Convert the ore-HP shaved THIS tick straight into fractional ore units and release whole
    // units as they accrue, so gain trickles in lockstep with beam damage. Previously ore only
    // ejected when cumulative loss crossed 25% thresholds (EJECT_STEP), so the player saw long
    // silent beams punctuated by lump "dumps". Total yield is unchanged: Σ(per-tick loss) == hpMax,
    // so Σ(release) == hpMax * (yieldTotal / hpMax) == yieldTotal. Seam hits raise `lost` (via
    // seam.mult), so mining a seam simply delivers the same total ore faster.
    const pctNow = 1 - d.oreHP / hpMax;
    const destroyed = d.oreHP <= 0;
    const yieldPerHp = hpMax > 0 ? yieldTotal / hpMax : 0;
    d._oreCarry += lost * yieldPerHp;
    d.pctEjected = destroyed ? 1 : pctNow; // kept in sync for telemetry/readers
    d.miningWear = destroyed ? 1 : pctNow; // render hint: 0 = pristine, 1 = spent (progressive shrink/darken)
    let releaseUnits = Math.floor(d._oreCarry + 1e-9);
    d._oreCarry -= releaseUnits;
    if (destroyed && d._oreCarry > 1e-6) {
      releaseUnits += 1; // flush the final fractional remainder so small rocks still yield their last unit
      d._oreCarry = 0;
    }

    if (releaseUnits > 0) this._releaseOre(ast, def, releaseUnits, miner);

    if (destroyed) {
      if (!d.isChunk) {
        this._fractureAsteroid(ast, def, miner);
        this._maybeExposeRichCore(ast, def, miner);
      }
      this.bus.emit('asteroid:destroyed', { id: ast.id, typeId: d.typeId || (def && def.id), pos: { x: ast.pos.x, z: ast.pos.z } });
      d.respawnAt = state.simTime + ((def && def.respawnSec) || 90); // world reads this to repopulate
      ast.alive = false;
    }
    return releaseUnits;
  },

  // Release `units` of ore: roll each unit's commodity from the asteroid's weighted table
  // (tier-gated, renormalized), then either credit cargo directly or eject magnet pickups.
  _releaseOre(ast, def, units, miner) {
    const beam = miner ? this._beamRuntime(miner) : null;
    const direct = !!(beam && beam.directToCargo) && miner && miner.id === this.state.playerId;
    const buckets = new Map(); // collapse a burst of N units into a few pickups / yields
    for (let i = 0; i < units; i++) {
      const id = this._rollOre(def, ast);
      if (!id) continue;
      buckets.set(id, (buckets.get(id) || 0) + 1);
    }
    for (const [commodityId, qty] of buckets) {
      this.bus.emit('mining:yield', { commodityId, qty, pos: { x: ast.pos.x, z: ast.pos.z }, minerId: miner ? miner.id : null });
      if (direct) this._giveCargo(commodityId, qty, miner.id);
      else this._spawnPickup(ast, commodityId, qty);
    }
  },

  // weighted, tier-filtered ore pick using the deterministic sim RNG
  _rollOre(def, ast) {
    const table = (def && def.oreTable) || { cmdty_silicate: 0.7, cmdty_ore_iron: 0.3 };
    const tierCap = (ast.data && ast.data.tierCap != null) ? ast.data.tierCap : (def ? def.tierCap : 0);
    let total = 0;
    const entries = [];
    for (const id in table) {
      const ore = ORE_BY_ID.get(id);
      if (ore && ore.tier > tierCap) continue; // gated out → renormalize by skipping
      total += table[id];
      entries.push([id, table[id]]);
    }
    if (!entries.length || total <= 0) return 'cmdty_silicate'; // never drop nothing
    let r = this.state.rng() * total;
    for (const [id, w] of entries) { r -= w; if (r <= 0) return id; }
    return entries[entries.length - 1][0];
  },

  // ---- pickups: spawn + magnet pull + collection ----------------------------
  _spawnPickup(srcEnt, commodityId, amount) {
    const rng = this.state.rng;
    const ang = rng() * Math.PI * 2;
    const r = (srcEnt.radius || 6) + 2 + rng() * 4;
    const speed = 8 + rng() * 10;
    this.helpers.spawnEntity({
      type: 'pickup',
      pos: { x: srcEnt.pos.x + Math.cos(ang) * r, z: srcEnt.pos.z + Math.sin(ang) * r },
      vel: { x: Math.cos(ang) * speed, z: Math.sin(ang) * speed },
      radius: PICKUP_RADIUS, mass: 0.1, collides: true,
      data: { kind: 'ore', commodityId, amount, despawnAt: this.state.simTime + PICKUP_TTL },
    });
  },

  _updatePickups(dt, state) {
    const player = state.entities.get(state.playerId);
    if (!player) return;
    const magnet = Math.max(MAGNET_RANGE, state.player.magnetRange || 0);
    const collectRadius = (player.radius || 6) + 4;
    const queryRadius = Math.max(magnet, collectRadius) + PICKUP_RADIUS;
    const pickups = pickupsNearPlayer(state, player, queryRadius, this._pickupScratch);
    this._diag.pickupScans = 1;
    this._diag.pickupSpatialQueries = pickups === this._pickupScratch ? 1 : 0;
    this._diag.pickupCandidates = pickups.length;
    this._diag.pickupsMagnetized = 0;
    this._diag.pickupsCollected = 0;
    for (const e of pickups) {
      if (!e.alive || e.type !== 'pickup') continue;
      if (this._collectPickupOnBeamLine(e, player)) {
        this._diag.pickupsCollected++;
        continue;
      }
      const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz) || 1e-4;
      if (dist <= magnet) {
        e.vel.x += (dx / dist) * MAGNET_ACCEL * dt;
        e.vel.z += (dz / dist) * MAGNET_ACCEL * dt;
        const sp = Math.hypot(e.vel.x, e.vel.z);
        if (sp > MAGNET_MAX_SPEED) { const s = MAGNET_MAX_SPEED / sp; e.vel.x *= s; e.vel.z *= s; }
        this._diag.pickupsMagnetized++;
      }
      // direct collect on overlap (physics also emits pickup:collected on contact; idempotent via alive guard)
      if (dist <= collectRadius) {
        e.alive = false;
        this._diag.pickupsCollected++;
        this.bus.emit('pickup:collected', {
          pickupId: e.id, collectorId: player.id, kind: (e.data && e.data.kind) || 'ore',
          amount: (e.data && e.data.amount) || 1, commodityId: e.data && e.data.commodityId,
          pos: { x: e.pos.x, z: e.pos.z },
        });
      }
    }
    state.miningRuntime = state.miningRuntime || {};
    state.miningRuntime.diagnostics = this._diag;
  },

  _onPickupCollected(p) {
    if (!p || !p.commodityId) return;
    if (p.collectorId !== this.state.playerId) return; // drones manage their own holds
    const cargoSys = this.registry && this.registry.get && this.registry.get('cargo');
    if (cargoSys && typeof cargoSys.addCargo === 'function') return; // cargo owns collected pickups
    const kind = p.kind || 'ore';
    if (kind === 'credits' || kind === 'module') return; // economy/ships own those
    const accepted = this._giveCargo(p.commodityId, p.amount || 1, p.collectorId);
    if (accepted <= 0) this.bus.emit('cargo:full', { commodityId: p.commodityId });
  },

  // ---- wreck salvage --------------------------------------------------------
  _onShipDestroyed(p) {
    if (!p) return;
    const isShip = p.type === 'ship' || p.victimClass === 'ship';
    if (!isShip) return;
    const pos = p.pos || { x: 0, z: 0 };
    this.helpers.spawnEntity({
      type: 'wreck', pos: { x: pos.x, z: pos.z }, radius: 7, mass: 1e6,
      hull: 1, hullMax: 1,
      data: { parentType: 'ship', loot: [], salvagePool: this._lootToPool(), salvageTimeLeft: SALVAGE_TIME_DEFAULT },
    });
  },

  // Default salvage contents for a destroyed ship (scrap + a chance of electronics).
  _lootToPool() {
    const rng = this.state.rng;
    const pool = { cmdty_scrap_metal: 2 + Math.floor(rng() * 3) };
    if (rng() < 0.5) pool.cmdty_salvage_electronics = 1;
    return pool;
  },

  _drainWreck(player, wreck, dps, dt) {
    const d = wreck.data || (wreck.data = {});
    const pool = d.salvagePool || (d.salvagePool = {});
    if (d.salvageTimeLeft == null) d.salvageTimeLeft = SALVAGE_TIME_DEFAULT;
    if (d._total == null) d._total = Object.values(pool).reduce((a, b) => a + b, 0);
    if (d._carry == null) d._carry = 0;

    // drain proportionally over the salvage time, scaled by beam dps relative to the mk1 baseline
    const frac = (dt * Math.max(1, dps) / 18) / Math.max(0.001, SALVAGE_TIME_DEFAULT);
    d._carry += (d._total || 0) * frac;
    d.salvageTimeLeft = Math.max(0, d.salvageTimeLeft - dt);

    let remaining = Object.values(pool).reduce((a, b) => a + b, 0);
    let release = Math.floor(d._carry);
    if (d.salvageTimeLeft <= 0) release = remaining; // flush the rest at the end
    if (release > remaining) release = remaining;

    const got = {};
    let n = release;
    for (const id in pool) {
      if (n <= 0) break;
      const take = Math.min(pool[id], n);
      if (take > 0) { pool[id] -= take; got[id] = (got[id] || 0) + take; n -= take; d._carry -= take; }
    }
    for (const id in got) {
      this.bus.emit('mining:yield', { commodityId: id, qty: got[id], pos: { x: wreck.pos.x, z: wreck.pos.z }, minerId: player ? player.id : null });
      this._spawnPickup(wreck, id, got[id]);
    }

    remaining = Object.values(pool).reduce((a, b) => a + b, 0);
    if (d.salvageTimeLeft <= 0 || remaining <= 0) {
      this.bus.emit('salvage:completed', { wreckId: wreck.id, loot: got });
      // Mark recovered so the intervention loop reports recovered=true (it reads e.data._salvaged).
      // _drainWreck only runs while the player's salvage beam is on the wreck, so reaching completion
      // here means the player did recover cargo (vs an untouched wreck despawning).
      d._salvaged = true;
      wreck.alive = false;
      this._stopBeam();
    }
  },

  _onLootDrop(p) {
    if (!p) return;
    const pos = p.pos || { x: 0, z: 0 };
    const stub = { pos: { x: pos.x, z: pos.z }, radius: 4 };
    for (const it of (p.items || [])) {
      if (it && it.commodityId) this._spawnPickup(stub, it.commodityId, it.qty || 1);
    }
  },

  _fractureAsteroid(ast, def, miner) {
    if (!ast || !ast.data || ast.data.isChunk) return;
    const rng = this.state.rng;
    const parentRadius = Math.max(1, ast.radius || (ast.data && ast.data.size) || 6);
    const parentHp = Math.max(1, ast.data.oreHPMax || ast.hullMax || ast.hull || 1);
    const parentYield = Math.max(1, ast.data.yieldU || this._defaultYield(def, parentHp));
    const count = 2 + Math.floor(rng() * 2);
    const parentSeams = Array.isArray(ast.data.seams) ? ast.data.seams : [];
    const seamCount = Math.max(1, parentSeams.length - 1);
    for (let i = 0; i < count; i++) {
      const ratio = 0.35 + rng() * 0.15;
      const radius = parentRadius * ratio;
      const ang = (Math.PI * 2 * i) / count + rng() * 0.6;
      const dist = parentRadius * 0.45 + radius + 4;
      const oreHP = Math.max(4, Math.round(parentHp * ratio / count));
      const yieldU = Math.max(1, Math.round(parentYield * ratio / count));
      const chunk = this.helpers.spawnEntity({
        type: 'asteroid',
        pos: {
          x: ast.pos.x + Math.cos(ang) * dist,
          z: ast.pos.z + Math.sin(ang) * dist,
        },
        radius,
        mass: Math.max(40, (ast.mass || 200) * ratio / count),
        angVel: (rng() - 0.5) * 0.45,
        hull: oreHP,
        hullMax: oreHP,
        collides: true,
        data: {
          typeId: ast.data.typeId || (def && def.id) || 'ast_common_rock',
          tier: ast.data.tier,
          tierCap: ast.data.tierCap,
          oreHP,
          oreHPMax: oreHP,
          yieldU,
          bulkMassU: yieldU,
          commodityId: this._dominantOre(def),
          basePrice: commodityBasePrice(this._dominantOre(def)),
          size: radius,
          pctEjected: 0,
          respawnSec: ast.data.respawnSec,
          fieldId: ast.data.fieldId,
          isChunk: true,
        },
      });
      chunk.data.seams = inheritChunkSeams(parentSeams, seamCount, radius, i);
      if (ast.data.scanHighlightUntil != null && ast.data.scanHighlightUntil > this.state.simTime) {
        chunk.data.scanHighlightUntil = ast.data.scanHighlightUntil;
        chunk.data.scanOreGlyph = ast.data.scanOreGlyph;
      }
      this.bus.emit('asteroid:chunked', {
        parentId: ast.id,
        chunkId: chunk.id,
        minerId: miner ? miner.id : null,
      });
    }
  },

  _maybeExposeRichCore(ast, def, miner) {
    const plan = richCorePlan(this.state && this.state.meta && this.state.meta.seed, ast, def);
    if (!plan.hasCore) return null;
    const runtime = this.state.player.mining || (this.state.player.mining = {});
    const core = {
      id: 'rich_core:' + ast.id,
      asteroidId: ast.id,
      commodityId: plan.commodityId,
      multiplier: plan.multiplier,
      windowPct: clamp(plan.windowPct + playerModSum(this.state, 'richCoreRingPctBonus'), RICH_CORE_WINDOW_LO, 0.5),
      durationS: RICH_CORE_DURATION_S,
      openedAt: this.state.simTime,
      expiresAt: this.state.simTime + RICH_CORE_DURATION_S,
      chargeStartedAt: null,
      resolved: false,
    };
    runtime.richCore = core;
    this.bus.emit('mining:richCoreExposed', {
      asteroidId: ast.id,
      commodityId: core.commodityId,
      multiplier: core.multiplier,
      windowPct: core.windowPct,
      durationS: core.durationS,
      minerId: miner ? miner.id : null,
    });
    return core;
  },

  _updateRichCoreCharge(firing, dt, state) {
    const runtime = state && state.player && state.player.mining;
    const core = runtime && runtime.richCore;
    if (!core || core.resolved) return;
    if (state.simTime > core.expiresAt) {
      this._resolveRichCore(core, 1);
      return;
    }
    if (firing) {
      if (core.chargeStartedAt == null) {
        core.chargeStartedAt = state.simTime;
        this.bus.emit('mining:richCoreChargeStart', { asteroidId: core.asteroidId });
      }
      core.chargeT = clamp(state.simTime - core.chargeStartedAt, 0, core.durationS);
      return;
    }
    if (core.chargeStartedAt != null) {
      const progress = clamp((state.simTime - core.chargeStartedAt) / Math.max(0.001, core.durationS), 0, 1);
      this._resolveRichCore(core, progress);
    }
  },

  _resolveRichCore(core, progress) {
    if (!core || core.resolved) return null;
    const half = Math.max(0, Number(core.windowPct) || RICH_CORE_WINDOW_LO) * 0.5;
    const hit = Math.abs((Number(progress) || 0) - 0.5) <= half;
    core.resolved = true;
    let qty = 0;
    if (hit) {
      qty = Math.max(3, Math.min(8, Math.round(core.multiplier || 3)));
      this._giveCargo(core.commodityId, qty, this.state.playerId);
      this.bus.emit('mining:yield', { commodityId: core.commodityId, qty, minerId: this.state.playerId, richCore: true });
      this.bus.emit('mining:richCoreCompleted', { asteroidId: core.asteroidId, commodityId: core.commodityId, qty, multiplier: qty });
    } else {
      this.bus.emit('mining:richCoreFizzle', { asteroidId: core.asteroidId, commodityId: core.commodityId });
      this.bus.emit('audio:cue', { id: 'mining_core_fizzle' });
    }
    if (this.state.player && this.state.player.mining && this.state.player.mining.richCore === core) {
      delete this.state.player.mining.richCore;
    }
    return { hit, qty, commodityId: core.commodityId };
  },

  _onDocked(p) {
    const stationId = p && p.stationId;
    if (!stationId || !isRefineryStation(this.state, stationId)) return;
    const chunk = this._activeBulkChunk();
    if (!chunk) return;
    const payout = bulkHaulPayoutForChunk(chunk);
    if (!(payout.credits > 0)) return;
    chunk.alive = false;
    this.bus.emit('economy:grantCredits', { amount: payout.credits, reason: 'mining:bulk_haul' });
    this.bus.emit('mining:bulkHaulDelivered', {
      stationId,
      chunkId: chunk.id,
      massU: payout.massU,
      commodityId: payout.commodityId,
      basePrice: payout.basePrice,
      gross: payout.gross,
      fee: payout.fee,
      credits: payout.credits,
    });
  },

  _activeBulkChunk() {
    const state = this.state;
    const tether = state.player && state.player.tether;
    const ids = [];
    if (tether && tether.targetId != null) ids.push(tether.targetId);
    if (tether && tether.attachedId != null) ids.push(tether.attachedId);
    const attach = state.combat && state.combat.attachments;
    const byId = attach && attach.byId || {};
    for (const id in byId) {
      const a = byId[id];
      if (a && (a.ownerId === state.playerId || a.sourceId === state.playerId) && (a.targetId != null || a.bodyBId != null)) {
        ids.push(a.targetId != null ? a.targetId : a.bodyBId);
      }
    }
    for (const id of ids) {
      const e = state.entities.get(id);
      if (isBulkHaulChunk(e)) return e;
    }
    return null;
  },

  _collectPickupOnBeamLine(pickup, player) {
    const line = this._activeBeamLine;
    if (!line || !pickup || !pickup.data || !pickup.data.commodityId) return false;
    if (pointSegmentDistanceSq(pickup.pos.x, pickup.pos.z, line.ax, line.az, line.bx, line.bz) >
      BEAM_PICKUP_DIRECT_RADIUS * BEAM_PICKUP_DIRECT_RADIUS) return false;
    const requested = Math.max(0, Math.floor(pickup.data.amount || 1));
    if (requested <= 0) return false;
    const accepted = this._giveCargo(pickup.data.commodityId, requested, player.id);
    if (accepted >= requested) {
      pickup.alive = false;
      return true;
    }
    if (accepted > 0) {
      pickup.data.amount = requested - accepted;
      return true;
    }
    this.bus.emit('cargo:full', { commodityId: pickup.data.commodityId });
    return false;
  },

  // ---- cargo bridge (single-writer aware) -----------------------------------
  // Prefer the cargo module's writer; fall back to a direct, conservative write while cargo is a
  // stub so the early loop (mine → fill hold) is demonstrable. When cargo becomes real it wins.
  _giveCargo(commodityId, qty, collectorId) {
    if (qty <= 0) return 0;
    const cargoSys = this.registry && this.registry.get && this.registry.get('cargo');
    if (cargoSys && typeof cargoSys.addCargo === 'function') {
      const got = cargoSys.addCargo(commodityId, qty);
      if (got > 0) return got;
    }
    if (collectorId != null && collectorId !== this.state.playerId) return 0;
    return this._directAddCargo(commodityId, qty);
  },

  _directAddCargo(commodityId, qty) {
    const cargo = this.state.player.cargo;
    if (!cargo) return 0;
    if (!cargo.items) cargo.items = {};
    const ore = ORE_BY_ID.get(commodityId);
    const vol = (ore && ore.vol) || 1;
    const mass = (ore && ore.mass) || 1;
    const cap = cargo.capVolume || 40;
    const free = cap - (cargo.usedVolume || 0);
    const accepted = Math.max(0, Math.min(qty, Math.floor(free / vol)));
    if (accepted <= 0) return 0;
    cargo.items[commodityId] = (cargo.items[commodityId] || 0) + accepted;
    cargo.usedVolume = (cargo.usedVolume || 0) + accepted * vol;
    cargo.usedMass = (cargo.usedMass || 0) + accepted * mass;
    this.bus.emit('cargo:changed', { cargo, usedU: cargo.usedVolume, massT: cargo.usedMass });
    return accepted;
  },

  // ---- helpers --------------------------------------------------------------
  _updateMiningNoise(beaming, dt, state) {
    if (!state || !state.player) return;
    const before = clamp(state.player.miningNoise || 0, 0, 100);
    const delta = (beaming ? MINING_NOISE_GAIN_PER_S : -MINING_NOISE_DECAY_PER_S) * dt;
    const after = clamp(before + delta, 0, 100);
    state.player.miningNoise = after;
    if (before <= MINING_NOISE_DANGER && after > MINING_NOISE_DANGER) {
      this.bus.emit('danger:miningNoise', { level: after });
    }
  },

  _ensureAsteroidSeams(ast) {
    const d = ast && ast.data || null;
    if (!d) return [];
    if (Array.isArray(d.seams)) return d.seams;
    d.seams = deriveAsteroidSeams(this.state.meta.seed, ast.id, ast.radius || d.size || 1, {
      hash32: this.helpers && this.helpers.hash32,
      mulberry32: this.helpers && this.helpers.mulberry32,
    });
    return d.seams;
  },

  _beamContactPoint(ast, miner) {
    if (!miner) return { x: ast.pos.x, z: ast.pos.z };
    const aim = this.state.input && Number.isFinite(this.state.input.aimAngle)
      ? this.state.input.aimAngle
      : Math.atan2(ast.pos.z - miner.pos.z, ast.pos.x - miner.pos.x);
    const hit = rayCircleContact(miner.pos, aim, ast.pos, ast.radius || 6);
    return hit || this._surfacePoint(ast, miner);
  },

  _seamYield(ast, contact) {
    const seams = this._ensureAsteroidSeams(ast);
    if (!seams.length || !contact) return { onSeam: false, mult: SEAM_YIELD_OFF };
    const hitR2 = SEAM_HIT_RADIUS * SEAM_HIT_RADIUS;
    for (const seam of seams) {
      const p = seamWorldPoint(ast, seam);
      const dx = contact.x - p.x;
      const dz = contact.z - p.z;
      if (dx * dx + dz * dz <= hitR2) return { onSeam: true, mult: 1 };
    }
    return { onSeam: false, mult: SEAM_YIELD_OFF };
  },

  _emitSeamHit(ast, data, state) {
    const last = data._lastSeamHitEventAt;
    if (last != null && state.simTime - last < SEAM_HIT_EVENT_INTERVAL) return;
    data._lastSeamHitEventAt = state.simTime;
    this.bus.emit('mining:seamHit', { asteroidId: ast.id });
  },

  _defaultYield(def, hpMax) {
    if (!def || !def.yieldU) return Math.max(1, Math.round(hpMax / 20));
    const [yLo, yHi] = def.yieldU;
    const [hpLo, hpHi] = def.hp || [hpMax, hpMax];
    if (hpHi === hpLo) return yLo;
    const t = Math.max(0, Math.min(1, (hpMax - hpLo) / (hpHi - hpLo)));
    return Math.max(1, Math.round(yLo + (yHi - yLo) * t));
  },

  _dominantOre(def) {
    const table = (def && def.oreTable) || null;
    if (!table) return 'cmdty_silicate';
    let bestId = null, bestW = -1;
    for (const id in table) { if (table[id] > bestW) { bestW = table[id]; bestId = id; } }
    return bestId || 'cmdty_silicate';
  },

  _surfacePoint(ast, miner) {
    if (!miner) return { x: ast.pos.x, z: ast.pos.z };
    const dx = miner.pos.x - ast.pos.x, dz = miner.pos.z - ast.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const r = ast.radius || 6;
    return { x: ast.pos.x + (dx / d) * r, z: ast.pos.z + (dz / d) * r };
  },
};

function pickupsNearPlayer(state, player, radius, out) {
  return queryNearbyEntities(state, player.pos, radius, out,
    (state.entityIndex && state.entityIndex.pickups) || state.entityList);
}

function mineablesNearShip(state, ship, radius, out) {
  return queryNearbyEntities(state, ship.pos, radius, out,
    (state.entityIndex && state.entityIndex.mineables) || state.entityList);
}

function activeMineableTetherTarget(state, ship, range) {
  if (!state || !ship) return undefined;
  const ids = [];
  const tether = state.player && state.player.tether;
  if (tether && tether.active && tether.targetId != null) ids.push(tether.targetId);
  const attachments = state.combat && state.combat.attachments && state.combat.attachments.byId || {};
  for (const att of Object.values(attachments)) {
    if (!att || att.state !== 'active' || att.ownerId !== state.playerId || att.targetId == null) continue;
    if (att.defId !== 'tether_standard' && att.defId !== 'attachment_massline') continue;
    ids.push(att.targetId);
  }
  if (!ids.length) return undefined;
  for (const id of ids) {
    const target = state.entities && state.entities.get && state.entities.get(id);
    if (!target || !target.alive || (target.type !== 'asteroid' && target.type !== 'wreck')) continue;
    const dx = target.pos.x - ship.pos.x;
    const dz = target.pos.z - ship.pos.z;
    const dist = Math.hypot(dx, dz);
    const allowed = Math.max(0, Number(range) || 0) + (target.radius || 0) + (ship.radius || 0);
    return dist <= allowed ? target : null;
  }
  return undefined;
}

function resetMiningDiagnostics(diag) {
  if (!diag) return;
  diag.pickupScans = 0;
  diag.pickupSpatialQueries = 0;
  diag.pickupCandidates = 0;
  diag.pickupsMagnetized = 0;
  diag.pickupsCollected = 0;
  diag.targetSpatialQueries = 0;
  diag.targetCandidates = 0;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Number(n) || 0));
}

function beamLineFor(player, target) {
  return {
    ax: player.pos.x,
    az: player.pos.z,
    bx: target.pos.x,
    bz: target.pos.z,
  };
}

function rayCircleContact(origin, aim, center, radius) {
  const dx = Math.cos(aim);
  const dz = Math.sin(aim);
  const ox = origin.x - center.x;
  const oz = origin.z - center.z;
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - radius * radius;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t0 = (-b - root) / 2;
  const t1 = (-b + root) / 2;
  const t = t0 >= 0 ? t0 : t1 >= 0 ? t1 : null;
  if (t == null) return null;
  return { x: origin.x + dx * t, z: origin.z + dz * t };
}

function seamWorldPoint(ast, seam) {
  let local = seam && seam.localOffset || null;
  if (!local && seam && Number.isFinite(seam.offset)) {
    const angle = Number.isFinite(seam.angle) ? seam.angle : 0;
    local = { x: Math.cos(angle) * seam.offset, z: Math.sin(angle) * seam.offset };
  }
  local = local || { x: 0, z: 0 };
  const rot = ast.rot || 0;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return {
    x: ast.pos.x + local.x * c - local.z * s,
    z: ast.pos.z + local.x * s + local.z * c,
  };
}

function pointSegmentDistanceSq(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  if (len2 <= 1e-9) {
    const dx = px - ax;
    const dz = pz - az;
    return dx * dx + dz * dz;
  }
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / len2, 0, 1);
  const cx = ax + vx * t;
  const cz = az + vz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return dx * dx + dz * dz;
}

function inheritChunkSeams(parentSeams, count, radius, chunkIndex) {
  if (!Array.isArray(parentSeams) || !parentSeams.length || count <= 0) return [];
  const seams = [];
  for (let i = 0; i < count; i++) {
    const src = parentSeams[(chunkIndex + i) % parentSeams.length] || {};
    const angle = Number.isFinite(src.angle) ? src.angle : 0;
    const radial = radius * (0.45 + 0.1 * ((chunkIndex + i) % 3));
    seams.push({
      angle,
      localOffset: {
        x: Math.round(Math.cos(angle) * radial * 1e6) / 1e6,
        z: Math.round(Math.sin(angle) * radial * 1e6) / 1e6,
      },
    });
  }
  return seams;
}

function hash32Local(...args) {
  let h = 0x811c9dc5;
  const s = args.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function unitHash(...args) {
  return hash32Local(...args) / 4294967296;
}

export function richCoreWindowPctForTier(tier) {
  const t = clamp(tier, 0, 5) / 5;
  return RICH_CORE_WINDOW_HI + (RICH_CORE_WINDOW_LO - RICH_CORE_WINDOW_HI) * t;
}

function richOreForTier(tier) {
  const target = Math.max(1, Math.floor(Number(tier) || 0) + 1);
  const sorted = ORES.slice().sort((a, b) => (a.tier - b.tier) || a.id.localeCompare(b.id));
  const rare = sorted.find((ore) => ore.tier >= target && ore.tags && ore.tags.includes('rare'));
  const tiered = sorted.find((ore) => ore.tier >= target);
  return (rare || tiered || sorted[sorted.length - 1] || { id: 'cmdty_ore_iron' }).id;
}

export function richCorePlan(seed, asteroid, def = null) {
  const id = asteroid && asteroid.id || 'asteroid';
  const roll = unitHash(seed || 0, id, 'rich_core');
  const tier = asteroid && asteroid.data && asteroid.data.tier != null
    ? asteroid.data.tier
    : def && def.tierCap || 0;
  const mult = 3 + Math.floor(unitHash(seed || 0, id, 'rich_core_mult') * 6);
  return {
    hasCore: roll < RICH_CORE_CHANCE,
    roll,
    multiplier: Math.max(3, Math.min(8, mult)),
    commodityId: richOreForTier(tier),
    windowPct: richCoreWindowPctForTier(tier),
  };
}

function commodityBasePrice(commodityId) {
  const c = COMMODITY_BY_ID.get(commodityId);
  const ore = ORE_BY_ID.get(commodityId);
  return (c && Number(c.basePrice)) || (ore && Number(ore.baseValue)) || 1;
}

function bulkChunkMass(chunk) {
  const d = chunk && chunk.data || {};
  return Math.max(0, Number(d.bulkMassU != null ? d.bulkMassU : d.yieldU != null ? d.yieldU : chunk && chunk.mass) || 0);
}

function chunkCommodity(chunk) {
  const d = chunk && chunk.data || {};
  return d.commodityId || 'cmdty_ore_iron';
}

export function bulkHaulPayoutForChunk(chunk) {
  const commodityId = chunkCommodity(chunk);
  const massU = bulkChunkMass(chunk);
  const basePrice = Math.max(0, Number(chunk && chunk.data && chunk.data.basePrice) || commodityBasePrice(commodityId));
  const gross = massU * basePrice * BULK_HAUL_PAY_MULT;
  const fee = gross * BULK_HAUL_REFINERY_FEE;
  return {
    massU,
    commodityId,
    basePrice,
    gross,
    fee,
    credits: Math.round(gross - fee),
  };
}

function isBulkHaulChunk(e) {
  return !!(e && e.alive !== false && e.type === 'asteroid' && e.data && e.data.isChunk && bulkChunkMass(e) > BULK_HAUL_MIN_U);
}

function isRefineryStation(state, stationId) {
  if (!state || !stationId) return false;
  const entity = (state.entityIndex && state.entityIndex.byStationId && state.entityIndex.byStationId.get(stationId)) ||
    (state.entityList || []).find((e) => e && e.type === 'station' && e.data && e.data.stationId === stationId);
  const data = entity && entity.data;
  if (data && (data.stationTypeId === 'refinery' || data.type === 'refinery' || data.kind === 'refinery')) return true;
  for (const sector of Object.values(state.world && state.world.sectors || {})) {
    for (const station of sector.stations || []) {
      if (station && station.id === stationId) return station.type === 'refinery' || (station.services || []).includes('refine');
    }
  }
  return false;
}

function playerModSum(state, key) {
  if (!state || !key) return 0;
  const player = state.entities && state.entities.get && state.entities.get(state.playerId);
  const fittings = player && player.data && Array.isArray(player.data.fittings) ? player.data.fittings : [];
  let sum = 0;
  for (const id of fittings) {
    const mod = id && MODULE_BY_ID.get(id);
    const value = mod && mod.mods && Number(mod.mods[key]);
    if (Number.isFinite(value)) sum += value;
  }
  return sum;
}
