// Automation & passive-income system — the anti-idle build-up layer.
// Contract: ARCHITECTURE §0.5 (seeded RNG), §0.6 (single-writer credits — emit
// economy:grant/chargeCredits, never write player.credits), §2.3 step 12 (runs after
// economy+mining, before UI), §3.9 (state.automation schema), §4.4 (master event table),
// design/specs/08-automation-passive-income-anti-idle-layer.md.
//
// THREE ACCRUAL TYPES:
//   - Mining DRONES: continuous mineRate*count*dt into a SHARED group buffer (capped at bufferCap).
//     Buffer is realized to credits on Recall (collect/bank). Fuel bleeds each active tick; fuel=0
//     -> group LOST (the attention cost).
//   - Hired TRADERS: discrete. cycleProgress += dt/cycleTime; on a completed cycle, credit the
//     spread profit (read live via economy.priceOf/quote), roll a danger-scaled loss, and emit
//     economy:applyTradePressure so the route self-limits. upkeep drains regardless.
//   - OUTPOSTS: continuous production into a capped storage buffer; if autoSell, the local market
//     buys the surplus at a 20% penalty each minute. Raidable on a 600s interval.
//
// THE SIGNATURE MECHANIC — GLOBAL PASSIVE CAP (spec risk #1): every credit of passive income is
// funnelled through ONE function, creditPassive(), which enforces a per-minute token bucket sized
// at passiveCapFrac * A(T_player). Income up to the bucket pays full value; the overflow above it
// is crushed to overflowEff (0.25). This is the spec's `credited = cap + (net-cap)*overflowEff`
// applied incrementally so bursty trader lumps are handled correctly. Nothing else emits
// economy:grantCredits. Net passive/min therefore stays well below active play at every tier.
//
// Pure-data deps only (no 'three'). Reads economy via the registry (priceOf/quote/getMarket),
// danger from the SECTORS catalog (dangerIndex), the player tier from player.droneTierCap.
import { DRONES, TRADERS, OUTPOSTS, AUTO_BALANCE } from '../data/automation.js';
import { SECTORS, dangerIndex } from '../data/sectors.js';
import { drawSeeded, hash32 } from '../core/rng.js';
import { tickProgram, assignTemplate, clearTemplate, TEMPLATES } from './alphabet.js';
import { addCargo, removeCargo } from './cargo.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Static lookups (built once).
const DRONE_BY_ID = new Map(DRONES.map((d) => [d.id, d]));
const TRADER_BY_ID = new Map(TRADERS.map((t) => [t.id, t]));
const OUTPOST_BY_ID = new Map(OUTPOSTS.map((o) => [o.id, o]));
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));

// stationId -> { sectorId, factionId, type, position } from the SECTORS graph (same resolve
// pattern economy uses — dock/UI hands us station ids, sectors own the geometry).
const STATION_SECTOR = new Map();
const ALL_STATIONS = [];
for (const sec of SECTORS) {
  for (const st of sec.stations || []) {
    STATION_SECTOR.set(st.id, { sectorId: sec.id, factionId: st.factionId, type: st.type, position: sec.position });
    ALL_STATIONS.push({ id: st.id, type: st.type, sectorId: sec.id, position: sec.position });
  }
}

// A nominal ore commodity drone buffers bank as, with a fallback value when no market exists.
const DRONE_ORE_ID = 'cmdty_ore_iron';
const DRONE_ORE_FALLBACK_VALUE = 28; // cmdty_ore_iron basePrice (informational fallback)

// Cadences (s).
const OUTPOST_RAID_INTERVAL_S = 600;
const OUTPOST_AUTOSELL_INTERVAL_S = 60;

// ---- mining-drone FLYING-ENTITY tuning (real type:'drone' entities that orbit/seek asteroids) ----
const DRONE_ENTITY_RADIUS = 2.4;      // wu collision radius of a single drone mesh
const DRONE_SPEED = 130;              // wu/s cruise toward the targeted asteroid
const DRONE_ACCEL = 7.0;              // velocity lerp rate toward the desired heading (1/s)
const DRONE_MINE_RANGE = 34;          // wu standoff at which the drone "chips" the rock
const DRONE_ORBIT_GAP = 14;           // wu added to the asteroid radius for the standoff ring
const DRONE_SPREAD = 26;              // wu spacing so multiple drones in a group fan out

// Loss/raid tuning (spec Formulas).
const TRADER_LOSS_CAP = 0.35;
const OUTPOST_RAID_CAP = 0.5;
const HOTNESS_GAIN = 0.05;     // per consecutive cycle on the same route
const HOTNESS_DECAY = 0.1;     // per minute when idle
const ROUTE_FUEL_PER_WU = 0.4; // cr per wu (sector-position distance proxy)
const SECTOR_POS_TO_WU = 600;  // sector graph spacing -> rough wu so route fuel is non-trivial

