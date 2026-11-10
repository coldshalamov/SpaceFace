// Site read/projection vocabulary shared by the native owner and detached mirror readers.
// No init/update/production/materialization authority is reachable through this module.
// Runtime reconciliation operates only on caller-owned records: the native owner supplies its
// durable record; the public mirror boundary below first clones that one site's save-safe data.
import { COLS, ROWS, generateDrillField, applyClearedTiles, applyFlaggedTiles, applyRubbleTiles, tileIndex } from './drillFieldModel.js';
import { applySealedDeadDropCap, sealedDeadDropCapMissing } from './boreDeadDrop.js';
import { SITE_MACHINE_BY_ID, SITE_RECIPE_BY_ID, SITE_BALANCE } from '../data/sites.js';
import { contactProfile, machineCapability, clamp01, round3 } from './siteProduction.js';
import { buildComponents, laneCapacity, laneThroughput, storeTotal, reconcileStores, previewStoreReconciliation, wouldOwnComponent } from './siteLogistics.js';
import { paintStructuralFalls } from './siteStructuralModel.js';
import { validateSurveyTarget } from './siteSurvey.js';
import { solveRadiatorThermal, radiatorSignature } from './siteRadiatorReadModel.js';
import { SECTORS } from '../data/sectors.js';
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));

export function getAsteroidSiteFromState(state, siteId) {
  const byId = state && state.sites && state.sites.byId;
  if (!byId || siteId == null) return null;
  return byId[siteId] || null;
}

export function findAsteroidSiteFromState(state, asteroidId) {
  if (asteroidId == null) return null;
  const sites = state && state.sites;
  const byId = sites && sites.byId;
  if (!byId || typeof byId !== 'object') return null;
  const order = Array.isArray(sites.order) ? sites.order : Object.keys(byId);
  for (const siteId of order) {
    const site = byId[siteId];
    if (site && site.asteroidId === asteroidId) return site;
  }
  return null;
}

function cloneAsteroidSiteForRead(site) {
  // Site records are save-safe plain data.  JSON cloning deliberately keeps
  // this boundary independent of structured-clone availability in probes and
  // browser builds while ensuring the projection's lane-store reconciliation
  // cannot mutate the mirrored record.
  return JSON.parse(JSON.stringify(site));
}

function isolatedAsteroidSitesView(state, siteId) {
  const site = getAsteroidSiteFromState(state, siteId);
  if (!site) return null;
  const sites = state && state.sites && typeof state.sites === 'object'
    ? state.sites : { byId: {} };
  const isolatedState = {
    ...(state || {}),
    sites: {
      ...sites,
      byId: { ...(sites.byId || {}), [siteId]: cloneAsteroidSiteForRead(site) },
    },
  };
  const view = Object.create(asteroidSiteReadMethods);
  view.state = isolatedState;
  view._rt = new Map();
  view._surveyByAsteroid = new Map();
  view._accessCache = null;
  return view;
}

/** Pure projection for a mirrored site record.  The source state is untouched. */
export function projectAsteroidSiteFromState(state, siteId) {
  const view = isolatedAsteroidSitesView(state, siteId);
  return view ? asteroidSiteReadMethods.projection.call(view, siteId) : null;
}

/** Pure placement preflight for a mirrored state.  It never commits materials or a machine. */
export function canInstallAsteroidSiteFromState(state, request) {
  const siteId = request && request.siteId;
  const asteroidId = request && request.asteroidId;
  const view = siteId != null
    ? isolatedAsteroidSitesView(state, siteId)
    : (() => {
      const site = findAsteroidSiteFromState(state, asteroidId);
      return site ? isolatedAsteroidSitesView(state, site.id) : null;
    })();
  if (!view) {
    // Preserve the authority's reason vocabulary for a cold first-install
    // preview, where no durable site exists yet.
    const coldView = Object.create(asteroidSiteReadMethods);
    coldView.state = state || {};
    coldView._rt = new Map();
    coldView._surveyByAsteroid = new Map();
    coldView._accessCache = null;
    return asteroidSiteReadMethods.canInstall.call(coldView, request || {});
  }
  // The mirror may intentionally omit full entity.data rows; a durable site
  // record is sufficient for this read-only preflight's identity check.
  view.siteForAsteroid = (asteroidId) => findAsteroidSiteFromState(view.state, asteroidId);
  return asteroidSiteReadMethods.canInstall.call(view, request || {});
}

