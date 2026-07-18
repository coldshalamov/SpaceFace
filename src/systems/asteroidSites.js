// Asteroid sites — durable machine-design surface grown inside drilled asteroids.
// Design: design/ASTEROID_SITES_BRIEF.md. Owns ONLY state.sites (plus the documented
// tile.structure stamp on live drill fields and site markers under asteroid ent.data).
//
// Ownership contract (root AGENTS.md §6):
//   • Credits: NEVER written here. Courier sale gross funnels through the automation system's
//     creditPassive() token bucket — the single anti-idle passive-income cap — which itself only
//     emits economy:grantCredits intents.
//   • Player cargo: moved only through the canonical cargo writers (addCargo/removeCargo).
//   • Determinism: state.simTime cadence + drawSeeded(state.sites.meta) streams. No wall clock,
//     no Math.random. Courier losses are seeded-stochastic (brief §6).
//
// Durability model (brief §3): any machine creates a site record, but the record stays
// UNANCHORED — tied to its live asteroid entity — until a Massline Core is installed. Asteroid
// entities re-roll ids/layout every sector materialization, so an unanchored site dies with its
// rock (the UI warns). Installing the Core freezes the bore layout (ent.data.boreSeed), records a
// physical anchor, and from then on this system re-spawns the same rock, same interior, every
// sector visit. The Core IS the persistence mechanic, not a buff.
//
// Excavation stays owned by systems/drill.js. This system reads the same field math
// (generateDrillField + cleared list) to recompute machine contact rings with no live session —
// the contact ring (brief §1) is sacred: hollowing a neighbor permanently costs that contact.
import { generateDrillField, applyClearedTiles, normalizeClearedTiles, tileIndex, DRILL_CONST } from './drill.js';
import { addCargo, removeCargo } from './cargo.js';
import {
  SITE_MACHINES, SITE_MACHINE_BY_ID, SITE_RECIPE_BY_ID, SITE_BALANCE,
} from '../data/sites.js';
import {
  contactProfile, machineCapability, stepContinuousRecipe, stepFabricator, clamp01, round3,
} from './siteProduction.js';
import {
  buildComponents, laneCapacity, storeTotal, reconcileStores, podLossChance, podTravelS,
} from './siteLogistics.js';
import { SECTORS, dangerIndex } from '../data/sectors.js';
import { COMMODITIES } from '../data/commodities.js';
import { drawSeeded, hash32 } from '../core/rng.js';

const { COLS, ROWS } = DRILL_CONST;
const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));

const SITES_SCHEMA_VERSION = 1;

function makeDefaultSites() {
  return {
    schemaVersion: SITES_SCHEMA_VERSION,
    nextSiteNum: 1,
    order: [],
    byId: {},
    meta: { rngSeed: 0 },
  };
}

function makeLedgerEntry(t, kind, text) {
  return { t: Math.round((Number(t) || 0) * 10) / 10, kind, text };
}

export function makeSiteRecord({ id, asteroidId, sectorId, fieldId, createdT }) {
  return {
    id,
    createdT: Number(createdT) || 0,
    sectorId: sectorId || null,
    fieldId: fieldId || null,
    anchored: false,
    asteroidId: asteroidId ?? null,
    boreSeed: null,           // frozen at core install; until then the live entity id seeds the bore
    anchor: null,             // { x, z, radius, typeId, yieldU } — physical re-spawn recipe
    cleared: [],
    machines: [],
    nextMachineNum: 1,
    overlays: { power: [], lane: [] },
    laneStores: [],           // [{ cells:[idx], store:{goodId:qty} }] — persisted per lane network
    exportOff: Object.fromEntries(SITE_BALANCE.exportDefaultOff.map((id) => [id, true])),
    exportBuffer: {},
    fleet: {
      podsReady: 0,
      podTarget: SITE_BALANCE.defaultPodTarget,
      inFlight: [],           // [{ launchT, arriveT, cargo:{goodId:qty}, lost, stationId }]
      launches: 0, delivered: 0, lost: 0, lastLaunchT: -1e9,
    },
    ledger: [],
    stats: { grossCr: 0, creditedCr: 0, exportedU: 0 },
  };
}