export const automation = {
  name: 'automation',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._registry = ctx.registry || null;
    automation._instance = this;

    const state = this.state;
    if (!state.automation) state.automation = makeDefaultAutomation();
    this._normalizeAutomation(state.automation);

    // Per-minute token bucket for the passive cap (transient — rebuilt at runtime, refilled per tick).
    this._capBudget = 0;
    // Cadence accumulators (transient).
    this._outpostRaidAccum = 0;
    this._outpostSellAccum = 0;
    this._nextId = 1;

    // Dedicated seeded RNG stream (§0.5) for loss/raid rolls so they don't disturb other streams.
    this._initRng();

    const bus = this.bus;
    // Single intent channel from the AutomationPanel UI (§4.4 ui:fleetOrder). The panel multiplexes
    // every button (buyDrone/hireTrader/buildOutpost/recall/assignRoute/dismiss/decommission/order*/
    // assignFleet) through this one event; `order` is the verb we switch on.
    bus.on('ui:fleetOrder', (p) => { if (p) this.handleOrder(p); });

    // Combat dealing damage to one of our assets (drone group / outpost / fleet ship).
    bus.on('combat:hitAsset', (p) => { if (p) this.onHitAsset(p); });

    // Offline catch-up: when a save is loaded, simulate the elapsed-away window once.
    bus.on('save:loaded', () => this.runOfflineCatchup());
    bus.on('game:started', () => { this.meta().lastTickTime = nowMs(); });

    // The world despawns sector-scoped entities on sector exit — our flying drones go with them, so
    // drop the stale ids (they re-spawn from the group when the player returns to the home sector).
    bus.on('sector:exit', () => { for (const g of this.state.automation.drones) g.entityIds = []; });

    // Tech can raise the drone tier cap → just affects gating/cap; nothing to do eagerly.
  },

  // ------------------------------------------------------------------------------------------
  // PER-TICK UPDATE (§2.3 step 12). Order: refill cap bucket → drones → traders → outposts →
  // upkeep drain → distress/repossession. Credits only ever move through creditPassive()/upkeep.
  // ------------------------------------------------------------------------------------------
  update(dt, state) {
    const a = state.automation;
    if (!a) return;
    if (!(dt > 0)) return;

    // Refill the per-minute cap token bucket: capLimit/60 per second, clamped to [0, capLimit].
    const capLimit = this.passiveCapPerMin();
    this._capBudget = clamp(this._capBudget + (capLimit / 60) * dt, 0, capLimit > 0 ? capLimit : 0);

    this._updateDrones(dt, a);
    this._updateTraders(dt, a);
    this._updateOutposts(dt, a);
    this._drainUpkeep(dt, a);

    this.meta().lastTickTime = nowMs();
  },

  // ------------------------------------------------------------------------------------------
  // DRONES — REAL flying entities. Each deployed group owns N type:'drone' entities that orbit
  // and seek the nearest live asteroid, chip ore (inline mining math), and bank it to the SHARED
  // capped buffer. Fuel bleeds while active; fuel=0 -> group LOST. Buffer realized on recall.
  //
  // The per-second mine RATE is still authored by AUTO_BALANCE/DRONES.mineRate (def.mineRate*count)
  // so balance is untouched — the flying entities are the *vehicle* for that yield, gated on the
  // drone actually being in range of a rock (so an empty field starves the group, the spec's
  // "fly to a field" intent). When the player isn't in the drone's home sector the world has no
  // live asteroids loaded, so we fall back to the abstract accrual (entities only exist in-sector).
  // ------------------------------------------------------------------------------------------
  _updateDrones(dt, a) {
    const curSector = (this.state.world && this.state.world.currentSectorId) || null;
    for (let i = a.drones.length - 1; i >= 0; i--) {
      const g = a.drones[i];
      const def = DRONE_BY_ID.get(g.defId) || g;
      if (g.status === 'distressed') { this._parkDroneEntities(g); continue; } // frozen until upkeep paid

      g.oreType = g.oreType || DRONE_ORE_ID;

      // PROGRAM PATH (V2 §4 / cut-list #28): if the group has an assigned alphabet template,
      // run it instead of the legacy mine-to-buffer loop. The drone mines into the player's REAL
      // cargo (via canonical addCargo) and sells at a depot for real credits — the player-authored
      // automation fantasy. Falls through to the legacy path when no program is assigned.
      if (g.program && TEMPLATES[g.program.templateId]) {
        this._runProgrammedGroup(g, def, dt, curSector);
        // fuel still bleeds while running a program (the attention cost, same as legacy)
        g.fuel = Math.max(0, (g.fuel || 0) - (def.fuelRate || 1) * dt);
        if (g.fuel <= 0) {
          this._releaseDroneEntities(g);
          this._loseAsset('drone', g, this._droneBufferValue(g), g.sectorId);
          a.drones.splice(i, 1);
          continue;
        }
        g.status = 'program';
        continue;
      }

      const cap = g.bufferCap || def.bufferCap || 0;
      const room = cap - (g.buffer || 0);

      // Drive the visible drone entities (only meaningful in the group's home sector, where the
      // field is loaded). Returns true if at least one drone is actually on a rock this tick.
      const onRock = (g.sectorId === curSector)
        ? this._steerDroneEntities(g, def, dt, room > 0)
        : false;
      if (g.sectorId !== curSector) this._releaseDroneEntities(g); // out-of-sector: entities unloaded

      // Mine into the shared buffer at the authored rate. In-sector the drones must be on a rock;
      // out-of-sector (abstract) we accrue as before so away-from-field passive income still works.
      if (room > 0 && (onRock || g.sectorId !== curSector)) {
        const mined = Math.min((def.mineRate || 0) * (g.count || 1) * dt, room);
        g.buffer = (g.buffer || 0) + mined;
      }

      // fuel bleed (only while actively able to mine)
      g.fuel = Math.max(0, (g.fuel || 0) - (def.fuelRate || 1) * dt);
      if (g.fuel <= 0) {
        this._releaseDroneEntities(g);
        this._loseAsset('drone', g, this._droneBufferValue(g), g.sectorId);
        a.drones.splice(i, 1);
        continue;
      }
      g.status = (g.buffer || 0) >= cap - 1e-6 ? 'idle' : 'mining';
      g.ratePerMin = this._droneRatePerMin(g, def);
    }
  },

  // Run a drone group's alphabet program (V2 §4 / cut-list #28). Provides the callbacks the
  // alphabet runtime needs: steerTo (drives the flying entities), mineIntoCargo (real cargo via
  // addCargo), sellMinedCargo (real credits via the passive funnel). Mines the same authored rate
  // as the legacy path so balance is unchanged — the program just changes WHERE the ore goes
  // (player cargo + sold by the drone, vs a realized-on-recall buffer).
  _runProgrammedGroup(g, def, dt, curSector) {
    // ensure entities exist (same spawn as legacy)
    if ((!g.entityIds || !g.entityIds.length) && g.sectorId === curSector) this._spawnDroneEntities(g, def);
    const ctx = {
      state: this.state, helpers: this.helpers, group: g,
      steerTo: (beacon, ddt) => this._steerGroupTo(g, def, beacon, ddt, curSector),
      mineIntoCargo: (ddt) => this._programMineIntoCargo(g, def, ddt),
      sellMinedCargo: (stationId) => this._programSellCargo(g, stationId),
    };
    tickProgram(g, ctx, dt);
  },

  // Steer every live entity in the group toward a beacon; returns true when the lead entity is
  // "at" the beacon (within arrival range). Reuses the legacy _driveDrone steering.
  _steerGroupTo(g, def, beacon, dt, curSector) {
    if (!beacon || g.sectorId !== curSector || !g.entityIds || !g.entityIds.length) return false;
    const getEnt = (this.helpers && this.helpers.getEntity) || ((id) => this.state.entities.get(id));
    const target = { x: beacon.x, z: beacon.z };
    let lead = null;
    for (const id of g.entityIds) {
      const e = getEnt(id);
      if (!e || !e.alive) continue;
      lead = e;
      this._driveDrone(e, target, dt, false);
    }
    if (!lead) return false;
    // arrival threshold scales with target type (rocks need a standoff; stations/depot closer)
    const arriveR = beacon.entity && beacon.entity.type === 'asteroid'
      ? (beacon.entity.radius || 6) + 14 + 34   // standoff + mine range
      : 60;
    const dx = lead.pos.x - target.x, dz = lead.pos.z - target.z;
    return (dx * dx + dz * dz) < arriveR * arriveR;
  },

  // Mine into the PLAYER'S cargo at the authored rate (capped by free cargo volume). This is the
  // real-cargo grant path — the drone is now earning actual ore the player can use or sell.
  _programMineIntoCargo(g, def, dt) {
    const cargo = this.state.player.cargo;
    if (!cargo) return;
    const free = cargo.capVolume - cargo.usedVolume;
    if (free <= 0) return;
    // convert authored ore-units/sec rate into cargo volume (iron ≈ 1 vol/u for the baseline)
    const rate = (def.mineRate || 0.8) * (g.count || 1);
    const want = Math.max(1, Math.floor(Math.min(rate * dt, free)));
    const added = addCargo(this.state, g.oreType || DRONE_ORE_ID, want);
    if (added > 0) {
      // cosmetic mining-tick feedback so the player SEES the drone working
      const rock = this._nearestAsteroid(this._playerPos(), 600);
      this.bus.emit('mining:tick', { contactPos: rock ? rock.pos : this._playerPos(), oreType: g.oreType || DRONE_ORE_ID });
    }
  },

  // Sell the player's mined ore at the depot station for real credits, through the passive funnel
  // (so the cap still applies — program income isn't a cap bypass). Sells the drone's chosen ore.
  _programSellCargo(g, stationId) {
    const cargo = this.state.player.cargo;
    if (!cargo || !cargo.items) return;
    const oreId = g.oreType || DRONE_ORE_ID;
    const have = cargo.items[oreId] || 0;
    if (have <= 0) return;
    const price = this._orePrice(oreId);
    const gross = have * price;
    if (gross > 0) {
      removeCargo(this.state, oreId, have);
      this.creditPassive(gross, 'drone:program');
      if (stationId) this.bus.emit('economy:applyTradePressure', { stationId, good: oreId, vol: have });
    }
  },


  // Spawn the visible flying drones for a freshly deployed group near the nearest asteroid field.
  // Best-effort: needs the core spawnEntity helper and the group's home sector loaded.
  _spawnDroneEntities(g, def) {
    const spawn = this.helpers && this.helpers.spawnEntity;
    if (!spawn) return;
    const count = Math.max(1, g.count || 1);
    const origin = this._droneFieldOrigin(g, def);
    g.entityIds = g.entityIds || [];
    for (let k = 0; k < count; k++) {
      // fan the drones out around the field origin so they don't stack on one point
      const ang = (k / count) * Math.PI * 2;
      const pos = { x: origin.x + Math.cos(ang) * DRONE_SPREAD, z: origin.z + Math.sin(ang) * DRONE_SPREAD };
      // collides:false on purpose — physics' pickup branch treats any colliding type:'drone' as a
      // collector and would silently vacuum (and destroy) the player's loose ore pickups with a
      // non-player collectorId. These drones are steered manually to a standoff, so they need no
      // physical collision; their group-level durability is the attention cost (fuel/distress).
      const ent = spawn({
        type: 'drone', team: 0, factionId: 'faction_player',
        pos, rot: ang,
        radius: DRONE_ENTITY_RADIUS, mass: 6, collides: false,
        hull: def.durabilityMax || 40, hullMax: def.durabilityMax || 40,
        maxSpeed: DRONE_SPEED, drag: 1.4,
        data: { kind: 'mining_drone', groupId: g.id, targetAstId: null },
      });
      if (ent) g.entityIds.push(ent.id);
    }
  },

  // Where the group's drones congregate: the nearest live asteroid (field) to the deploy point,
  // else the player's position (deploy-range anchor), else the stored origin.
  _droneFieldOrigin(g, def) {
    const anchor = g.originPos || this._playerPos() || { x: 0, z: 0 };
    const rock = this._nearestAsteroid(anchor, (def && def.deployRange) || 400);
    if (rock) return { x: rock.pos.x, z: rock.pos.z };
    return { x: anchor.x, z: anchor.z };
  },

  // Steer each live drone entity toward the nearest live asteroid and chip ore when in range.
  // Returns true if at least one drone is currently on a rock (so the group should accrue).
  _steerDroneEntities(g, def, dt, wantOre) {
    if (!g.entityIds || !g.entityIds.length) { this._spawnDroneEntities(g, def); }
    if (!g.entityIds || !g.entityIds.length) return false;
    const getEnt = (this.helpers && this.helpers.getEntity) || ((id) => this.state.entities.get(id));
    let anyOnRock = false;
    const alive = [];
    for (const id of g.entityIds) {
      const e = getEnt(id);
      if (!e || !e.alive) continue;     // lost (combat/despawn) — pruned from the group
      alive.push(id);

      // (re)acquire the nearest live asteroid within the deploy range of the drone itself.
      let ast = e.data && e.data.targetAstId != null ? getEnt(e.data.targetAstId) : null;
      if (!ast || !ast.alive || ast.type !== 'asteroid' || (ast.data && ast.data.respawnAt != null)) {
        ast = this._nearestAsteroid(e.pos, ((def && def.deployRange) || 400) * 1.6);
        e.data.targetAstId = ast ? ast.id : null;
      }

      if (!ast) { this._driveDrone(e, e.pos, dt, true); continue; } // no rock: drift/idle in place

      const dx = ast.pos.x - e.pos.x, dz = ast.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz) || 1e-4;
      const standoff = (ast.radius || 6) + DRONE_ORBIT_GAP;
      if (dist > standoff + DRONE_MINE_RANGE) {
        // cruise toward a standoff point just off the rock surface
        const tx = ast.pos.x - (dx / dist) * standoff, tz = ast.pos.z - (dz / dist) * standoff;
        this._driveDrone(e, { x: tx, z: tz }, dt, false);
      } else {
        // in range: face the rock, ease to a hover, and chip ore into the shared buffer.
        e.rot = Math.atan2(dz, dx); e.angVel = 0;
        e.vel.x *= Math.max(0, 1 - DRONE_ACCEL * dt);
        e.vel.z *= Math.max(0, 1 - DRONE_ACCEL * dt);
        anyOnRock = true;
        if (wantOre) this._chipAsteroid(ast, def, dt);
      }
    }
    if (alive.length !== g.entityIds.length) g.entityIds = alive;
    return anyOnRock;
  },

  // Move a drone entity toward a world point by easing its velocity (physics integrates position;
  // renderer rotates by -rot, so point the nose, +X, along travel).
  _driveDrone(e, target, dt, brake) {
    const dx = target.x - e.pos.x, dz = target.z - e.pos.z;
    const d = Math.hypot(dx, dz) || 1e-4;
    const want = brake ? 0 : DRONE_SPEED;
    const vx = (dx / d) * want, vz = (dz / d) * want;
    const k = Math.min(1, DRONE_ACCEL * dt);
    e.vel.x += (vx - e.vel.x) * k;
    e.vel.z += (vz - e.vel.z) * k;
    const sp = Math.hypot(e.vel.x, e.vel.z);
    if (sp > DRONE_SPEED) { const s = DRONE_SPEED / sp; e.vel.x *= s; e.vel.z *= s; }
    if (sp > 1) { e.rot = Math.atan2(e.vel.z, e.vel.x); e.angVel = 0; }
  },

  // Inline mining: shave ore-HP off the rock and emit a mining-style yield pulse (cosmetic/feedback).
  // Sim-affecting yield is the group's authored buffer accrual (kept in _updateDrones), so this only
  // depletes the field + drives VFX — it never double-credits ore. Deterministic (no RNG draw here).
  _chipAsteroid(ast, def, dt) {
    const d = ast.data || (ast.data = {});
    const hpMax = d.oreHPMax || d.oreHP || ast.hullMax || 1;
    if (d.oreHPMax == null) d.oreHPMax = hpMax;
    if (d.oreHP == null) d.oreHP = (ast.hull != null && ast.hull > 0) ? ast.hull : hpMax;
    const dps = (def.mineRate || 0.8) * 14; // chip speed ~ proportional to the drone's mine rate
    const before = d.oreHP;
    d.oreHP = Math.max(0, d.oreHP - dps * dt);
    ast.hull = d.oreHP;
    if (d.oreHP < before) {
      this.bus.emit('mining:tick', { contactPos: { x: ast.pos.x, z: ast.pos.z }, oreType: DRONE_ORE_ID });
    }
    if (d.oreHP <= 0 && ast.alive) {
      const respawn = (d.respawnSec != null ? d.respawnSec : 120);
      d.respawnAt = (this.state.simTime || 0) + respawn; // world repopulates
      ast.alive = false;
      this.bus.emit('asteroid:destroyed', { id: ast.id, typeId: d.typeId || null, pos: { x: ast.pos.x, z: ast.pos.z } });
    }
  },

  _nearestAsteroid(pos, range) {
    const list = (this.state.entityIndex && this.state.entityIndex.asteroids) || this.state.entityList;
    if (!list || !pos) return null;
    let best = null, bestD2 = (range || 1e9) * (range || 1e9);
    for (const e of list) {
      if (!e.alive || e.type !== 'asteroid') continue;
      if (e.data && e.data.respawnAt != null) continue; // mined-out
      const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = e; }
    }
    return best;
  },

  _playerPos() {
    const p = (this.helpers && this.helpers.player && this.helpers.player())
      || (this.state.entities && this.state.entities.get(this.state.playerId));
    return p ? { x: p.pos.x, z: p.pos.z } : null;
  },

  // Despawn a group's flying drones (recall / loss / out-of-sector). Marks entities dead (swept
  // end-of-step) and clears the id list so a later re-entry re-spawns them.
  _releaseDroneEntities(g) {
    if (!g || !g.entityIds || !g.entityIds.length) return;
    const getEnt = (this.helpers && this.helpers.getEntity) || ((id) => this.state.entities.get(id));
    for (const id of g.entityIds) { const e = getEnt(id); if (e) e.alive = false; }
    g.entityIds = [];
  },

  // Distressed group: stop the drones in place (don't despawn — they resume when upkeep is paid).
  _parkDroneEntities(g) {
    if (!g || !g.entityIds || !g.entityIds.length) return;
    const getEnt = (this.helpers && this.helpers.getEntity) || ((id) => this.state.entities.get(id));
    for (const id of g.entityIds) { const e = getEnt(id); if (e && e.alive) { e.vel.x = 0; e.vel.z = 0; } }
  },

  // Buffer realized to credits only on recall (collect/bank). Display rate is the gross mine value
  // converted to cr/min (pre-cap; the header shows the headline, the cap bar shows throttling).
  _droneRatePerMin(g, def) {
    const orePrice = this._orePrice(g.oreType || DRONE_ORE_ID);
    return Math.round((def.mineRate || 0) * (g.count || 1) * 60 * orePrice);
  },

  _droneBufferValue(g) {
    return Math.round((g.buffer || 0) * this._orePrice(g.oreType || DRONE_ORE_ID));
  },

  // ------------------------------------------------------------------------------------------
  // TRADERS — discrete cycle profit on a 2-station route, danger-scaled loss roll, self-limiting.
  // ------------------------------------------------------------------------------------------
  _updateTraders(dt, a) {
    for (let i = a.traders.length - 1; i >= 0; i--) {
      const t = a.traders[i];
      const def = TRADER_BY_ID.get(t.defId) || t;
      if (t.status === 'distressed') continue;
      if (!t.route || !t.route.from || !t.route.to) { t.status = 'idle'; t.ratePerMin = 0; continue; }

      t.cycleProgress = (t.cycleProgress || 0) + dt / (def.cycleTime || 180);
      t.status = 'enroute';

      if (t.cycleProgress >= 1) {
        t.cycleProgress -= 1;
        this._completeTraderCycle(t, def, a, i);
        if (i >= a.traders.length || a.traders[i] !== t) continue; // trader was lost
      }
      // cache a net cr/min estimate for the panel header (profit/cycle minus upkeep), cap-agnostic.
      const profit = this._estTraderProfit(t, def);
      t.lastEstProfit = profit;
      t.ratePerMin = Math.round(profit / ((def.cycleTime || 180) / 60));
    }
  },

  _completeTraderCycle(t, def, a, idx) {
    const profit = this._computeTraderProfit(t, def);
    t.lastCycleProfit = Math.round(profit);
    // hotness rises each consecutive cycle on the same route (forces re-routing — the management cost)
    t.hotness = clamp((t.hotness || 0) + HOTNESS_GAIN, 0, 1);

    if (profit > 0) {
      this.creditPassive(profit, 'trader');
      // self-limit: each cycle pushes prices so the next spread shrinks (§ spec).
      this._applyTradePressure(t);
    }
    this.bus.emit('asset:deployed', { kind: 'trader', id: t.id }); // mission B6 watcher (cycle pulse)

    // danger-scaled loss roll
    const pLoss = this._traderLossProb(t, def, a);
    if (this._rng() < pLoss) {
      const value = def.hireCost || 0;
      a.traders.splice(idx, 1);
      this._loseAsset('trader', t, value, this._routeSectorId(t));
      // spawn a pirate encounter flag in the route sector (composes with combat/spawn).
      this.bus.emit('spawn:request', {
        entityType: 'pirate', sectorId: this._routeSectorId(t),
        position: null, tags: ['ambush', 'trader_kill'], refId: t.id,
      });
    }
  },

  // profit = cargoVol * max(0, sellB - buyA) * tradeEff - routeFuelCost  (spec Formula).
  _computeTraderProfit(t, def) {
    const buyA = this._stationPrice(t.route.from, DRONE_ORE_ID, 'buy', def.cargoVol);
    const sellB = this._stationPrice(t.route.to, t.route.good || DRONE_ORE_ID, 'sell', def.cargoVol);
    const spread = Math.max(0, sellB - buyA);
    // hotness collapses the realized spread (route fatigue), on top of the economy's price move.
    const hotPenalty = 1 - 0.5 * (t.hotness || 0);
    const gross = (def.cargoVol || 0) * spread * (def.tradeEff || 0.9) * hotPenalty;
    return Math.max(0, gross - this._routeFuelCost(t));
  },

  // cheap pre-roll estimate for the header (no qty-impact integral, just last prices).
  _estTraderProfit(t, def) {
    const econ = this._economy();
    const good = t.route.good || DRONE_ORE_ID;
    const buyA = econ ? (econ.priceOf(t.route.from, good, 'buy') || 0) : 0;
    const sellB = econ ? (econ.priceOf(t.route.to, good, 'sell') || 0) : 0;
    const spread = Math.max(0, sellB - buyA);
    const hotPenalty = 1 - 0.5 * (t.hotness || 0);
    return Math.max(0, (def.cargoVol || 0) * spread * (def.tradeEff || 0.9) * hotPenalty - this._routeFuelCost(t));
  },

  _routeFuelCost(t) {
    const dist = this._routeDistWu(t);
    return dist * ROUTE_FUEL_PER_WU;
  },

  _routeDistWu(t) {
    const ia = STATION_SECTOR.get(t.route.from), ib = STATION_SECTOR.get(t.route.to);
    if (!ia || !ib || !ia.position || !ib.position) return 1 * SECTOR_POS_TO_WU;
    const dx = (ia.position.x - ib.position.x), dy = (ia.position.y - ib.position.y);
    return (Math.hypot(dx, dy) || 1) * SECTOR_POS_TO_WU;
  },

  // pLoss = clamp(baseLoss * dangerMult * hotnessMult * speedMult / guardMult, 0, 0.35).
  // speedMult: a faster hauler (lower cycleTime) outruns danger — per-encounter survival advantage
  // (V2 §33 "faster ship means less chance of damage"). Derived relative to the slowest trader so the
  // fastest hauler (180s) gets ~40% reduction and the slowest (320s) gets none.
  _traderLossProb(t, def, a) {
    const danger = this._routeDanger(t);
    const dangerMult = 1 + danger * 2;
    const hotnessMult = 1 + (t.hotness || 0);
    const guardMult = 1 + 0.5 * this._guardCountFor('trader', t.id, a);
    const cycleTime = (def && def.cycleTime) || 320;
    const speedMult = clamp((320 - cycleTime) / 320 * 0.4, 0, 0.4);   // 0..0.4 reduction
    return clamp((def.baseLossPerCycle || 0.02) * dangerMult * hotnessMult * (1 - speedMult) / guardMult, 0, TRADER_LOSS_CAP);
  },

  _routeDanger(t) {
    const sid = this._routeSectorId(t);
    // Prefer the sectorSim danger resolver (drifted security) when available so live trader-loss
    // rolls reflect the current world state, not just the static catalog. Falls back to static
    // dangerIndex when sectorSim isn't present (e.g. unit tests, pre-init).
    if (this._dangerResolver) {
      try { const d = this._dangerResolver(sid); if (typeof d === 'number') return d; } catch (_) { /* fall through */ }
    }
    const sec = SECTOR_BY_ID.get(sid);
    return sec ? dangerIndex(sec) : 0.1;
  },

  _routeSectorId(t) {
    const info = STATION_SECTOR.get(t.route && t.route.to);
    return info ? info.sectorId : (this.state.world && this.state.world.currentSectorId) || 'sector_helios_prime';
  },

  _applyTradePressure(t) {
    const good = t.route.good || DRONE_ORE_ID;
    const vol = TRADER_BY_ID.get(t.defId) ? TRADER_BY_ID.get(t.defId).cargoVol : (t.cargoVol || 80);
    // buy depletes A's stock (vol negative), sell floods B's stock (vol positive) — economy moves both.
    this.bus.emit('economy:applyTradePressure', { stationId: t.route.from, good, vol: -vol });
    this.bus.emit('economy:applyTradePressure', { stationId: t.route.to, good, vol: +vol });
  },

  // ------------------------------------------------------------------------------------------
  // OUTPOSTS — continuous production into capped storage; periodic autosell + raid roll.
  // ------------------------------------------------------------------------------------------
  _updateOutposts(dt, a) {
    if (!a.outposts.length) return;
    for (const o of a.outposts) {
      const def = OUTPOST_BY_ID.get(o.defId) || o;
      if (o.status === 'distressed' || o.status === 'raided') {
        // raided outposts thaw after their cooldown
        if (o.status === 'raided') { o.raidCooldown = Math.max(0, (o.raidCooldown || 0) - dt); if (o.raidCooldown <= 0) o.status = 'producing'; }
        continue;
      }
      const level = o.level || 1;
      const outRate = (def.outRate || 0) * Math.pow(1.6, level - 1);
      const cap = (def.storageCap || 0) * Math.pow(1.7, level - 1);
      const room = cap - (o.storage || 0);
      if (room > 0) o.storage = (o.storage || 0) + Math.min(outRate * dt, room);
      o.storageCap = cap;
      o.status = 'producing';
      o.ratePerMin = this._outpostRatePerMin(o, def, outRate);
    }

    // periodic autosell (every 60s) — banks the surplus through the capped funnel.
    this._outpostSellAccum += dt;
    while (this._outpostSellAccum >= OUTPOST_AUTOSELL_INTERVAL_S) {
      this._outpostSellAccum -= OUTPOST_AUTOSELL_INTERVAL_S;
      this._outpostAutosell(a);
    }
    // periodic raid roll (every 600s).
    this._outpostRaidAccum += dt;
    while (this._outpostRaidAccum >= OUTPOST_RAID_INTERVAL_S) {
      this._outpostRaidAccum -= OUTPOST_RAID_INTERVAL_S;
      this._outpostRaids(a);
    }
  },

  _outpostRatePerMin(o, def, outRate) {
    // Hab/trade hub generates credits directly; production outposts bank goods at the local price -20%.
    if (def.recipe && def.recipe.passive) return Math.round((outRate) * 60);
    const goodId = def.recipe && def.recipe.output ? Object.keys(def.recipe.output)[0] : DRONE_ORE_ID;
    return Math.round(outRate * 60 * this._orePrice(goodId) * 0.8);
  },

  _outpostAutosell(a) {
    for (const o of a.outposts) {
      if (!o.autoSell) continue;
      if (o.status === 'distressed' || o.status === 'raided') continue;
      const def = OUTPOST_BY_ID.get(o.defId) || o;
      const sellable = o.storage || 0;
      if (sellable <= 0) continue;
      let income;
      if (def.recipe && def.recipe.passive) {
        income = sellable; // credit-gen hub: storage IS credits
      } else {
        const goodId = def.recipe && def.recipe.output ? Object.keys(def.recipe.output)[0] : DRONE_ORE_ID;
        income = sellable * this._orePrice(goodId) * 0.8; // 20% local-sale penalty (spec)
      }
      o.storage = 0;
      if (income > 0) this.creditPassive(income, 'outpost');
    }
  },

  _outpostRaids(a) {
    for (let i = 0; i < a.outposts.length; i++) {
      const o = a.outposts[i];
      if (o.status === 'distressed') continue;
      const sec = SECTOR_BY_ID.get(o.sectorId);
      const danger = sec ? dangerIndex(sec) : 0;
      if (danger <= 0) continue;
      const def = OUTPOST_BY_ID.get(o.defId) || o;
      const level = o.level || 1;
      const defense = (def.defense || 0) + 15 * (level - 1);
      const guard = this._guardCountFor('outpost', o.id, a) > 0 ? 1.8 : 1;
      const defenseMult = (defense / 20) * guard;
      const pRaid = clamp(danger * 0.4 / (defenseMult || 1), 0, OUTPOST_RAID_CAP);
      if (this._rng() < pRaid) {
        const lossVol = (o.storage || 0) * 0.7;
        o.storage = (o.storage || 0) * 0.3;
        o.status = 'raided';
        o.raidCooldown = 300;
        this.bus.emit('automation:outpostRaided', { outpostId: o.id, sectorId: o.sectorId, lossVol: Math.round(lossVol) });
        this.bus.emit('toast', { text: `Outpost raided in ${prettySector(o.sectorId)} (-${Math.round(lossVol)} goods)`, kind: 'warn', ttl: 4 });
      }
    }
  },

  // ------------------------------------------------------------------------------------------
  // UPKEEP — sum upkeep/min, drain per tick via the accumulator; distress + repossession.
  // ------------------------------------------------------------------------------------------
  _drainUpkeep(dt, a) {
    const upkeepPerMin = this.totalUpkeepPerMin(a);
    if (upkeepPerMin <= 0) {
      // idle hotness decay for traders that completed no cycle this window.
      this._decayHotness(dt, a);
      return;
    }
    a.accumulators.upkeepDebt = (a.accumulators.upkeepDebt || 0) + (upkeepPerMin / 60) * dt;
    const credits = (this.state.player && this.state.player.credits) | 0;
    const whole = Math.floor(a.accumulators.upkeepDebt);
    if (whole >= 1) {
      if (credits >= whole) {
        a.accumulators.upkeepDebt -= whole;
        this.bus.emit('economy:chargeCredits', { amount: whole, reason: 'automation:upkeep' });
        this._undistressAll(a); // paid → assets recover
        a.meta.graceTimer = 0;
      } else {
        // can't pay: pay what we can, distress everything, start the grace timer.
        if (credits > 0) {
          a.accumulators.upkeepDebt -= credits;
          this.bus.emit('economy:chargeCredits', { amount: credits, reason: 'automation:upkeep' });
        }
        this._distressAll(a);
        a.meta.graceTimer = (a.meta.graceTimer || 0) + dt;
        const grace = (a.balance && a.balance.distressGraceSec) || 120;
        if (a.meta.graceTimer >= grace) { a.meta.graceTimer = 0; this._repossessOne(a); }
      }
    }
    this._decayHotness(dt, a);
  },

  _decayHotness(dt, a) {
    const perTick = (HOTNESS_DECAY / 60) * dt;
    for (const t of a.traders) {
      if (t.status === 'idle' || !t.route) t.hotness = Math.max(0, (t.hotness || 0) - perTick);
    }
  },

  totalUpkeepPerMin(a) {
    a = a || this.state.automation;
    let sum = 0;
    for (const g of a.drones) sum += this._upkeepOf(DRONE_BY_ID, g);
    for (const t of a.traders) sum += this._upkeepOf(TRADER_BY_ID, t);
    for (const o of a.outposts) {
      const def = OUTPOST_BY_ID.get(o.defId) || o;
      sum += (def.upkeepPerMin || 0) * Math.pow(1.5, (o.level || 1) - 1);
    }
    return sum;
  },

  _upkeepOf(map, inst) {
    const def = map.get(inst.defId);
    return (def ? def.upkeepPerMin : inst.upkeepPerMin) || 0;
  },

  _distressAll(a) {
    for (const list of [a.drones, a.traders, a.outposts]) {
      for (const x of list) {
        if (x.status !== 'distressed') { x._prevStatus = x.status; x.status = 'distressed'; this.bus.emit('automation:assetDistressed', { kind: kindOf(list, a), id: x.id }); }
      }
    }
  },

  _undistressAll(a) {
    for (const list of [a.drones, a.traders, a.outposts]) {
      for (const x of list) {
        if (x.status === 'distressed') { x.status = x._prevStatus || 'idle'; delete x._prevStatus; }
      }
    }
  },

  // Repossess one (lowest-value) distressed asset — a soft failure, never a hard wipe (spec).
  _repossessOne(a) {
    const candidates = [];
    for (const g of a.drones) candidates.push({ kind: 'drone', inst: g, val: (DRONE_BY_ID.get(g.defId) || {}).cost || 0, list: a.drones });
    for (const t of a.traders) candidates.push({ kind: 'trader', inst: t, val: (TRADER_BY_ID.get(t.defId) || {}).hireCost || 0, list: a.traders });
    for (const o of a.outposts) candidates.push({ kind: 'outpost', inst: o, val: (OUTPOST_BY_ID.get(o.defId) || {}).buildCost || 0, list: a.outposts });
    if (!candidates.length) return;
    candidates.sort((x, y) => x.val - y.val);
    const pick = candidates[0];
    const idx = pick.list.indexOf(pick.inst);
    if (idx >= 0) pick.list.splice(idx, 1);
    this.bus.emit('automation:assetRepossessed', { kind: pick.kind, id: pick.inst.id });
    this.bus.emit('toast', { text: `Asset repossessed (unpaid upkeep): ${pick.kind}`, kind: 'error', ttl: 4 });
  },

  // ------------------------------------------------------------------------------------------
  // THE CAP FUNNEL — every passive credit passes through here (spec risk #1).
  // Per-minute token bucket: income up to the bucket pays full; overflow is crushed to overflowEff.
  // ------------------------------------------------------------------------------------------
  creditPassive(grossAmount, source) {
    let gross = Math.max(0, grossAmount);
    if (gross <= 0) return 0;
    const take = Math.min(gross, Math.max(0, this._capBudget));
    this._capBudget -= take;
    // HARD CLAMP (not the spec's overflowEff credit): the spec's `credited = cap + (net-cap)*0.25`
    // clause is mathematically incompatible with the cap for sustained large gross — 25% of a big
    // lump dwarfs the cap and breaks the upper bound (verified: a full build credited 310/min vs a
    // 250 active rate). The spec's VERIFICATION TARGET (net/min <= passiveCapFrac*A(T), strictly
    // below active play) is the binding constraint, so overflow above the per-minute bucket is
    // dropped rather than credited. This guarantees passive net/min <= capLimit <= active at every
    // tier. (A pending-overflow reservoir was rejected: under sustained over-cap income it never
    // drains, grows unboundedly, and — being serialized in accumulators — would breach the cap in a
    // later session.)
    const credited = Math.round(take);
    if (credited <= 0) return 0;
    this.bus.emit('economy:grantCredits', { amount: credited, reason: 'automation:' + (source || 'passive') });
    this.meta().totalPassiveEarnedLifetime = (this.meta().totalPassiveEarnedLifetime || 0) + credited;
    const stats = this.state.player && this.state.player.stats;
    if (stats) stats.totalPassiveEarnedLifetime = (stats.totalPassiveEarnedLifetime || 0) + credited;
    this.bus.emit('automation:incomeCredited', { amount: credited, source: source || 'passive' });
    return credited;
  },

  passiveCapPerMin() {
    const bal = this.balance();
    const ref = bal.activeRefByTier || AUTO_BALANCE.activeRefByTier;
    const tier = this.playerTier();
    const active = ref[Math.min(tier, ref.length) - 1] || ref[0];
    const frac = bal.passiveCapFrac != null ? bal.passiveCapFrac : 0.45;
    return active * frac;
  },

  // Matches the panel's _playerTier(): clamp(droneTierCap, 1, 5) so the enforced cap == the shown cap.
  playerTier() {
    const cap = (this.state.player && this.state.player.droneTierCap) || 1;
    return clamp(Math.round(cap) || 1, 1, 5);
  },

  // ------------------------------------------------------------------------------------------
  // UI INTENT HANDLER — ui:fleetOrder {shipId, order, targetRef, kind}. The panel multiplexes
  // every action through `order`. Purchases carry targetRef=defId and shipId=null; asset orders
  // carry shipId=instanceId (or, for assignFleet, targetRef=owned-ship index).
  // ------------------------------------------------------------------------------------------
  handleOrder(p) {
    const order = p.order;
    switch (order) {
      case 'buyDrone': return this.buyDrone(p.targetRef);
      case 'recall': return this.recallDrone(p.shipId);
      case 'hireTrader': return this.hireTrader(p.targetRef);
      case 'assignRoute': return this.reroute(p.shipId);
      case 'dismiss': return this.dismissTrader(p.shipId);
      case 'buildOutpost': return this.buildOutpost(p.targetRef);
      case 'decommission': return this.decommissionOutpost(p.shipId);
      case 'assignFleet': return this.assignFleet(p.targetRef);
      case 'orderEscort': return this.setFleetOrder(p.shipId, 'escort', p.targetRef);
      case 'orderMine': return this.setFleetOrder(p.shipId, 'mine', p.targetRef);
      case 'orderRecall': return this.setFleetOrder(p.shipId, 'idle', p.targetRef);
      // V2 §4 / cut-list #28: assign an alphabet template to a drone group (program it). targetRef
      // is the templateId ('mine_to_depot' | 'patrol_guard' | 'scout_report'); null/'' clears it.
      case 'assignProgram': return this.assignProgram(p.shipId, p.targetRef);
      default: return false;
    }
  },

  // Assign (or clear) an alphabet program on a drone group. The drone then runs the template
  // instead of the legacy mine-to-buffer loop — mining into real cargo + selling at a depot.
  assignProgram(droneId, templateId) {
    const g = this.state.automation.drones.find((x) => x.id === droneId);
    if (!g) return false;
    if (!templateId) { clearTemplate(g); this.toast('Drone program cleared (legacy mode)', 'info'); return true; }
    if (!TEMPLATES[templateId]) { this.toast('Unknown program: ' + templateId, 'error'); return false; }
    assignTemplate(g, templateId);
    this.toast('Drone program: ' + TEMPLATES[templateId].name, 'success');
    return true;
  },

  // ---- DRONES ----
  buyDrone(defId) {
    const def = DRONE_BY_ID.get(defId);
    if (!def) return false;
    if (def.tier > this.playerTier()) { this.toast('Drone tier locked', 'error'); return false; }
    if (!this._charge(def.cost, 'buy:' + defId)) return false;
    const ppos = this._playerPos();
    const g = {
      id: this._allocId(), defId, count: 1, tier: def.tier,
      sectorId: (this.state.world && this.state.world.currentSectorId) || 'sector_helios_prime',
      fieldId: this._currentFieldId(), oreType: this._currentOreId(),
      originPos: ppos ? { x: ppos.x, z: ppos.z } : { x: 0, z: 0 }, // deploy-range anchor for the field seek
      buffer: 0, bufferCap: def.bufferCap, fuel: def.fuelMax, fuelMax: def.fuelMax,
      durability: def.durabilityMax, durabilityMax: def.durabilityMax,
      autoReturn: false, status: 'mining', ratePerMin: 0, entityIds: [],
    };
    this.state.automation.drones.push(g);
    this._spawnDroneEntities(g, def); // materialize the real flying drones near the nearest field
    this.bus.emit('asset:deployed', { kind: 'drone', id: g.id });
    this.toast(`Drone deployed (${prettySector(g.sectorId)})`, 'success');
    return true;
  },

  recallDrone(id) {
    const a = this.state.automation;
    const idx = a.drones.findIndex((g) => g.id === id);
    if (idx < 0) return false;
    const g = a.drones[idx];
    const value = this._droneBufferValue(g);
    if (value > 0) this.creditPassive(value, 'drone'); // bank the buffer through the cap funnel
    // refuel cost on recall (attention cost): (fuelMax - fuel)*0.5 cr
    const def = DRONE_BY_ID.get(g.defId) || g;
    const refuel = Math.round(((def.fuelMax || 0) - (g.fuel || 0)) * 0.5);
    if (refuel > 0) this._charge(refuel, 'drone:refuel');
    this._releaseDroneEntities(g); // despawn the flying drones
    a.drones.splice(idx, 1);
    this.toast(`Drone recalled (+${value} cr ore, -${refuel} cr fuel)`, 'success');
    return true;
  },

  // ---- TRADERS ----
  hireTrader(defId) {
    const def = TRADER_BY_ID.get(defId);
    if (!def) return false;
    if (!this._charge(def.hireCost, 'hire:' + defId)) return false;
    const t = {
      id: this._allocId(), defId, tier: def.tier,
      route: this._pickRoute(), good: DRONE_ORE_ID,
      cycleProgress: 0, cycleTime: def.cycleTime, cargoVol: def.cargoVol,
      lastCycleProfit: 0, upkeepPerMin: def.upkeepPerMin, hotness: 0,
      status: 'enroute', ratePerMin: 0,
    };
    if (t.route) t.route.good = DRONE_ORE_ID;
    this.state.automation.traders.push(t);
    this.bus.emit('asset:deployed', { kind: 'trader', id: t.id });
    this.toast(`Trader hired — route ${routeLabel(t.route)}`, 'success');
    return true;
  },

  // Re-roll the trade route (the panel "Route" button — no station picker, so we auto-pick a fresh
  // profitable pair and reset hotness, which is the in-fiction "re-route" management action).
  reroute(id) {
    const t = this.state.automation.traders.find((x) => x.id === id);
    if (!t) return false;
    t.route = this._pickRoute(t.route);
    if (t.route) t.route.good = DRONE_ORE_ID;
    t.hotness = 0;
    t.status = 'enroute';
    this.toast(`Trader re-routed — ${routeLabel(t.route)}`, 'info');
    return true;
  },

  dismissTrader(id) {
    const a = this.state.automation;
    const idx = a.traders.findIndex((x) => x.id === id);
    if (idx < 0) return false;
    a.traders.splice(idx, 1);
    this.toast('Trader dismissed', 'info');
    return true;
  },

  // Pick a 2-station A->B route: A produces our good cheaply, B consumes it dearly. Falls back to
  // any two distinct stations. Deterministic-ish (price-driven), avoids re-picking the same pair.
  _pickRoute(avoid) {
    const econ = this._economy();
    const good = DRONE_ORE_ID;
    let bestA = null, bestB = null, bestBuy = Infinity, bestSell = -Infinity;
    for (const st of ALL_STATIONS) {
      if (econ && econ.getMarket) econ.getMarket(st.id); // warm the market so a price exists
      const buy = econ ? (econ.priceOf(st.id, good, 'buy') || 0) : 0;
      const sell = econ ? (econ.priceOf(st.id, good, 'sell') || 0) : 0;
      if (buy > 0 && buy < bestBuy) { bestBuy = buy; bestA = st.id; }
      if (sell > bestSell) { bestSell = sell; bestB = st.id; }
    }
    if (!bestA || !bestB || bestA === bestB) {
      // fallback: first two distinct stations
      bestA = ALL_STATIONS[0] && ALL_STATIONS[0].id;
      bestB = (ALL_STATIONS.find((s) => s.id !== bestA) || {}).id || bestA;
    }
    if (avoid && avoid.from === bestA && avoid.to === bestB) {
      const alt = ALL_STATIONS.find((s) => s.id !== bestA && s.id !== bestB);
      if (alt) bestB = alt.id;
    }
    return { from: bestA, to: bestB, good };
  },

  // ---- OUTPOSTS ----
  buildOutpost(defId) {
    const def = OUTPOST_BY_ID.get(defId);
    if (!def) return false;
    if (!this._charge(def.buildCost, 'build:' + defId)) return false;
    const o = {
      id: this._allocId(), defId, level: 1,
      sectorId: (this.state.world && this.state.world.currentSectorId) || 'sector_helios_prime',
      pos: { x: 0, z: 0 }, recipeId: defId,
      storage: 0, storageCap: def.storageCap, defense: def.defense,
      upkeepPerMin: def.upkeepPerMin, autoSell: true, raidCooldown: 0,
      status: 'producing', ratePerMin: 0,
    };
    this.state.automation.outposts.push(o);
    this.bus.emit('asset:deployed', { kind: 'outpost', id: o.id });
    this.toast(`Outpost established in ${prettySector(o.sectorId)}`, 'success');
    return true;
  },

  decommissionOutpost(id) {
    const a = this.state.automation;
    const idx = a.outposts.findIndex((o) => o.id === id);
    if (idx < 0) return false;
    a.outposts.splice(idx, 1);
    this.toast('Outpost decommissioned', 'info');
    return true;
  },

  // ---- FLEET ----
  assignFleet(ownedShipIndex) {
    const a = this.state.automation;
    const cap = this.fleetCap();
    if (a.fleet.length >= cap) { this.toast('Fleet at capacity', 'error'); return false; }
    const owned = (this.state.player && this.state.player.ownedShips) || [];
    const i = Number(ownedShipIndex);
    const ship = owned[i];
    if (!ship) return false;
    const fs = {
      id: this._allocId(), shipDefId: ship.defId, defId: ship.defId,
      name: ship.customName || null, order: 'escort', targetRef: null,
      redeployTimer: 0, hp: 1, hullPct: 1, status: 'escort',
    };
    a.fleet.push(fs);
    this.toast('Wingman assigned', 'success');
    return true;
  },

  setFleetOrder(id, order, targetRef) {
    const fs = this.state.automation.fleet.find((x) => x.id === id);
    if (!fs) return false;
    fs.order = order;
    fs.targetRef = targetRef != null ? { kind: 'ref', refId: targetRef } : null;
    fs.redeployTimer = 2; // brief redeploy delay (spec)
    fs.status = order;
    return true;
  },

  fleetCap() {
    const a = this.state.automation;
    const byTier = (a.balance && a.balance.fleetCapByTier) || AUTO_BALANCE.fleetCapByTier || [2, 3, 4, 6, 8];
    const cap = byTier[this.playerTier() - 1] || byTier[0];
    a.fleetCap = cap;
    return cap;
  },

  // Count guard-order fleet ships protecting a given asset (cuts loss/raid probability).
  _guardCountFor(kind, assetId, a) {
    a = a || this.state.automation;
    let n = 0;
    for (const fs of a.fleet) {
      if (fs.order === 'guard' && fs.targetRef && fs.targetRef.refId == assetId) n++;
    }
    return n;
  },

  // ------------------------------------------------------------------------------------------
  // COMBAT DAMAGE TO ASSETS — drone durability / outpost/fleet hp; may trigger LOST.
  // ------------------------------------------------------------------------------------------
  onHitAsset(p) {
    const a = this.state.automation;
    const dmg = p.damage || 0;
    if (p.assetKind === 'drone') {
      const idx = a.drones.findIndex((g) => g.id === p.assetId);
      if (idx < 0) return;
      const g = a.drones[idx];
      g.durability = Math.max(0, (g.durability || 0) - dmg);
      if (g.durability <= 0) { this._releaseDroneEntities(g); this._loseAsset('drone', g, this._droneBufferValue(g), g.sectorId); a.drones.splice(idx, 1); }
    } else if (p.assetKind === 'fleet') {
      const fs = a.fleet.find((x) => x.id === p.assetId);
      if (!fs) return;
      fs.hp = Math.max(0, (fs.hp || 1) - dmg / 100);
      fs.hullPct = fs.hp;
      if (fs.hp <= 0) { const i = a.fleet.indexOf(fs); if (i >= 0) a.fleet.splice(i, 1); this._loseAsset('fleet', fs, 0, null); }
    }
  },

  _loseAsset(kind, inst, value, sectorId) {
    this.meta().lostAssetsLog.push({ kind, id: inst.id, value: value || 0, t: this.state.simTime || 0 });
    this.bus.emit('automation:assetLost', { kind, id: inst.id, value: value || 0, sectorId: sectorId || null });
    this.bus.emit('toast', { text: `${kind} lost${sectorId ? ' in ' + prettySector(sectorId) : ''}`, kind: 'error', ttl: 4 });
  },

  // ------------------------------------------------------------------------------------------
  // OFFLINE / AWAY CATCH-UP (spec): one coarse pass over elapsed time, capped + offlineEff-scaled.
  // ------------------------------------------------------------------------------------------
  runOfflineCatchup() {
    const a = this.state.automation;
    if (!a) return;
    const bal = a.balance || AUTO_BALANCE;
    const last = (a.meta && a.meta.lastTickTime) || 0;
    if (!last) { a.meta.lastTickTime = nowMs(); return; }
    let elapsed = (nowMs() - last) / 1000;
    elapsed = clamp(elapsed, 0, bal.offlineCapSec || 14400); // guard negative clock + cap at 4h
    a.meta.lastTickTime = nowMs();
    if (elapsed < 1) return;

    const offlineEff = bal.offlineEff != null ? bal.offlineEff : 0.6;
    // Size the cap bucket to the WHOLE elapsed window (capLimit/min * minutes), not one minute —
    // otherwise the hard clamp would credit at most one minute's cap for up to 4h away. This keeps
    // the offline lump cap-consistent (avg/min <= capLimit) while letting it actually catch up.
    this._capBudget = this.passiveCapPerMin() * (elapsed / 60);

    let droneCr = 0, traderCr = 0, cycles = 0, lost = 0;

    // drones: fill buffer (capped), bank value
    for (const g of a.drones) {
      const def = DRONE_BY_ID.get(g.defId) || g;
      const room = (g.bufferCap || def.bufferCap || 0) - (g.buffer || 0);
      const mined = Math.min((def.mineRate || 0) * (g.count || 1) * elapsed, room);
      g.buffer = (g.buffer || 0) + mined;
      const v = (g.buffer || 0) * this._orePrice(g.oreType || DRONE_ORE_ID);
      g.buffer = 0;
      droneCr += v;
    }
    // outposts: fill storage (capped), autosell at -20%
    for (const o of a.outposts) {
      const def = OUTPOST_BY_ID.get(o.defId) || o;
      const level = o.level || 1;
      const outRate = (def.outRate || 0) * Math.pow(1.6, level - 1);
      const cap = (def.storageCap || 0) * Math.pow(1.7, level - 1);
      const produced = Math.min(outRate * elapsed, cap);
      if (def.recipe && def.recipe.passive) droneCr += produced;
      else droneCr += produced * this._orePrice(def.recipe && def.recipe.output ? Object.keys(def.recipe.output)[0] : DRONE_ORE_ID) * 0.8;
    }
    // traders: complete floor(elapsed/cycleTime) cycles with one aggregated survival roll
    for (let i = a.traders.length - 1; i >= 0; i--) {
      const t = a.traders[i];
      const def = TRADER_BY_ID.get(t.defId) || t;
      if (!t.route) continue;
      const n = Math.floor(elapsed / (def.cycleTime || 180));
      if (n <= 0) continue;
      const pLoss = this._traderLossProb(t, def, a);
      const survival = Math.pow(1 - pLoss, n);
      if (this._rng() >= survival) { // aggregated loss
        a.traders.splice(i, 1);
        this._loseAsset('trader', t, def.hireCost || 0, this._routeSectorId(t));
        lost++;
        continue;
      }
      const per = this._computeTraderProfit(t, def);
      traderCr += Math.max(0, per) * n;
      cycles += n;
    }

    // realized credits scaled by offlineEff (presence is always better), then funnelled through cap.
    const grossOffline = (droneCr + traderCr) * offlineEff;
    const credited = grossOffline > 0 ? this.creditPassive(grossOffline, 'offline') : 0;
    // deduct upkeep for the elapsed window
    const upkeep = Math.round(this.totalUpkeepPerMin(a) * (elapsed / 60));
    if (upkeep > 0) this.bus.emit('economy:chargeCredits', { amount: upkeep, reason: 'automation:upkeep:offline' });

    const hrs = (elapsed / 3600).toFixed(1);
    this.bus.emit('automation:offlineSummary', {
      elapsedSec: Math.round(elapsed), droneCr: Math.round(droneCr * offlineEff),
      traderCr: Math.round(traderCr * offlineEff), credited, cycles, lost, upkeep,
    });
    if (credited > 0 || cycles > 0 || lost > 0) {
      this.bus.emit('toast', { text: `While away (${hrs}h): +${credited} cr, ${cycles} cycles${lost ? `, ${lost} lost` : ''}`, kind: 'info', ttl: 6 });
    }
  },

  // ------------------------------------------------------------------------------------------
  // OFFSCREEN SECTOR-SIM RISK PASS (ADR-0002 / V2 §33): sectorSim calls this once per day-tick with
  // an effective-danger resolver so trader/outpost losses in non-current sectors roll against the
  // drifted danger, not the static catalog. It owns state.automation (sole writer) and reuses the
  // existing _traderLossProb / _outpostRaid / _loseAsset machinery — no parallel loss path.
  //
  // days        = in-game days to advance
  // dangerFor   = (sectorId) => effective dangerIndex 0..1, provided by sectorSim
  // Returns the number of assets lost this pass (for telemetry).
  // ------------------------------------------------------------------------------------------
  offscreenRiskPass(days, dangerFor) {
    const a = this.state.automation;
    if (!a) return 0;
    // Install the resolver so _routeDanger (and _outpostRaids via the same hook) read drifted danger.
    const prevResolver = this._dangerResolver;
    this._dangerResolver = typeof dangerFor === 'function' ? dangerFor : null;
    let lost = 0;
    try {
      // Only assets whose route/sector is NOT the player's current sector are at offscreen risk —
      // assets in the current sector are already tick-simulated (view boundary = simulation boundary).
      const currentId = (this.state.world && this.state.world.currentSectorId) || null;

      // Traders: one aggregated survival roll over `days` worth of cycles (mirrors runOfflineCatchup).
      for (let i = a.traders.length - 1; i >= 0; i--) {
        const t = a.traders[i];
        const def = TRADER_BY_ID.get(t.defId) || t;
        if (!t.route) continue;
        const routeSector = this._routeSectorId(t);
        if (routeSector === currentId) continue;       // in-view: handled by the live tick
        const cycleTime = (def && def.cycleTime) || 180;
        const daySeconds = 600;
        const n = Math.max(1, Math.floor((days * daySeconds) / cycleTime));
        const pLoss = this._traderLossProb(t, def, a);
        const survival = Math.pow(1 - pLoss, n);
        if (this._rng() >= survival) {
          a.traders.splice(i, 1);
          this._loseAsset('trader', t, def.hireCost || 0, routeSector);
          lost++;
        }
      }

      // Outposts: a danger-driven raid roll scaled by `days` (mirrors _outpostRaids probability
      // shape but aggregated). A raided outpost loses a fraction of stored output, not the asset.
      for (const o of a.outposts) {
        if (o.sectorId === currentId) continue;        // in-view
        if (o.status === 'distressed' || o.status === 'raided') continue;
        const danger = dangerFor ? (dangerFor(o.sectorId) || 0) : 0;
        if (danger <= 0) continue;
        const def = OUTPOST_BY_ID.get(o.defId) || o;
        const level = o.level || 1;
        const defense = (def.defense || 0) + 15 * (level - 1);
        const guard = this._guardCountFor('outpost', o.id, a) > 0 ? 1.8 : 1;
        const defenseMult = (defense / 20) * guard;
        const pRaidPerDay = clamp(danger * 0.4 / (defenseMult || 1), 0, 0.5);
        const pRaid = 1 - Math.pow(1 - pRaidPerDay, days);
        if (this._rng() < pRaid) {
          // Lose ~25% of stored volume — raid, not destruction (outpost survives, status flags it).
          const lossVol = Math.floor((o.storage || 0) * 0.25);
          if (lossVol > 0) {
            o.storage = Math.max(0, (o.storage || 0) - lossVol);
            o.status = 'raided';
            o.raidCooldown = 600;                      // matches _outpostRaids cooldown
            this.bus.emit('automation:outpostRaided', { outpostId: o.id, sectorId: o.sectorId, lossVol });
          }
        }
      }
    } finally {
      this._dangerResolver = prevResolver;             // always restore (live tick keeps static danger)
    }
    return lost;
  },

  // ------------------------------------------------------------------------------------------
  // helpers / glue
  // ------------------------------------------------------------------------------------------
  balance() { return (this.state.automation && this.state.automation.balance) || AUTO_BALANCE; },
  meta() {
    const a = this.state.automation;
    if (!a.meta) a.meta = { lastTickTime: 0, totalPassiveEarnedLifetime: 0, lostAssetsLog: [], rngSeed: 0 };
    if (!a.meta.lostAssetsLog) a.meta.lostAssetsLog = [];
    return a.meta;
  },

  _economy() { return (this._registry && this._registry.get) ? this._registry.get('economy') : null; },

  // Best-effort live price for a commodity at a station (buy=A cost, sell=B proceeds); falls back to
  // the closed-form quote, then to the nominal ore value, so a trader never silently earns 0.
  _stationPrice(stationId, commodityId, side, qty) {
    const econ = this._economy();
    if (econ) {
      if (econ.quote) {
        const q = econ.quote(stationId, commodityId, side, Math.max(1, Math.floor(qty || 1)));
        if (q && q.ok && q.unitAvg > 0) return q.unitAvg;
      }
      if (econ.priceOf) { const p = econ.priceOf(stationId, commodityId, side); if (p) return p; }
    }
    return DRONE_ORE_FALLBACK_VALUE;
  },

  // Nominal per-unit value for an ore/good (best market price at the home station, else basePrice).
  _orePrice(commodityId) {
    const econ = this._economy();
    if (econ && econ.priceOf) {
      const home = this._homeStation();
      if (home) { const p = econ.priceOf(home, commodityId, 'sell'); if (p) return p; }
    }
    return DRONE_ORE_FALLBACK_VALUE;
  },

  _homeStation() {
    const sid = (this.state.world && this.state.world.currentSectorId) || 'sector_helios_prime';
    const sec = SECTOR_BY_ID.get(sid);
    const st = sec && sec.stations && sec.stations[0];
    return st ? st.id : (ALL_STATIONS[0] && ALL_STATIONS[0].id) || null;
  },

  _currentFieldId() {
    const af = this.state.world && this.state.world.activeSector;
    const f = af && af.fields && af.fields[0];
    return f ? f.id : null;
  },

  _currentOreId() { return DRONE_ORE_ID; },

  // charge with an affordability guard (chargeCredits clamps silently at 0 and won't report failure).
  _charge(amount, reason) {
    amount = Math.round(amount || 0);
    if (amount <= 0) return true;
    if (((this.state.player && this.state.player.credits) | 0) < amount) { this.toast('Insufficient credits', 'error'); return false; }
    this.bus.emit('economy:chargeCredits', { amount, reason: 'automation:' + reason });
    return true;
  },

  toast(text, kind) { this.bus.emit('toast', { text, kind: kind || 'info', ttl: 3 }); },

  _allocId() { return 'au_' + (this._nextId++); },

  // ---- seeded RNG (§0.5) — loss/raid rolls; deterministic + reproducible across save/offline ----
  _initRng(reset = false) {
    const state = this.state;
    const seed = (state.meta && state.meta.seed) || 1;
    if (!state.automation.meta) state.automation.meta = {};
    if (reset || !Number.isFinite(state.automation.meta.rngSeed) || (state.automation.meta.rngSeed >>> 0) === 0) {
      state.automation.meta.rngSeed = hash32(seed, 'automation');
    }
    const fn = () => this._rng();
    Object.defineProperty(fn, 'seed', { get: () => (this.state.automation && this.state.automation.meta && this.state.automation.meta.rngSeed) || 0 });
    state.automation.rng = fn;
    this.rng = fn;
  },

  _rng() {
    if (!this.state.automation) this.state.automation = makeDefaultAutomation();
    if (!this.state.automation.meta) this.state.automation.meta = {};
    return drawSeeded(this.state.automation.meta, 'rngSeed', hash32(this.state.meta && this.state.meta.seed, 'automation'));
  },

  // Heal a deserialized / partial automation tree to the full schema (§3.9).
  _normalizeAutomation(a) {
    a.drones = a.drones || [];
    // entityIds are runtime-only; a fresh load/normalize starts with none so they re-spawn in-sector.
    for (const g of a.drones) g.entityIds = [];
    a.traders = a.traders || [];
    a.outposts = a.outposts || [];
    a.fleet = a.fleet || [];
    if (a.fleetCap == null) a.fleetCap = 0;
    a.balance = Object.assign({}, AUTO_BALANCE, a.balance || {});
    a.accumulators = a.accumulators || { creditBuffer: 0, upkeepDebt: 0 };
    if (a.accumulators.upkeepDebt == null) a.accumulators.upkeepDebt = 0;
    if (a.accumulators.creditBuffer == null) a.accumulators.creditBuffer = 0;
    a.meta = a.meta || {};
    if (a.meta.lastTickTime == null) a.meta.lastTickTime = 0;
    if (a.meta.totalPassiveEarnedLifetime == null) a.meta.totalPassiveEarnedLifetime = 0;
    if (!a.meta.lostAssetsLog) a.meta.lostAssetsLog = [];
    if (a.meta.rngSeed == null) a.meta.rngSeed = 0;
  },

  // ------------------------------------------------------------------------------------------
  // newGame / save-load (§4.5 — save key 'automation', order 9)
  // ------------------------------------------------------------------------------------------
  newGame() {
    this.state.automation = makeDefaultAutomation();
    this._normalizeAutomation(this.state.automation);
    this._initRng(true);
    this.state.automation.meta.lastTickTime = nowMs();
    this._nextId = 1;
    this._capBudget = 0;
    this._outpostRaidAccum = 0;
    this._outpostSellAccum = 0;
  },

  serialize() {
    const a = this.state.automation;
    // strip transient rng fn; stamp lastTickTime so offline catch-up has a baseline.
    a.meta.lastTickTime = nowMs();
    // entityIds are live runtime ids (don't survive save/load or sector unload) → strip them; the
    // flying drones re-spawn from the group on the next in-sector tick.
    const drones = a.drones.map((g) => { const { entityIds, ...rest } = g; return rest; });
    return {
      drones, traders: a.traders, outposts: a.outposts, fleet: a.fleet,
      fleetCap: a.fleetCap, balance: a.balance, accumulators: a.accumulators,
      meta: { lastTickTime: a.meta.lastTickTime, totalPassiveEarnedLifetime: a.meta.totalPassiveEarnedLifetime, lostAssetsLog: a.meta.lostAssetsLog, rngSeed: a.meta.rngSeed },
      nextId: this._nextId,
    };
  },

  deserialize(data) {
    if (!data) return;
    const a = this.state.automation = Object.assign(makeDefaultAutomation(), data);
    this._normalizeAutomation(a);
    this._nextId = data.nextId || (a.drones.length + a.traders.length + a.outposts.length + a.fleet.length + 1);
    this._initRng(); // rebuild the rng fn from the restored rngSeed → deterministic continuation
    this._capBudget = 0;
    this._outpostRaidAccum = 0;
    this._outpostSellAccum = 0;
    // runOfflineCatchup() runs on the subsequent save:loaded event.
  },
};

// ---- module-scope helpers -----------------------------------------------------------------------
function makeDefaultAutomation() {
  return {
    drones: [], traders: [], outposts: [], fleet: [],
    fleetCap: 0,
    balance: Object.assign({}, AUTO_BALANCE),
    accumulators: { creditBuffer: 0, upkeepDebt: 0 },
    meta: { lastTickTime: 0, totalPassiveEarnedLifetime: 0, lostAssetsLog: [], rngSeed: 0 },
  };
}

function nowMs() {
  return (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;
}

function kindOf(list, a) {
  if (list === a.drones) return 'drone';
  if (list === a.traders) return 'trader';
  if (list === a.outposts) return 'outpost';
  return 'asset';
}

function prettySector(id) {
  return String(id || '').replace(/^sector_/, '').replace(/_/g, ' ');
}

function routeLabel(route) {
  if (!route) return 'idle';
  return `${prettyStation(route.from)} → ${prettyStation(route.to)}`;
}

function prettyStation(id) {
  return String(id || '?').replace(/^station_/, '').replace(/_/g, ' ');
}