export function createAsteroidSiteMirrorReadView(state, siteId, cloneReadValue) {
  const source = getAsteroidSiteFromState(state, siteId);
  if (!source || typeof source !== 'object') return null;
  const sites = state && state.sites && typeof state.sites === 'object' ? state.sites : {};
  const isolated = {
    ...(state || {}),
    sites: {
      ...sites,
      byId: { ...(sites.byId || {}), [siteId]: cloneReadValue(source) },
    },
  };
  const view = Object.create(asteroidSiteReadMethods);
  view.state = isolated;
  view._rt = new Map();
  view._surveyByAsteroid = new Map();
  view._accessCache = null;
  view.siteForAsteroid = (asteroidId) => findAsteroidSiteFromState(view.state, asteroidId);
  return view;
}

function constructionAccess(field, machines, start) {
  const occupied = new Set((machines || []).map((m) => tileIndex(m.col, m.row)));
  const open = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS
    && !occupied.has(tileIndex(c, r))
    && field[c]?.[r]?.type === 'empty' && !field[c][r].structure;
  const reachable = new Uint8Array(COLS * ROWS);
  if (!start || !open(start.col, start.row)) return reachable;
  const queue = [start];
  reachable[tileIndex(start.col, start.row)] = 1;
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const c = cell.col + dc; const r = cell.row + dr;
      const idx = tileIndex(c, r);
      if (!open(c, r) || reachable[idx]) continue;
      reachable[idx] = 1; queue.push({ col: c, row: r });
    }
  }
  return reachable;
}