export const asteroidSites = {
  name: 'asteroidSites',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.ctx = ctx;
    this._registry = ctx.registry || null;
    ctx.asteroidSites = this;

    const state = this.state;
    if (!state.sites) state.sites = makeDefaultSites();
    this._normalize(state.sites);

    this._accum = 0;
    this._rt = new Map(); // siteId -> transient runtime caches (field, networks, geo, status)

    // Stamp machine housings onto the live drill field the moment a session opens, so the rover
    // is blocked by them and the screen can draw them. tile.structure is the ONE documented write
    // this system makes into state.drill (co-ownership noted in drill.js).
    this.bus.on('drill:start', ({ asteroidId }) => {
      const site = this.siteForAsteroid(asteroidId);
      if (site) this._stampStructures(site);
    });

    // Mirror excavation into the durable record: every broken tile is a permanently hollow cell
    // (and a permanently destroyed contact for any machine beside it — the whole game).
    this.bus.on('drill:break', ({ col, row }) => {
      const d = state.drill;
      if (!d) return;
      const site = this.siteForAsteroid(d.asteroidId);
      if (!site) return;
      const idx = tileIndex(col, row);
      if (!site.cleared.includes(idx)) site.cleared.push(idx);
      this._markDirty(site.id, { field: true });
    });

    this.bus.on('drill:end', ({ asteroidId }) => {
      const site = this.siteForAsteroid(asteroidId);
      if (!site) return;
      const ent = state.entities && state.entities.get ? state.entities.get(asteroidId) : null;
      if (ent && ent.data && Array.isArray(ent.data.drillCleared)) {
        site.cleared = normalizeClearedTiles(ent.data.drillCleared);
        this._markDirty(site.id, { field: true });
      }
    });

    // Anchored sites re-materialize their rock on every sector visit (self-healing in _repairTick,
    // this listener just makes it prompt). Unanchored sites die with their re-rolled rock.
    this.bus.on('sector:enter', () => { this._repairSweepWanted = true; });
    this.bus.on('save:loaded', () => {
      this._rt.clear();
      this._repairSweepWanted = true;
    });
  },

  newGame() {
    this.state.sites = makeDefaultSites();
    this._rt = new Map();
    this._accum = 0;
  },

  serialize() {
    const src = this.state.sites || makeDefaultSites();
    const byId = {};
    const order = [];
    for (const id of src.order) {
      const site = src.byId[id];
      // Unanchored sites are physically tied to a transient rock: they survive in-session saves
      // only if their entity does, and entity links can't be trusted across arbitrary loads.
      // Ship the anchored ones; the UI is explicit that pre-Core work is at risk.
      if (!site || !site.anchored) continue;
      byId[id] = JSON.parse(JSON.stringify(site));
      order.push(id);
    }
    return {
      schemaVersion: SITES_SCHEMA_VERSION,
      nextSiteNum: src.nextSiteNum,
      order,
      byId,
      meta: { rngSeed: src.meta && src.meta.rngSeed || 0 },
    };
  },

  deserialize(data) {
    const next = makeDefaultSites();
    if (data && typeof data === 'object') {
      next.nextSiteNum = Math.max(1, Math.trunc(Number(data.nextSiteNum) || 1));
      if (data.meta && Number.isFinite(data.meta.rngSeed)) next.meta.rngSeed = data.meta.rngSeed >>> 0;
      const order = Array.isArray(data.order) ? data.order : Object.keys(data.byId || {}).sort();
      for (const id of order) {
        const site = data.byId && data.byId[id];
        if (!site || typeof site !== 'object') continue;
        next.byId[id] = JSON.parse(JSON.stringify(site));
        next.order.push(id);
      }
    }
    this.state.sites = next;
    this._normalize(next);
    this._rt = new Map();
    this._repairSweepWanted = true;
  },

  _normalize(sites) {
    if (!sites.byId) sites.byId = {};
    if (!Array.isArray(sites.order)) sites.order = Object.keys(sites.byId).sort();
    if (!sites.meta) sites.meta = { rngSeed: 0 };
    for (const id of sites.order) {
      const site = sites.byId[id];
      if (!site) continue;
      site.cleared = normalizeClearedTiles(site.cleared);
      if (!site.overlays) site.overlays = { power: [], lane: [] };
      site.overlays.power = normalizeClearedTiles(site.overlays.power);
      site.overlays.lane = normalizeClearedTiles(site.overlays.lane);
      if (!Array.isArray(site.machines)) site.machines = [];
      if (!Array.isArray(site.laneStores)) site.laneStores = [];
      if (!site.exportOff) site.exportOff = {};
      if (!site.exportBuffer) site.exportBuffer = {};
      if (!site.fleet) site.fleet = makeSiteRecord({}).fleet;
      if (!Array.isArray(site.fleet.inFlight)) site.fleet.inFlight = [];
      if (!Array.isArray(site.ledger)) site.ledger = [];
      if (!site.stats) site.stats = { grossCr: 0, creditedCr: 0, exportedU: 0 };
      for (const m of site.machines) {
        if (!m.carry) m.carry = {};
        if (m.job === undefined) m.job = null;
      }
    }
  },

  // ------------------------------------------------------------------ lookups

  siteForAsteroid(asteroidId) {
    if (asteroidId == null) return null;
    const ent = this.state.entities && this.state.entities.get ? this.state.entities.get(asteroidId) : null;
    const siteId = ent && ent.data && ent.data.siteId;
    if (!siteId) return null;
    const site = this.state.sites && this.state.sites.byId[siteId];
    return (site && (site.asteroidId === asteroidId)) ? site : null;
  },

  getSite(siteId) {
    return (this.state.sites && this.state.sites.byId[siteId]) || null;
  },

  machineAt(site, col, row) {
    if (!site) return null;
    for (const m of site.machines) {
      if (m.col === col && m.row === row) return m;
    }
    return null;
  },

  hasCore(site) {
    return !!site && site.machines.some((m) => m.defId === 'sm_massline_core');
  },

  // ------------------------------------------------------------ runtime caches

  /** Field + networks + geo caches, rebuilt lazily on the flags set by _markDirty. */
  _runtime(site) {
    let rt = this._rt.get(site.id);
    if (!rt) {
      rt = { field: null, fieldDirty: true, netDirty: true, geoDirty: true, status: {}, compRatio: {}, laneComps: [], powerComps: [], stores: {}, capacity: {}, geo: {} };
      this._rt.set(site.id, rt);
    }
    if (rt.fieldDirty || !rt.field) {
      const seed = Number.isFinite(site.boreSeed) ? site.boreSeed : site.asteroidId;
      rt.field = generateDrillField((seed >>> 0) || 1);
      applyClearedTiles(rt.field, site.cleared);
      rt.fieldDirty = false;
      rt.geoDirty = true;
    }
    if (rt.netDirty) {
      const machineCells = new Map();
      for (const m of site.machines) machineCells.set(tileIndex(m.col, m.row), m.id);
      rt.powerComps = buildComponents(new Set(site.overlays.power), machineCells, COLS);
      rt.laneComps = buildComponents(new Set(site.overlays.lane), machineCells, COLS);
      // Re-home persisted lane stock onto the new topology, then persist the mapping back.
      const merged = reconcileStores(site.laneStores, rt.laneComps);
      site.laneStores = rt.laneComps.map((comp) => ({ cells: comp.cells.slice(), store: merged[comp.key] || {} }));
      rt.stores = {};
      rt.capacity = {};
      for (let i = 0; i < rt.laneComps.length; i++) {
        const comp = rt.laneComps[i];
        rt.stores[comp.key] = site.laneStores[i].store;
        rt.capacity[comp.key] = laneCapacity(comp, (mid) => {
          const m = site.machines.find((x) => x.id === mid);
          const def = m && SITE_MACHINE_BY_ID.get(m.defId);
          return (def && def.storeBonus) || 0;
        });
      }
      rt.laneCompByMachine = {};
      for (const comp of rt.laneComps) {
        for (const mid of comp.machineIds) rt.laneCompByMachine[mid] = comp.key;
      }
      rt.powerCompByMachine = {};
      for (const comp of rt.powerComps) {
        for (const mid of comp.machineIds) rt.powerCompByMachine[mid] = comp.key;
      }
      rt.netDirty = false;
    }
    if (rt.geoDirty) {
      rt.geo = {};
      for (const m of site.machines) {
        rt.geo[m.id] = contactProfile(rt.field, m.col, m.row, COLS, ROWS);
      }
      rt.geoDirty = false;
    }
    return rt;
  },

  _markDirty(siteId, { field = false, net = false } = {}) {
    const rt = this._rt.get(siteId);
    if (!rt) return;
    if (field) { rt.fieldDirty = true; rt.geoDirty = true; }
    if (net) rt.netDirty = true;
  },

  /** Stamp machine housings onto the LIVE drill session field (documented co-write). */
  _stampStructures(site) {
    const d = this.state.drill;
    if (!d || !d.field) return;
    for (const m of site.machines) {
      const tile = d.field[m.col] && d.field[m.col][m.row];
      if (tile && tile.type === 'empty') tile.structure = m.id;
    }
  },

  // ------------------------------------------------------------ player intents

  /**
   * Validate a machine placement without committing it (the screen's ghost preview).
   * @returns {{ ok:boolean, reason:string|null, missing:Object, profile:Object|null }}
   */
  canInstall({ asteroidId, defId, col, row }) {
    const def = SITE_MACHINE_BY_ID.get(defId);
    if (!def) return { ok: false, reason: 'unknown-machine', missing: {}, profile: null };
    if (col == null || row == null || col < 0 || col >= COLS || row < 0 || row >= ROWS) {
      return { ok: false, reason: 'out-of-bounds', missing: {}, profile: null };
    }
    const ent = this.state.entities && this.state.entities.get ? this.state.entities.get(asteroidId) : null;
    if (!ent || ent.type !== 'asteroid') return { ok: false, reason: 'no-asteroid', missing: {}, profile: null };

    const site = this.siteForAsteroid(asteroidId);
    const d = this.state.drill;
    const sessionHere = !!(d && d.active && d.asteroidId === asteroidId && d.field);
    // Field truth: the live session field when drilling, else the durable record.
    let field = null;
    if (sessionHere) field = d.field;
    else if (site) field = this._runtime(site).field;
    else return { ok: false, reason: 'no-session', missing: {}, profile: null };

    const tile = field[col] && field[col][row];
    if (!tile || tile.type !== 'empty') return { ok: false, reason: 'not-hollow', missing: {}, profile: null };
    if (site && this.machineAt(site, col, row)) return { ok: false, reason: 'occupied', missing: {}, profile: null };
    if (sessionHere && d.avatar && d.avatar.col === col && d.avatar.row === row) {
      return { ok: false, reason: 'rover-here', missing: {}, profile: null };
    }
    if (def.unique && site && site.machines.some((m) => m.defId === defId)) {
      return { ok: false, reason: 'unique', missing: {}, profile: null };
    }

    // Brief §5 learning curve: before a Core exists installation is physical — the rover must be
    // beside the cell. Once the site is anchored, construction is remotely queueable anywhere
    // hollow (the Core's command bandwidth), tethered or not.
    const anchored = !!(site && site.anchored);
    if (!anchored) {
      if (!sessionHere) return { ok: false, reason: 'no-session', missing: {}, profile: null };
      const dc = Math.abs((d.avatar ? d.avatar.col : -99) - col);
      const dr = Math.abs((d.avatar ? d.avatar.row : -99) - row);
      if (dc + dr !== 1) return { ok: false, reason: 'rover-not-adjacent', missing: {}, profile: null };
    }

    const profile = contactProfile(field, col, row, COLS, ROWS);
    if (def.requiresContact === 'gas' && profile.gas <= 0) {
      return { ok: false, reason: 'needs-gas-contact', missing: {}, profile };
    }

    const missing = this._missingMaterials(site, def.cost);
    if (Object.keys(missing).length) return { ok: false, reason: 'materials', missing, profile };
    return { ok: true, reason: null, missing: {}, profile };
  },

  /** What part of `cost` cannot be covered by lane stores + ship hold right now. */
  _missingMaterials(site, cost) {
    const missing = {};
    const cargo = this.state.player && this.state.player.cargo;
    for (const goodId of Object.keys(cost || {}).sort()) {
      let need = cost[goodId];
      if (site) {
        for (const ls of site.laneStores) need -= Math.floor(Math.max(0, Number(ls.store[goodId]) || 0));
      }
      const held = cargo && cargo.items ? Math.max(0, Math.floor(Number(cargo.items[goodId]) || 0)) : 0;
      need -= held;
      if (need > 0) missing[goodId] = need;
    }
    return missing;
  },

  /** Consume install materials: site lane stores first (they're physically here), then ship hold. */
  _consumeMaterials(site, cost) {
    for (const goodId of Object.keys(cost || {}).sort()) {
      let need = cost[goodId];
      if (site) {
        for (const ls of site.laneStores) {
          if (need <= 0) break;
          const have = Math.floor(Math.max(0, Number(ls.store[goodId]) || 0));
          const take = Math.min(have, need);
          if (take > 0) { ls.store[goodId] = (Number(ls.store[goodId]) || 0) - take; need -= take; }
        }
      }
      if (need > 0) removeCargo(this.state, goodId, need);
    }
  },

  /**
   * Install a machine. Creates the site record on first install; installing the Massline Core
   * anchors the site permanently (freezes bore layout + records the physical anchor).
   */
  installMachine({ asteroidId, defId, col, row }) {
    const check = this.canInstall({ asteroidId, defId, col, row });
    if (!check.ok) return check;
    const def = SITE_MACHINE_BY_ID.get(defId);
    const state = this.state;
    const ent = state.entities.get(asteroidId);

    let site = this.siteForAsteroid(asteroidId);
    if (!site) {
      const sites = state.sites;
      const id = `site_${sites.nextSiteNum++}`;
      site = makeSiteRecord({
        id,
        asteroidId,
        sectorId: (state.world && state.world.currentSectorId) || null,
        fieldId: (ent.data && ent.data.fieldId) || null,
        createdT: state.simTime,
      });
      site.cleared = normalizeClearedTiles(ent.data && ent.data.drillCleared);
      sites.byId[id] = site;
      sites.order.push(id);
      ent.data.siteId = id;
      this.bus.emit('site:created', { siteId: id, asteroidId });
      this._ledger(site, 'info', 'Claim opened — machines on an unanchored rock are lost if you leave the sector before a Massline Core is installed.');
    }

    this._consumeMaterials(site, def.cost);

    const machine = {
      id: `m${site.nextMachineNum++}`,
      defId,
      col, row,
      mode: def.defaultMode || null,
      installT: state.simTime,
      job: null,
      carry: {},
    };
    site.machines.push(machine);
    this._markDirty(site.id, { field: false, net: true });
    const rt = this._rt.get(site.id);
    if (rt) rt.geoDirty = true;

    if (defId === 'sm_massline_core' && !site.anchored) this._anchorSite(site, ent);

    this._stampStructures(site);
    this._ledger(site, 'good', `${def.name} installed at ${col},${row}.`);
    this.bus.emit('site:machineInstalled', { siteId: site.id, machineId: machine.id, defId, col, row });
    return { ok: true, reason: null, machineId: machine.id, siteId: site.id };
  },

  _anchorSite(site, ent) {
    const state = this.state;
    site.anchored = true;
    // Freeze the interior: the current entity id has been seeding this bore all along, so
    // recording it preserves exactly the layout the player has been digging.
    site.boreSeed = Number.isFinite(ent.data && ent.data.boreSeed) ? ent.data.boreSeed : ((site.asteroidId >>> 0) || 1);
    ent.data.boreSeed = site.boreSeed;
    ent.data.siteAnchored = true;
    site.anchor = {
      x: Math.round(ent.pos.x * 10) / 10,
      z: Math.round(ent.pos.z * 10) / 10,
      radius: ent.radius || 8,
      typeId: (ent.data && ent.data.typeId) || 'ast_common_rock',
      yieldU: (ent.data && ent.data.yieldU) || 0,
    };
    site.sectorId = (state.world && state.world.currentSectorId) || site.sectorId;
    this._ledger(site, 'good', 'Massline Core online — this asteroid is now a permanent site.');
    this.bus.emit('site:anchored', { siteId: site.id, asteroidId: site.asteroidId, sectorId: site.sectorId });
    // The rock is visibly modified the moment the core hums (the exterior relay).
    this._ensureBeacon(site);
  },

  /** Dismantle a machine: the control unit comes back, the structural mass does not. */
  removeMachine(siteId, machineId) {
    const site = this.getSite(siteId);
    if (!site) return { ok: false, reason: 'no-site' };
    const idx = site.machines.findIndex((m) => m.id === machineId);
    if (idx === -1) return { ok: false, reason: 'no-machine' };
    const machine = site.machines[idx];
    const def = SITE_MACHINE_BY_ID.get(machine.defId);
    if (machine.defId === 'sm_massline_core') {
      // Tearing out the core un-anchors everything built on top of it. Refuse; dismantling a
      // whole site is a deliberate future verb, not an accidental click.
      return { ok: false, reason: 'core-locked' };
    }
    site.machines.splice(idx, 1);
    if (def && def.cost && def.cost.cmdty_control_unit) {
      addCargo(this.state, 'cmdty_control_unit', def.cost.cmdty_control_unit);
    }
    // Unstamp from a live session field.
    const d = this.state.drill;
    if (d && d.field && d.asteroidId === site.asteroidId) {
      const tile = d.field[machine.col] && d.field[machine.col][machine.row];
      if (tile && tile.structure === machineId) delete tile.structure;
    }
    this._markDirty(site.id, { net: true });
    const rt = this._rt.get(site.id);
    if (rt) rt.geoDirty = true;
    this._ledger(site, 'warn', `${def ? def.name : machine.defId} dismantled — control unit recovered, castings lost.`);
    this.bus.emit('site:machineRemoved', { siteId, machineId, defId: machine.defId });
    return { ok: true, reason: null };
  },

  /** Paint or clear one overlay cell (kind: 'power' | 'lane'). Free — the corridor was the cost. */
  setOverlay(siteId, kind, col, row, on) {
    const site = this.getSite(siteId);
    if (!site || (kind !== 'power' && kind !== 'lane')) return { ok: false, reason: 'bad-args' };
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return { ok: false, reason: 'out-of-bounds' };
    const rt = this._runtime(site);
    const tile = rt.field[col] && rt.field[col][row];
    if (!tile || tile.type !== 'empty') return { ok: false, reason: 'not-hollow' };
    if (this.machineAt(site, col, row)) return { ok: false, reason: 'occupied' };
    const idx = tileIndex(col, row);
    const list = site.overlays[kind];
    const has = list.includes(idx);
    if (on && !has) list.push(idx);
    else if (!on && has) list.splice(list.indexOf(idx), 1);
    else return { ok: true, reason: 'no-change' };
    site.overlays[kind] = normalizeClearedTiles(list);
    this._markDirty(site.id, { net: true });
    this.bus.emit('site:overlayChanged', { siteId, kind, col, row, on: !!on });
    return { ok: true, reason: null };
  },

  setMachineMode(siteId, machineId, mode) {
    const site = this.getSite(siteId);
    const machine = site && site.machines.find((m) => m.id === machineId);
    const def = machine && SITE_MACHINE_BY_ID.get(machine.defId);
    if (!def || !Array.isArray(def.modes) || !def.modes.includes(mode)) return { ok: false, reason: 'bad-mode' };
    if (machine.mode === mode) return { ok: true, reason: 'no-change' };
    machine.mode = mode;
    // Committed fabricator batches die with a mode swap (inputs already spent) — stepFabricator
    // enforces it; the ledger makes the cost visible instead of silent.
    if (machine.job && machine.job.recipeId !== mode) {
      this._ledger(site, 'warn', `${def.name} retooled — the committed batch was scrapped.`);
    }
    this.bus.emit('site:machineMode', { siteId, machineId, mode });
    return { ok: true, reason: null };
  },

  setExportFlag(siteId, goodId, exported) {
    const site = this.getSite(siteId);
    if (!site) return { ok: false, reason: 'no-site' };
    if (exported) delete site.exportOff[goodId];
    else site.exportOff[goodId] = true;
    return { ok: true, reason: null };
  },

  setPodTarget(siteId, target) {
    const site = this.getSite(siteId);
    if (!site) return { ok: false, reason: 'no-site' };
    site.fleet.podTarget = Math.max(0, Math.min(SITE_BALANCE.maxPodTarget, Math.trunc(Number(target) || 0)));
    return { ok: true, reason: null };
  },

  /**
   * Move goods between ship hold and a machine's lane-network store while tethered (the rover
   * carries it). dir: 'deposit' (ship → site) | 'withdraw' (site → ship).
   */
  transferGoods(siteId, machineId, goodId, qty, dir) {
    const site = this.getSite(siteId);
    if (!site) return { ok: false, moved: 0, reason: 'no-site' };
    const d = this.state.drill;
    if (!d || !d.active || d.asteroidId !== site.asteroidId) return { ok: false, moved: 0, reason: 'not-tethered' };
    const rt = this._runtime(site);
    const compKey = rt.laneCompByMachine[machineId];
    const store = compKey != null ? rt.stores[compKey] : null;
    if (!store) return { ok: false, moved: 0, reason: 'no-network' };
    const want = Math.max(0, Math.trunc(Number(qty) || 0));
    if (!want) return { ok: false, moved: 0, reason: 'zero' };
    if (dir === 'deposit') {
      const room = Math.max(0, rt.capacity[compKey] - storeTotal(store));
      const take = Math.min(want, Math.floor(room));
      const removed = take > 0 ? removeCargo(this.state, goodId, take) : 0;
      if (removed > 0) store[goodId] = (Number(store[goodId]) || 0) + removed;
      return { ok: removed > 0, moved: removed, reason: removed > 0 ? null : 'no-room-or-cargo' };
    }
    const have = Math.floor(Math.max(0, Number(store[goodId]) || 0));
    const take = Math.min(want, have);
    const added = take > 0 ? addCargo(this.state, goodId, take) : 0;
    if (added > 0) store[goodId] = (Number(store[goodId]) || 0) - added;
    return { ok: added > 0, moved: added, reason: added > 0 ? null : 'no-stock-or-hold' };
  },

  // ------------------------------------------------------------------ sim tick

  update(dt, state) {
    this._accum += dt;
    if (this._accum < SITE_BALANCE.tickS) return;
    const step = SITE_BALANCE.tickS;
    this._accum -= step;
    // A long stall (screen pause ends, save hop) collapses to one step: production is linear and
    // the accumulator is transient, so no burst catch-up — same policy as other cadence systems.
    if (this._accum > step * 4) this._accum = 0;

    if (this._repairSweepWanted) {
      this._repairSweepWanted = false;
      this._repairAnchors();
    }

    const sites = state.sites;
    if (!sites || !sites.order.length) return;
    for (const siteId of sites.order.slice()) {
      const site = sites.byId[siteId];
      if (!site) continue;
      if (!this._checkLiveness(site)) continue;
      this._tickSite(site, step, state);
      this._resolvePods(site, state);
    }
  },

  /** Unanchored sites die with their rock (id recycling guarded by the siteId stamp). */
  _checkLiveness(site) {
    if (site.anchored) return true;
    const ent = this.state.entities.get(site.asteroidId);
    const alive = !!(ent && ent.alive !== false && ent.type === 'asteroid'
      && ent.data && ent.data.siteId === site.id);
    if (alive) return true;
    const sites = this.state.sites;
    delete sites.byId[site.id];
    const at = sites.order.indexOf(site.id);
    if (at !== -1) sites.order.splice(at, 1);
    this._rt.delete(site.id);
    this.bus.emit('site:lost', {
      siteId: site.id,
      reason: 'unanchored',
      machines: site.machines.length,
    });
    return false;
  },

  /** Anchored sites in the CURRENT sector re-materialize their rock if it is missing. */
  _repairAnchors() {
    const state = this.state;
    const sectorId = state.world && state.world.currentSectorId;
    if (!sectorId) return;
    const spawnEntity = this.ctx && this.ctx.helpers && this.ctx.helpers.spawnEntity;
    for (const siteId of state.sites.order) {
      const site = state.sites.byId[siteId];
      if (!site || !site.anchored || site.sectorId !== sectorId || !site.anchor) continue;
      const ent = state.entities.get(site.asteroidId);
      const linked = ent && ent.alive !== false && ent.type === 'asteroid' && ent.data && ent.data.siteId === site.id;
      if (linked) { ent.data.siteAnchored = true; continue; }
      if (typeof spawnEntity !== 'function') continue;
      const rock = spawnEntity({
        type: 'asteroid',
        pos: { x: site.anchor.x, z: site.anchor.z },
        radius: site.anchor.radius,
        mass: 200 + site.anchor.radius * 40,
        angVel: 0,
        hull: 1e9, hullMax: 1e9,
        collides: true,
        data: {
          typeId: site.anchor.typeId,
          yieldU: site.anchor.yieldU,
          oreHP: 1e9, oreHPMax: 1e9,
          siteId: site.id,
          siteAnchored: true,
          boreSeed: site.boreSeed,
          drillCleared: site.cleared.slice(),
          fieldId: site.fieldId,
          size: site.anchor.radius,
          pctEjected: 0,
        },
      });
      if (rock) {
        site.asteroidId = rock.id;
        this._rt.delete(site.id);
        this.bus.emit('site:rematerialized', { siteId: site.id, asteroidId: rock.id, sectorId });
      }
    }
    for (const siteId of state.sites.order) {
      const site = state.sites.byId[siteId];
      if (site && site.anchored && site.sectorId === sectorId) this._ensureBeacon(site);
    }
  },

  /**
   * The north-star payoff seam (brief §8): an anchored asteroid is VISIBLY modified in the
   * flight world. v1 reuses the shipped claim-relay place asset as an exterior massline relay
   * bolted beside the rock; it despawns with the sector like any dressing and is re-ensured on
   * every visit. Purely visual — an fx entity, no gameplay writes.
   */
  _ensureBeacon(site) {
    const state = this.state;
    const rt = this._rt.get(site.id) || {};
    if (rt.beaconId != null) {
      const existing = state.entities.get(rt.beaconId);
      if (existing && existing.alive !== false && existing.data && existing.data.siteBeacon === site.id) return;
    }
    const rock = state.entities.get(site.asteroidId);
    const spawnEntity = this.ctx && this.ctx.helpers && this.ctx.helpers.spawnEntity;
    if (!rock || typeof spawnEntity !== 'function') return;
    const ang = ((hash32(site.id) % 628) / 100);
    const dist = (rock.radius || 8) + 7;
    const beacon = spawnEntity({
      type: 'fx',
      factionId: 'faction_player',
      pos: { x: rock.pos.x + Math.cos(ang) * dist, z: rock.pos.z + Math.sin(ang) * dist },
      rot: ang + Math.PI,
      radius: 6,
      mass: 0,
      collides: false,
      ttl: Infinity,
      flags: { noInterp: true },
      data: {
        placeId: 'place_claim_outpost_relay',
        // The relay GLB is authored at outpost scale (automation spawns it full-size as a
        // standalone node); bolted to a rock it reads right at roughly one-sixth.
        placeScale: 0.16,
        worldDressing: true,
        siteBeacon: site.id,
        sectorId: site.sectorId,
        homeSectorId: site.sectorId,
        name: 'Massline Site Relay',
        visualRadius: 6,
        placeRadius: 6,
      },
    });
    if (beacon) {
      if (!this._rt.has(site.id)) this._runtime(site);
      const rtNow = this._rt.get(site.id);
      if (rtNow) rtNow.beaconId = beacon.id;
    }
  },

  _tickSite(site, dtS, state) {
    if (!site.machines.length) return;
    const rt = this._runtime(site);
    const dtMin = dtS / 60;

    // --- Power: per component, gen vs demand → one legible ratio (brief §2). ---
    rt.compRatio = {};
    const compPower = {};
    for (const comp of rt.powerComps) {
      let gen = 0;
      let draw = 0;
      for (const mid of comp.machineIds) {
        const m = site.machines.find((x) => x.id === mid);
        const def = m && SITE_MACHINE_BY_ID.get(m.defId);
        if (!def) continue;
        const cap = machineCapability(def, rt.geo[m.id], m.mode);
        gen += cap.powerGen;
        draw += cap.powerDraw;
      }
      const ratio = draw > 0 ? clamp01(gen / draw) : 1;
      rt.compRatio[comp.key] = ratio;
      compPower[comp.key] = { gen: round3(gen), draw: round3(draw), ratio: round3(ratio) };
    }
    rt.compPower = compPower;

    // --- Lane throughput budgets: shared per network, spent as machines move goods. ---
    const laneBudget = {};
    for (const comp of rt.laneComps) laneBudget[comp.key] = SITE_BALANCE.laneThroughputPerMin * dtMin;

    // --- Machines, in stable install order. ---
    rt.status = {};
    for (const m of site.machines) {
      const def = SITE_MACHINE_BY_ID.get(m.defId);
      if (!def) continue;
      const powerKey = rt.powerCompByMachine[m.id];
      const powerRatio = powerKey != null ? (rt.compRatio[powerKey] ?? 0) : (def.power > 0 ? 1 : 0);
      const laneKey = rt.laneCompByMachine[m.id];
      const store = laneKey != null ? rt.stores[laneKey] : null;
      const capacity = laneKey != null ? rt.capacity[laneKey] : 0;
      const roomFor = () => (store ? Math.max(0, capacity - storeTotal(store)) : 0);
      const status = { state: 'idle', limit: null, ratePerMin: {}, powerRatio: round3(powerRatio) };

      if (def.id === 'sm_extractor' || def.id === 'sm_gas_tap') {
        const cap = machineCapability(def, rt.geo[m.id], m.mode);
        if (def.usesGeology && !cap.geologyLive && cap.powerGen <= 0) {
          status.state = 'no-geology';
        } else if (cap.powerDraw > 0 && powerRatio <= 0) {
          status.state = 'no-power';
          status.limit = 'power';
        } else {
          let produced = false;
          let blocked = false;
          for (const goodId of Object.keys(cap.outputsPerMin).sort()) {
            if (!store) { blocked = true; continue; }
            const want = cap.outputsPerMin[goodId] * dtMin * clamp01(powerRatio || (cap.powerDraw > 0 ? 0 : 1));
            const room = roomFor();
            const budget = laneBudget[laneKey];
            const grant = Math.max(0, Math.min(want, room, budget));
            if (grant > 0) {
              const carryKey = `out:${goodId}`;
              const raw = grant + (Number(m.carry[carryKey]) || 0);
              const whole = Math.floor(raw + 1e-9);
              m.carry[carryKey] = Math.max(0, raw - whole);
              if (whole > 0) store[goodId] = (Number(store[goodId]) || 0) + whole;
              laneBudget[laneKey] = Math.max(0, budget - grant);
              produced = true;
              status.ratePerMin[goodId] = round3(cap.outputsPerMin[goodId] * clamp01(powerRatio || 1));
            } else if (want > 0) blocked = true;
          }
          if (produced) status.state = powerRatio < 1 && cap.powerDraw > 0 ? 'throttled' : 'running';
          else if (blocked) { status.state = store ? 'backlogged' : 'no-network'; status.limit = store ? 'export' : 'lane'; }
          else if (cap.powerGen > 0) status.state = 'running'; // pure generator
          if (def.id === 'sm_gas_tap' && cap.powerGen > 0) status.genMW = round3(cap.powerGen);
        }
      } else if (def.id === 'sm_refinery') {
        if (!store) { status.state = 'no-network'; status.limit = 'lane'; }
        else {
          const res = stepContinuousRecipe({
            recipeId: m.mode,
            dtMin,
            powerRatio,
            store,
            roomFor,
            carry: m.carry,
            throughputBudget: laneBudget[laneKey],
          });
          laneBudget[laneKey] = Math.max(0, laneBudget[laneKey] - res.moved);
          status.state = res.status;
          status.limit = res.limit;
          const recipe = SITE_RECIPE_BY_ID.get(m.mode);
          if (recipe && res.status === 'running') {
            const [outId] = Object.keys(recipe.output);
            const inputPerBatch = Object.values(recipe.inputs).reduce((s, q) => s + q, 0);
            status.ratePerMin[outId] = round3((recipe.inputRatePerMin / inputPerBatch) * recipe.output[outId] * clamp01(powerRatio));
          }
        }
      } else if (def.id === 'sm_fabricator') {
        if (!store) { status.state = 'no-network'; status.limit = 'lane'; }
        else {
          const recipe = SITE_RECIPE_BY_ID.get(m.mode);
          const buildingPods = recipe && recipe.output && recipe.output.pod;
          const wantsBuild = buildingPods
            ? (site.fleet.podsReady + (m.job && m.job.recipeId === m.mode ? 1 : 0)) <= site.fleet.podTarget
              && site.fleet.podsReady < SITE_BALANCE.maxPodTarget
            : true;
          const res = stepFabricator({
            machine: m,
            recipeId: m.mode,
            dtS,
            powerRatio,
            store,
            roomFor,
            wantsBuild,
          });
          laneBudget[laneKey] = Math.max(0, laneBudget[laneKey] - res.moved);
          status.state = res.status === 'completed' ? 'building' : res.status;
          status.limit = res.limit;
          status.progress = res.progress || (m.job ? m.job.progressS / (recipe ? recipe.buildS : 1) : 0);
          if (buildingPods && !wantsBuild && !m.job) {
            status.state = 'fleet-full';
          }
          if (res.completed && res.completed.outputId === 'pod') {
            site.fleet.podsReady += res.completed.qty;
            this._ledger(site, 'good', `Courier pod assembled — ${site.fleet.podsReady} ready.`);
            this.bus.emit('site:podBuilt', { siteId: site.id, podsReady: site.fleet.podsReady });
          }
        }
      } else if (def.id === 'sm_cargo_port') {
        if (!store) { status.state = 'no-network'; status.limit = 'lane'; }
        else if (powerRatio <= 0) { status.state = 'no-power'; status.limit = 'power'; }
        else {
          // Stage export-flagged goods into the launch buffer, throughput-bounded.
          let staged = 0;
          const bufferTotal = storeTotal(site.exportBuffer);
          let bufferRoom = Math.max(0, SITE_BALANCE.podCapacity * 3 - bufferTotal);
          for (const goodId of Object.keys(store).sort()) {
            if (site.exportOff[goodId]) continue;
            const have = Math.max(0, Number(store[goodId]) || 0);
            if (have <= 1e-9) continue;
            // Fractional staging on purpose: per-tick throughput slices are well under one unit,
            // and flooring here starves the launch buffer forever. Pod loading floors at launch.
            const grant = Math.max(0, Math.min(have, laneBudget[laneKey], bufferRoom));
            if (grant <= 1e-9) continue;
            store[goodId] = (Number(store[goodId]) || 0) - grant;
            site.exportBuffer[goodId] = (Number(site.exportBuffer[goodId]) || 0) + grant;
            laneBudget[laneKey] = Math.max(0, laneBudget[laneKey] - grant);
            bufferRoom -= grant;
            staged += grant;
          }
          status.state = staged > 0 ? 'running' : (storeTotal(site.exportBuffer) > 0 ? 'staged' : 'idle');
          this._tryLaunch(site, state, status);
        }
      } else if (def.id === 'sm_massline_core') {
        status.state = 'running';
        status.genMW = def.power;
      }
      rt.status[m.id] = status;
    }
  },

  _tryLaunch(site, state, portStatus) {
    const fleet = site.fleet;
    const bufferTotal = storeTotal(site.exportBuffer);
    if (bufferTotal + 1e-9 < SITE_BALANCE.podCapacity) return;
    if (fleet.podsReady <= 0) {
      portStatus.state = 'no-pods';
      portStatus.limit = 'pods';
      return;
    }
    if (state.simTime - fleet.lastLaunchT < SITE_BALANCE.podLaunchCooldownS) return;

    // Load the pod in sorted-good order (deterministic).
    const cargo = {};
    let loaded = 0;
    for (const goodId of Object.keys(site.exportBuffer).sort()) {
      if (loaded >= SITE_BALANCE.podCapacity) break;
      const have = Math.floor(Math.max(0, Number(site.exportBuffer[goodId]) || 0));
      const take = Math.min(have, SITE_BALANCE.podCapacity - loaded);
      if (take <= 0) continue;
      cargo[goodId] = take;
      site.exportBuffer[goodId] = (Number(site.exportBuffer[goodId]) || 0) - take;
      if (site.exportBuffer[goodId] <= 1e-9) delete site.exportBuffer[goodId];
      loaded += take;
    }
    if (loaded <= 0) return;

    fleet.podsReady -= 1;
    fleet.launches += 1;
    fleet.lastLaunchT = state.simTime;

    const sector = SECTOR_BY_ID.get(site.sectorId);
    const danger = sector ? dangerIndex(sector) : 0.2;
    const station = sector && Array.isArray(sector.stations) && sector.stations.length ? sector.stations[0] : null;
    // Loss decided at launch (seeded), revealed at arrival — long-run converges on the odds,
    // individual runs stay dramatic (brief §6).
    const roll = drawSeeded(state.sites.meta, 'rngSeed', hash32(state.meta && state.meta.seed || 1, site.id, fleet.launches));
    const lost = roll < podLossChance(danger);
    const travel = podTravelS(danger);
    fleet.inFlight.push({
      launchT: state.simTime,
      arriveT: state.simTime + travel,
      cargo,
      lost,
      stationId: station ? station.id : null,
      stationName: station ? station.name : 'the freight lane',
    });
    this._ledger(site, 'info', `Courier pod away — ${loaded}u for ${station ? station.name : 'the freight lane'}.`);
    this.bus.emit('site:courierLaunched', {
      siteId: site.id,
      asteroidId: site.asteroidId,
      sectorId: site.sectorId,
      cargoUnits: loaded,
      arriveT: state.simTime + travel,
    });
    this._spawnCourierVisual(site, state);
  },

  /**
   * Player-present launches are physical (brief §8): a small drone entity rises off the site
   * rock and coasts out toward the lane, then despawns. Visual only — the economics resolved in
   * _tryLaunch/_resolvePods regardless of who is watching. Coasting uses plain vel integration.
   */
  _spawnCourierVisual(site, state) {
    if (!state.world || state.world.currentSectorId !== site.sectorId) return;
    const rock = state.entities.get(site.asteroidId);
    const spawnEntity = this.ctx && this.ctx.helpers && this.ctx.helpers.spawnEntity;
    if (!rock || typeof spawnEntity !== 'function') return;
    const ang = ((hash32(site.id, site.fleet.launches) % 628) / 100);
    const dist = (rock.radius || 8) + 4;
    const speed = 90;
    spawnEntity({
      type: 'drone',
      team: 0,
      factionId: 'faction_player',
      pos: { x: rock.pos.x + Math.cos(ang) * dist, z: rock.pos.z + Math.sin(ang) * dist },
      rot: ang,
      vel: { x: Math.cos(ang) * speed, z: Math.sin(ang) * speed },
      radius: 2.2,
      mass: 4,
      collides: false,
      drag: 0,
      maxSpeed: speed,
      data: {
        kind: 'site_courier',
        siteId: site.id,
        sectorId: site.sectorId,
        homeSectorId: site.sectorId,
        despawnAt: state.simTime + 14,
      },
    });
  },

  _resolvePods(site, state) {
    const fleet = site.fleet;
    if (!fleet.inFlight.length) return;
    const remaining = [];
    for (const pod of fleet.inFlight) {
      if (pod.arriveT > state.simTime) { remaining.push(pod); continue; }
      if (pod.lost) {
        fleet.lost += 1;
        const units = storeTotal(pod.cargo);
        this._ledger(site, 'bad', `Courier lost en route to ${pod.stationName} — ${units}u of cargo gone.`);
        this.bus.emit('site:courierLost', { siteId: site.id, cargo: pod.cargo, stationId: pod.stationId });
        continue;
      }
      fleet.delivered += 1;
      let gross = 0;
      let units = 0;
      for (const goodId of Object.keys(pod.cargo).sort()) {
        const qty = pod.cargo[goodId];
        units += qty;
        gross += qty * this._salePrice(pod.stationId, goodId);
      }
      gross = Math.round(gross * SITE_BALANCE.podSalvageMult);
      site.stats.grossCr += gross;
      site.stats.exportedU += units;
      const credited = this._creditPassive(gross);
      site.stats.creditedCr += credited;
      this._ledger(site, 'good', `Courier delivered ${units}u to ${pod.stationName} — ${credited} cr banked.`);
      this.bus.emit('site:courierDelivered', {
        siteId: site.id,
        stationId: pod.stationId,
        units,
        grossCr: gross,
        creditedCr: credited,
      });
    }
    fleet.inFlight = remaining;
  },

  _salePrice(stationId, goodId) {
    const econ = this._registry && this._registry.get ? this._registry.get('economy') : null;
    if (stationId && econ && typeof econ.priceOf === 'function') {
      const p = econ.priceOf(stationId, goodId, 'sell');
      if (Number.isFinite(p) && p > 0) return p;
    }
    const c = COMMODITY_BY_ID.get(goodId);
    return (c && c.basePrice) || 0;
  },

  /** Route sale gross through automation's passive cap. Returns credited amount (post-cap). */
  _creditPassive(gross) {
    if (!(gross > 0)) return 0;
    const automationSys = this._registry && this._registry.get ? this._registry.get('automation') : null;
    if (automationSys && typeof automationSys.creditPassive === 'function') {
      const res = automationSys.creditPassive(gross, 'site:courier');
      if (res && Number.isFinite(res.credited)) return res.credited;
      return gross;
    }
    // No automation system (minimal harnesses): drop the income rather than bypass the cap.
    return 0;
  },

  _ledger(site, kind, text) {
    site.ledger.unshift(makeLedgerEntry(this.state.simTime, kind, text));
    if (site.ledger.length > SITE_BALANCE.ledgerMax) site.ledger.length = SITE_BALANCE.ledgerMax;
  },

  // ------------------------------------------------------------- projections

  /**
   * Instant "what will this site do" readout for the screen: per-machine status/rates, per-network
   * power + store summaries, and the §6 fleet sentence inputs. Pure read — no store mutation.
   * While the sim is paused under the site screen this is the honest live feedback.
   */
  projection(siteId) {
    const site = this.getSite(siteId);
    if (!site) return null;
    const rt = this._runtime(site);

    const power = [];
    for (const comp of rt.powerComps) {
      let gen = 0;
      let draw = 0;
      for (const mid of comp.machineIds) {
        const m = site.machines.find((x) => x.id === mid);
        const def = m && SITE_MACHINE_BY_ID.get(m.defId);
        if (!def) continue;
        const cap = machineCapability(def, rt.geo[m.id], m.mode);
        gen += cap.powerGen;
        draw += cap.powerDraw;
      }
      power.push({
        key: comp.key,
        cells: comp.cells,
        overlayCells: comp.overlayCells,
        machineIds: comp.machineIds,
        gen: round3(gen),
        draw: round3(draw),
        ratio: draw > 0 ? round3(clamp01(gen / draw)) : 1,
      });
    }

    const lanes = rt.laneComps.map((comp) => ({
      key: comp.key,
      cells: comp.cells,
      overlayCells: comp.overlayCells,
      machineIds: comp.machineIds,
      capacity: rt.capacity[comp.key],
      stored: round3(storeTotal(rt.stores[comp.key])),
      store: rt.stores[comp.key],
      throughputPerMin: SITE_BALANCE.laneThroughputPerMin,
    }));

    const machines = site.machines.map((m) => {
      const def = SITE_MACHINE_BY_ID.get(m.defId);
      const powerKey = rt.powerCompByMachine[m.id];
      const laneKey = rt.laneCompByMachine[m.id];
      const powerComp = power.find((p) => p.key === powerKey) || null;
      const cap = def ? machineCapability(def, rt.geo[m.id], m.mode) : null;
      return {
        id: m.id,
        defId: m.defId,
        col: m.col,
        row: m.row,
        mode: m.mode,
        job: m.job ? { ...m.job } : null,
        geo: rt.geo[m.id],
        capability: cap,
        powerRatio: powerComp ? powerComp.ratio : (def && def.power > 0 ? 1 : 0),
        laneKey: laneKey ?? null,
        status: rt.status[m.id] || { state: 'idle', limit: null, ratePerMin: {} },
      };
    });

    // Aggregate export rate: everything export-flagged that extraction/refining is producing.
    let exportRatePerMin = 0;
    for (const m of machines) {
      if (!m.capability) continue;
      for (const goodId of Object.keys(m.capability.outputsPerMin)) {
        if (!site.exportOff[goodId]) exportRatePerMin += m.capability.outputsPerMin[goodId] * (m.powerRatio || 0);
      }
    }

    const podRecipe = SITE_RECIPE_BY_ID.get('sr_fab_courier');
    return {
      site,
      hasCore: this.hasCore(site),
      anchored: site.anchored,
      power,
      lanes,
      machines,
      exportRatePerMin: round3(exportRatePerMin),
      fleet: {
        ...site.fleet,
        inFlightCount: site.fleet.inFlight.length,
        podCapacity: SITE_BALANCE.podCapacity,
        podBuildS: podRecipe ? podRecipe.buildS : 90,
      },
      exportBuffer: site.exportBuffer,
      exportOff: site.exportOff,
      field: rt.field,
    };
  },
};
