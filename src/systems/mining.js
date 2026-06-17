// Mining system (ARCHITECTURE §2.3 step 9). Owns asteroid extraction, ore ejection as
// collectible pickups, the magnet auto-collect pull, wreck salvage, and mining-beam heat.
//
// Drive: the player holds RIGHT-MOUSE → state.input.fireGroup === 2. The active mining beam
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
import { ORES, ASTEROIDS, BEAMS } from '../data/mining.js';

const MAGNET_ACCEL = 180;       // wu/s² pull toward ship inside magnetRange
const MAGNET_MAX_SPEED = 140;   // wu/s cap on pulled pickups
const PICKUP_RADIUS = 2.2;      // wu collectible radius
const PICKUP_TTL = 90;          // s before an uncollected pickup despawns
const EJECT_STEP = 0.25;        // ore ejects each time cumulative loss crosses 25%
const SALVAGE_TIME_DEFAULT = 6; // s to fully drain a wreck if combat didn't set one

const ORE_BY_ID = new Map(ORES.map((o) => [o.id, o]));
const AST_BY_ID = new Map(ASTEROIDS.map((a) => [a.id, a]));
const BEAM_BY_ID = new Map(BEAMS.map((b) => [b.id, b]));

export const mining = {
  name: 'mining',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;

    this._beaming = false;     // was the player beam active last tick (start/stop edges)
    this._lockTargetId = null; // currently soft-locked asteroid/wreck id

    const bus = this.bus;
    // Combat spawns a wreck on ship death so the player can salvage it.
    bus.on('entity:killed', (p) => this._onShipDestroyed(p));
    // Combat loot drops → materialize as collectible pickups (shared pickup path).
    bus.on('loot:drop', (p) => this._onLootDrop(p));
    // Collect ore/cargo pickups into the hold (physics emits this on contact; we also self-emit).
    bus.on('pickup:collected', (p) => this._onPickupCollected(p));
    // Fresh sector → drop the stale beam lock (world regenerates the field).
    bus.on('sector:enter', () => { this._lockTargetId = null; this._stopBeam(); });
  },

  // ---- main per-tick update -------------------------------------------------
  update(dt, state) {
    const player = state.entities.get(state.playerId);
    const firing = !!player && player.alive && !player.flags.docked
      && state.mode === 'flight' && state.input.fireGroup === 2;

    if (player) {
      const beam = this._beamRuntime(player);
      if (firing && beam) this._runPlayerBeam(player, beam, dt, state);
      else { this._coolBeam(beam, dt); this._stopBeam(); }
    }

    this._updatePickups(dt, state);
  },

  // ---- beam runtime resolution ----------------------------------------------
  // The beam's mutable runtime (heat/overheated/directToCargo/tierId) lives on the player record;
  // dps/range/heatRate/coolRate come from the BEAMS tier table keyed by tierId.
  _beamRuntime(player) {
    const beam = (player.data && player.data.miningBeam) || this.state.player.miningBeam;
    if (!beam) return null;
    const tier = BEAM_BY_ID.get(beam.tierId) || BEAM_BY_ID.get('beam_mk1');
    if (tier) {
      if (!beam.dps) beam.dps = tier.dps;
      if (!beam.range) beam.range = tier.range;
      if (!beam.heatRate) beam.heatRate = tier.heatRate;
      if (!beam.coolRate) beam.coolRate = tier.coolRate;
    }
    if (beam.heat == null) beam.heat = 0;
    if (beam.overheated == null) beam.overheated = false;
    return beam;
  },

  _runPlayerBeam(player, beam, dt, state) {
    // Overheated: force-cool, beam inert until heat falls to <=40.
    if (beam.overheated) { this._coolBeam(beam, dt); this._stopBeam(); return; }

    const target = this._acquireTarget(player, beam.range, state);
    if (!target) { this._coolBeam(beam, dt); this._stopBeam(); return; }

    // start edge (or re-lock onto a different rock)
    if (!this._beaming || this._lockTargetId !== target.id) {
      this._lockTargetId = target.id;
      this.bus.emit('mining:start', { minerId: player.id, targetId: target.id, position: { x: target.pos.x, z: target.pos.z } });
    }
    this._beaming = true;

    // heat up (overheat is optional QoL; if heatRate is 0 the beam never overheats)
    beam.heat = Math.min(100, beam.heat + (beam.heatRate || 0) * dt);
    if (beam.heat >= 100 && !beam.overheated) {
      beam.overheated = true;
      this.bus.emit('beam:overheated', {});
    }

    const dps = (beam.dps || 18) * (beam.directToCargo ? 1.08 : 1);
    if (target.type === 'wreck') this._drainWreck(player, target, dps, dt);
    else this.applyMining(target.id, dps, dt, player.id);
  },

  _coolBeam(beam, dt) {
    if (!beam) return;
    beam.heat = Math.max(0, beam.heat - (beam.coolRate || 0) * dt);
    if (beam.overheated && beam.heat <= 40) {
      beam.overheated = false;
      this.bus.emit('beam:ready', {});
    }
  },

  _stopBeam() {
    if (!this._beaming) return;
    this._beaming = false;
    this.bus.emit('mining:stop', { minerId: this.state.playerId, targetId: this._lockTargetId, position: null });
  },

  // Nearest mineable target (asteroid or salvageable wreck) within range, biased toward aim.
  _acquireTarget(ship, range, state) {
    const aim = state.input.aimAngle || 0;
    const ax = Math.cos(aim), az = Math.sin(aim);
    let best = null, bestScore = -Infinity;
    for (const e of state.entityList) {
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

    // Normalize ore-HP fields from whatever the spawner gave us (bootstrap uses oreHP/oreHPMax).
    const hpMax = d.oreHPMax || d.oreHP || ast.hullMax || 1;
    if (d.oreHPMax == null) d.oreHPMax = hpMax;
    if (d.oreHP == null) d.oreHP = (ast.hull != null && ast.hull > 0) ? ast.hull : hpMax;

    const def = AST_BY_ID.get(d.typeId) || AST_BY_ID.get('ast_common_rock');
    const yieldTotal = d.yieldU != null ? d.yieldU : this._defaultYield(def, hpMax);
    if (d.yieldU == null) d.yieldU = yieldTotal;
    if (d.pctEjected == null) d.pctEjected = 0;
    if (d._oreCarry == null) d._oreCarry = 0; // fractional ore awaiting a whole unit

    const before = d.oreHP;
    d.oreHP = Math.max(0, d.oreHP - dps * dt);
    ast.hull = d.oreHP; // keep the hull alias in sync
    const lost = before - d.oreHP;
    if (lost <= 0) return 0;

    const miner = state.entities.get(minerId);
    const contact = this._surfacePoint(ast, miner);
    this.bus.emit('mining:tick', { contactPos: contact, oreType: this._dominantOre(def) });

    // Convert cumulative ore-HP loss into ore units, gated to 25% ejection thresholds.
    const pctNow = 1 - d.oreHP / hpMax;
    const destroyed = d.oreHP <= 0;
    const stepPct = destroyed ? 1 : Math.floor(pctNow / EJECT_STEP) * EJECT_STEP;
    let releaseUnits = 0;
    if (stepPct > d.pctEjected || destroyed) {
      const wantTotal = yieldTotal * (destroyed ? 1 : stepPct);
      const alreadyOut = yieldTotal * d.pctEjected;
      d._oreCarry += Math.max(0, wantTotal - alreadyOut);
      d.pctEjected = destroyed ? 1 : stepPct;
      releaseUnits = Math.floor(d._oreCarry);
      d._oreCarry -= releaseUnits;
    }

    if (releaseUnits > 0) this._releaseOre(ast, def, releaseUnits, miner);

    if (destroyed) {
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
      this.bus.emit('mining:yield', { commodityId, qty, pos: { x: ast.pos.x, z: ast.pos.z } });
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
    const magnet = state.player.magnetRange || 90;
    for (const e of state.entityList) {
      if (!e.alive || e.type !== 'pickup') continue;
      const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz) || 1e-4;
      if (dist <= magnet) {
        e.vel.x += (dx / dist) * MAGNET_ACCEL * dt;
        e.vel.z += (dz / dist) * MAGNET_ACCEL * dt;
        const sp = Math.hypot(e.vel.x, e.vel.z);
        if (sp > MAGNET_MAX_SPEED) { const s = MAGNET_MAX_SPEED / sp; e.vel.x *= s; e.vel.z *= s; }
      }
      // direct collect on overlap (physics also emits pickup:collected on contact; idempotent via alive guard)
      if (dist <= (player.radius || 6) + 4) {
        e.alive = false;
        this.bus.emit('pickup:collected', {
          pickupId: e.id, collectorId: player.id, kind: (e.data && e.data.kind) || 'ore',
          amount: (e.data && e.data.amount) || 1, commodityId: e.data && e.data.commodityId,
          pos: { x: e.pos.x, z: e.pos.z },
        });
      }
    }
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
      this.bus.emit('mining:yield', { commodityId: id, qty: got[id], pos: { x: wreck.pos.x, z: wreck.pos.z } });
      this._spawnPickup(wreck, id, got[id]);
    }

    remaining = Object.values(pool).reduce((a, b) => a + b, 0);
    if (d.salvageTimeLeft <= 0 || remaining <= 0) {
      this.bus.emit('salvage:completed', { wreckId: wreck.id, loot: got });
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