export const asteroidSiteReadMethods = {
  siteForAsteroid(asteroidId) {
    if (asteroidId == null) return null;
    const ent = this.state.entities && this.state.entities.get ? this.state.entities.get(asteroidId) : null;
    const siteId = ent && ent.data && ent.data.siteId;
    if (!siteId) return null;
    const site = this.state.sites && this.state.sites.byId[siteId];
    return (site && (site.asteroidId === asteroidId)) ? site : null;
  },

  getSite(siteId) {
    return getAsteroidSiteFromState(this.state, siteId);
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

  _runtime(site) {
    let rt = this._rt.get(site.id);
    if (!rt) {
      rt = { field: null, fieldDirty: true, netDirty: true, geoDirty: true, status: {}, compRatio: {}, laneComps: [], powerComps: [], stores: {}, capacity: {}, geo: {} };
      this._rt.set(site.id, rt);
    }
    if (rt.field && sealedDeadDropCapMissing(rt.field, site)) rt.fieldDirty = true;
    if (rt.fieldDirty || !rt.field) {
      const seed = Number.isFinite(site.boreSeed) ? site.boreSeed : site.asteroidId;
      rt.field = generateDrillField((seed >>> 0) || 1);
      applyClearedTiles(rt.field, site.cleared);
      // A fallen slab is rock again, painted after the cleared list reopens the cell.
      paintStructuralFalls(rt.field, site.structure);
      // The sealed mouth is a cap even when an older cleared list still names it.
      applySealedDeadDropCap(site, rt.field);
      // Vented seams and seismic faults live on the asteroid record, outside site.cleared —
      // paint them so contact reads (gas taps, fracture scars) stay truthful off-session.
      // A resident rock's data is the freshest copy; an off-sector claim reads its own
      // mirrors (kept by copyDrillSessionAccounting and re-stamped on rematerialize).
      const ent = this.state.entities && this.state.entities.get ? this.state.entities.get(site.asteroidId) : null;
      const dd = ent && ent.data;
      const flagList = (key) => (dd && Array.isArray(dd[key]) ? dd[key] : site[key]);
      applyFlaggedTiles(rt.field, flagList('drillVented'), (t) => { if (t.type === 'empty') t.vented = true; });
      applyFlaggedTiles(rt.field, flagList('drillScars'), (t) => { if (t.type === 'empty') t.scar = true; });
      // Live order (drill.js begin): rubble first, faults last — a seismic shot that softened
      // standing fill keeps the mark on the rebuilt field.
      applyRubbleTiles(rt.field, flagList('drillRubble'));
      applyFlaggedTiles(rt.field, flagList('drillFaults'), (t) => { if (t.type !== 'empty') t.fault = true; });
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
      rt.throughput = {};
      const machineDefs = new Map(site.machines.map((m) => [m.id, m.defId]));
      rt.machineDefs = machineDefs;
      for (let i = 0; i < rt.laneComps.length; i++) {
        const comp = rt.laneComps[i];
        rt.throughput[comp.key] = laneThroughput(comp, (mid) => machineDefs.get(mid));
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

  canInstall({ asteroidId, defId, col, row }) {
    const def = SITE_MACHINE_BY_ID.get(defId);
    if (!def) return { ok: false, reason: 'unknown-machine', missing: {}, profile: null };
    if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || col >= COLS || row < 0 || row >= ROWS) {
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
    // This is the permanent arrival and return socket, even after the rover moves away.
    // In particular a non-removable Core must never turn the next visit into a blocked spawn.
    if (col === Math.floor(COLS / 2) && row === 0) {
      return { ok: false, reason: 'entry-reserved', missing: {}, profile: null };
    }
    if (site && this.machineAt(site, col, row)) return { ok: false, reason: 'occupied', missing: {}, profile: null };
    if (sessionHere && d.avatar && d.avatar.col === col && d.avatar.row === row) {
      return { ok: false, reason: 'rover-here', missing: {}, profile: null };
    }
    if (def.unique && site && site.machines.some((m) => m.defId === defId)) {
      return { ok: false, reason: 'unique', missing: {}, profile: null };
    }

    // PQ-024 / PQ-145.01: the first machine commits the claim survey. When a survey exists
    // but no longer matches the rock (the assayed formation was drilled into), that commit
    // refuses VISIBLY — it never silently rerolls to a different formation. Same gate for
    // Core and for any other first install; later machines on an already-staked claim skip it.
    if (!(site && site.anchored)
      && this._surveyAdoption(site, asteroidId, field).status === 'stale') {
      return { ok: false, reason: 'survey-stale', missing: {}, profile: null };
    }

    // Brief §5 learning curve: before the claim is staked, installation is physical — the rover
    // must be beside the cell. Once the first machine has anchored the site, construction can
    // reach farther along excavated tunnels; sealed cavities still need a physical access path.
    const anchored = !!(site && site.anchored);
    if (!anchored) {
      if (!sessionHere) return { ok: false, reason: 'no-session', missing: {}, profile: null };
      const dc = Math.abs((d.avatar ? d.avatar.col : -99) - col);
      const dr = Math.abs((d.avatar ? d.avatar.row : -99) - row);
      if (dc + dr !== 1) return { ok: false, reason: 'rover-not-adjacent', missing: {}, profile: null };
    }

    const accessFrom = sessionHere ? d.avatar : { col: Math.floor(COLS / 2), row: 0 };
    const access = this._accessCache;
    if (!access || access.field !== field || access.col !== accessFrom?.col || access.row !== accessFrom?.row
      || access.machineCount !== (site?.machines.length || 0)) {
      this._accessCache = { field, col: accessFrom?.col, row: accessFrom?.row,
        machineCount: site?.machines.length || 0, cells: constructionAccess(field, site?.machines, accessFrom) };
    }
    if (!this._accessCache.cells[tileIndex(col, row)]) {
      return { ok: false, reason: 'no-access-route', missing: {}, profile: null };
    }

    const profile = contactProfile(field, col, row, COLS, ROWS);
    // A vented seam qualifies a gas tap the same as a sealed pocket — the tap just pays less.
    if (def.requiresContact === 'gas' && (profile.gas + (profile.vented || 0)) <= 0) {
      return { ok: false, reason: 'needs-gas-contact', missing: {}, profile };
    }

    const missing = this._missingMaterials(site, def.cost, this._fundingStoresFor(site, col, row));
    if (Object.keys(missing).length) return { ok: false, reason: 'materials', missing, profile };
    return { ok: true, reason: null, missing: {}, profile };
  },

  previewBreak(siteId, col, row) {
    const site = this.getSite(siteId);
    if (!site) return null;
    const c = col | 0;
    const r = row | 0;
    const rt = this._runtime(site);
    const field = rt && rt.field;
    const tile = field && field[c] && field[c][r];
    if (!tile || tile.type === 'empty') return null;
    const neighbors = [];
    for (const machine of site.machines) {
      const def = SITE_MACHINE_BY_ID.get(machine.defId);
      const recipe = SITE_RECIPE_BY_ID.get(machine.mode);
      if (!def || (!def.usesGeology && !recipe?.contactKinds?.length && !recipe?.contactOres?.length)) continue;
      if (Math.abs(machine.col - c) > 1 || Math.abs(machine.row - r) > 1) continue;
      if (machine.col === c && machine.row === r) continue;
      neighbors.push({ machine, def });
    }
    if (!neighbors.length) return null;
    const afterField = field.map((column) => column.map((cell) => ({ ...cell })));
    afterField[c][r] = {
      type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0,
    };
    let contactsLost = 0;
    let powerLost = 0;
    let processBonusLost = 0;
    const rateDelta = {};
    for (const { machine, def } of neighbors) {
      const geoBefore = contactProfile(field, machine.col, machine.row, COLS, ROWS);
      const geoAfter = contactProfile(afterField, machine.col, machine.row, COLS, ROWS);
      contactsLost += Math.max(0, (geoBefore.solid | 0) - (geoAfter.solid | 0));
      const capBefore = machineCapability(def, geoBefore, machine.mode);
      const capAfter = machineCapability(def, geoAfter, machine.mode);
      powerLost += Math.max(0, capBefore.powerGen - capAfter.powerGen);
      processBonusLost += Math.max(0, capBefore.processMultiplier - capAfter.processMultiplier);
      const goods = new Set([
        ...Object.keys(capBefore.outputsPerMin || {}),
        ...Object.keys(capAfter.outputsPerMin || {}),
      ]);
      for (const goodId of goods) {
        const delta = (Number(capAfter.outputsPerMin[goodId]) || 0)
          - (Number(capBefore.outputsPerMin[goodId]) || 0);
        if (Math.abs(delta) > 1e-9) rateDelta[goodId] = (rateDelta[goodId] || 0) + delta;
      }
    }
    let rateLost = 0;
    for (const delta of Object.values(rateDelta)) {
      if (delta < 0) rateLost += -delta;
    }
    return {
      contactsLost,
      powerLost: round3(powerLost),
      processBonusLost: round3(processBonusLost),
      rateLost: Math.round(rateLost * 1000) / 1000,
      rateDelta,
      machineCount: neighbors.length,
    };
  },

  _fundingStoresFor(site, col, row) {
    if (!site) return [];
    // Reconcile FIRST: laneStores must reflect the current topology before eligibility is
    // computed. A pending setOverlay leaves stale pre-change cell lists on the persisted stores,
    // and intersecting against those let an install beside the MINORITY half of a fresh split
    // consume stock the reconcile was about to hand to the majority (round-3 finding).
    this._runtime(site);
    const machineCells = new Map();
    for (const m of site.machines) machineCells.set(tileIndex(m.col, m.row), m.id);
    const comp = wouldOwnComponent(
      new Set(site.overlays.lane), machineCells, COLS, tileIndex(col, row),
    );
    if (!comp) return [];
    const owned = new Set(comp.cells);
    return site.laneStores.filter((ls) => (ls.cells || []).some((c) => owned.has(c)));
  },

  _missingMaterials(site, cost, fundingStores) {
    const missing = {};
    const cargo = this.state.player && this.state.player.cargo;
    const stores = Array.isArray(fundingStores) ? fundingStores : [];
    for (const goodId of Object.keys(cost || {}).sort()) {
      let need = cost[goodId];
      for (const ls of stores) need -= Math.floor(Math.max(0, Number(ls.store[goodId]) || 0));
      const held = cargo && cargo.items ? Math.max(0, Math.floor(Number(cargo.items[goodId]) || 0)) : 0;
      need -= held;
      if (need > 0) missing[goodId] = need;
    }
    return missing;
  },

  _surveyAdoption(site, asteroidId, field) {
    const sv = this._surveyByAsteroid.get(asteroidId);
    if (!sv) return { status: 'derive', survey: null };
    if (sv.seed !== (((asteroidId >>> 0) || 1)) || !field) return { status: 'stale', survey: sv };
    if (!validateSurveyTarget({ material: sv.material, cells: sv.cells }, field, COLS, ROWS)) {
      return { status: 'stale', survey: sv };
    }
    return { status: 'adopt', survey: sv };
  },

  surveyStatusFor(asteroidId) {
    if (asteroidId == null) return null;
    const site = this.siteForAsteroid(asteroidId);
    if (site && site.survey) {
      return {
        state: site.survey.lifecycle,
        volatile: false,
        targetId: site.survey.targetId,
        material: site.survey.material,
        cells: site.survey.cells.length,
        revealed: site.survey.revealedCells.length,
        receipt: site.survey.receipt ? { ...site.survey.receipt } : null,
      };
    }
    if (site && site.anchored) return null;
    const sv = this._surveyByAsteroid.get(asteroidId);
    if (sv) {
      return {
        state: 'cold', volatile: true, targetId: sv.targetId, material: sv.material,
        cells: sv.cells.length, revealed: sv.revealed.length, receipt: null,
      };
    }
    if (site) {
      return { state: 'cold', volatile: true, targetId: null, material: null, cells: 0, revealed: 0, receipt: null };
    }
    return null;
  },

  surveyCellRole(asteroidId, idx) {
    if (asteroidId == null || !Number.isFinite(idx)) return null;
    const site = this.siteForAsteroid(asteroidId);
    if (site && site.survey) {
      if (!site.survey.cells.includes(idx)) return null;
      return {
        material: site.survey.material,
        revealed: site.survey.revealedCells.includes(idx),
        state: site.survey.lifecycle,
        volatile: false,
      };
    }
    const sv = this._surveyByAsteroid.get(asteroidId);
    if (!sv || (site && site.anchored) || !sv.cells.includes(idx)) return null;
    return { material: sv.material, revealed: sv.revealed.includes(idx), state: 'cold', volatile: true };
  },

  previewMachineRemoval(siteId, machineId) {
    const site = this.getSite(siteId);
    const machine = site && site.machines.find((m) => m.id === machineId);
    if (!site || !machine) return { spilledTotal: 0, spilled: [], placed: [] };
    const machineCells = new Map();
    for (const m of site.machines) {
      if (m.id === machineId) continue;
      machineCells.set(tileIndex(m.col, m.row), m.id);
    }
    const nextComps = buildComponents(new Set(site.overlays.lane), machineCells, COLS);
    return previewStoreReconciliation(site.laneStores, nextComps);
  },

  previewOverlayRemoval(siteId, kind, col, row) {
    const site = this.getSite(siteId);
    if (!site || kind !== 'lane') return { spilledTotal: 0, spilled: [], placed: [] };
    const idx = tileIndex(col, row);
    if (!site.overlays.lane.includes(idx)) return { spilledTotal: 0, spilled: [], placed: [] };
    const machineCells = new Map();
    for (const m of site.machines) machineCells.set(tileIndex(m.col, m.row), m.id);
    const nextLane = new Set(site.overlays.lane);
    nextLane.delete(idx);
    const nextComps = buildComponents(nextLane, machineCells, COLS);
    return previewStoreReconciliation(site.laneStores, nextComps);
  },

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

    const lanes = rt.laneComps.map((comp) => {
      const stored = storeTotal(rt.stores[comp.key]);
      const capacity = rt.capacity[comp.key];
      return {
        key: comp.key,
        cells: comp.cells,
        overlayCells: comp.overlayCells,
        machineIds: comp.machineIds,
        capacity,
        stored: round3(stored),
        store: rt.stores[comp.key],
        throughputPerMin: laneThroughput(comp, (mid) => rt.machineDefs.get(mid), SITE_BALANCE,
          (mid) => power.find((p) => p.key === rt.powerCompByMachine[mid])?.ratio || 0),
        ratedThroughputPerMin: rt.throughput[comp.key],
        // A10 over-capacity diagnostics: a merge may legally exceed capacity (stock is NEVER
        // clamped or deleted); these report the exact pressure so the operator — and A11's
        // bottleneck presenter — see precisely how much must drain before intake resumes.
        overCapacity: round3(Math.max(0, stored - capacity)),
        intakeRoom: round3(Math.max(0, capacity - stored)),
      };
    });

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
    // Pod destination + options resolved HERE so the screen never imports sector data itself.
    const destSector = SECTOR_BY_ID.get(site.sectorId);
    // The screen/worker read view has no cadence cache. Use its freshly projected
    // power networks with the same kernels as the live exterior-fin step.
    const radiatorRuntime = {
      ...rt,
      compRatio: Object.fromEntries(power.map((row) => [row.key, row.ratio])),
      compPower: Object.fromEntries(power.map((row) => [row.key, row])),
    };
    return {
      thermal: solveRadiatorThermal(site, radiatorRuntime, 0),
      signature: radiatorSignature(site, radiatorRuntime),
      site,
      hasCore: this.hasCore(site),
      anchored: site.anchored,
      power,
      lanes,
      machines,
      exportRatePerMin: round3(exportRatePerMin),
      courier: {
        destinationId: site.podDestinationId || null,
        stations: (destSector && Array.isArray(destSector.stations) ? destSector.stations : [])
          .map((st) => ({ id: st.id, name: st.name })),
      },
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
