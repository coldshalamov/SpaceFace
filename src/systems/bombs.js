// Drift-bomb bay: lay a moving trap, commit its fuze, exploit the physical consequence.
// Design and propagation acceptance: design/ORDNANCE_BOMBS_REFINEMENT.md.
// Keep the original payload IDs, damage router, hitstun law and one-shot VFX receipts.
// Bombs alone own bomb kinematics (physicsBody:false). Foreign motion goes through physics.
// PQ-205.03: the bay is a fitted rack (state.bombs.rack/stock), not eight free consumables.
// This system owns rack/stock/cooldown state and serializes it; credits stay inside the
// economy owner's transaction seam (economy:chargeCredits / economy:grantCredits emits).
import { BOMB_DEFS, BOMB_DRIFT, BOMB_RACK, BOMB_STARTER_KIT, bombDef } from '../data/bombs.js';
import { shipworksStationAccess } from './ships.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { publishHitstunImpulse, recordImpulseProvenance, signedHitSide } from '../combat/impulseKernel.js';
import { queuePhysicsImpulse, isDynamicPhysicsBodyEntity } from '../core/physicsAuthority.js';
import { FIELD_COUPLING } from '../data/fields.js';
import {
  integrateBombDrift, sweptBombContact, compareBombEntityIds, bombSurfaceFalloff,
  bombFieldEnvelope, fillBombViscosityImpulse,
} from '../combat/bombDynamics.js';

export const BOMB_TYPE = 'bomb';
export const BOMB_SHOVE_CAP = 8;
const DAMAGE_TYPES = new Set(['ship', 'drone', 'station']);
const LOOSE_TYPES = new Set(['asteroid', 'wreck', 'pickup', 'payload']);
const EMPTY = Object.freeze([]);
const simNow = state => Number.isFinite(state?.simTime) ? state.simTime : (state?.tick || 0) / 60;
const craft = e => e?.type === 'ship' || e?.type === 'drone';
const movable = e => e?.physicsBody !== false && (craft(e) || (LOOSE_TYPES.has(e?.type) && isDynamicPhysicsBodyEntity(e)));
function massOf(e, fallback = 1) {
  const mass = Number(e?.physicsBody?.mass ?? e?.mass);
  return Number.isFinite(mass) && mass > 0 ? mass : fallback;
}
function effectiveMass(state, e) {
  const scale = Number(state.combat?.entities?.[String(e.id)]?.physicsResponse?.massScale) || 1;
  return massOf(e) * Math.max(0.25, Math.min(8, scale));
}
function liveBombList(state) {
  const index = state?.entityIndex;
  return index?.__spacefaceEntityIndexV1 && index.ready === true && Array.isArray(index.bombs)
    ? index.bombs : state?.entityList || EMPTY;
}
// ---- fitted rack (PQ-205.03) ----------------------------------------------------------
// state.bombs is the player's one bomb-bay bag, additive over the pre-rack shape:
//   selectedId    — payload id the bay verb drops next (always a LOADED cell, or null).
//   cooldownUntil — shared release latch (unchanged contract).
//   cooldowns     — per-payload cooldown clocks; survive cycle/dock trips/save-load.
//   rack          — { sockets, cells[] } — one cell per socket; a cell is { id, count }
//                   (payload type + loaded units, count 0 = fitted magazine run dry) or null.
//   stock         — { payloadId: units } — hangar inventory; bought at stations, loaded
//                   into sockets only while docked at an outfitting berth.
// A rack cell keeps its payload id at count 0: the socket still knows its fit, so dock-side
// restock refills the same magazines instead of re-deciding the loadout every visit.
function starterCells() {
  const cells = [];
  for (const id of BOMB_STARTER_KIT) cells.push({ id, count: BOMB_DEFS[id].magazine });
  while (cells.length < BOMB_RACK.socketsBase) cells.push(null);
  return cells;
}
function applyStarterKit(rt) {
  rt.rack = { sockets: BOMB_RACK.socketsBase, cells: starterCells() };
  rt.stock = {};
}
function loadedCells(rt) {
  return rt.rack.cells.filter((c) => c && c.count > 0);
}
// selectedId always names a loaded cell (or null on a dry rack) — the HUD socket and the
// drop verb can never point at ordnance that is not actually on the rack.
function normalizeSelection(rt) {
  if (rt.selectedId != null && loadedCells(rt).some((c) => c.id === rt.selectedId)) return;
  const first = rt.rack.cells.find((c) => c && c.count > 0);
  rt.selectedId = first ? first.id : null;
}
function normalizeRack(rt) {
  const rack = rt.rack;
  let sockets = Math.floor(Number(rack.sockets));
  if (!Number.isSafeInteger(sockets) || sockets < 1) sockets = BOMB_RACK.socketsBase;
  rack.sockets = sockets;
  const cells = Array.isArray(rack.cells) ? rack.cells : (rack.cells = []);
  // Normalize in place: this runs on the 60 Hz ensureRuntime path, so a clean cell keeps its
  // object identity (no per-tick allocation) and references never go stale mid-frame.
  for (let i = 0; i < sockets; i++) {
    const c = cells[i], def = c && BOMB_DEFS[c.id];
    if (!def) { if (cells[i] !== null) cells[i] = null; continue; }
    const raw = Math.floor(Number(c.count));
    const count = Math.max(0, Math.min(def.magazine, Number.isFinite(raw) ? raw : 0));
    if (c.count !== count || c.id !== def.id) cells[i] = { id: def.id, count };
  }
  // Sockets trimmed by a smaller normalized count hand their units back to the hangar —
  // shrinking a rack never destroys ordnance the player paid for.
  for (let i = sockets; i < cells.length; i++) {
    const c = cells[i];
    if (c && BOMB_DEFS[c.id] && c.count > 0) rt.stock[c.id] = (rt.stock[c.id] || 0) + Math.floor(c.count);
  }
  cells.length = sockets;
}
function normalizeStock(rt) {
  const stock = rt.stock && typeof rt.stock === 'object' && !Array.isArray(rt.stock) ? rt.stock : (rt.stock = {});
  for (const id of Object.keys(stock)) {
    const n = Math.floor(Number(stock[id]));
    if (BOMB_DEFS[id] && n > 0) stock[id] = n; else delete stock[id];
  }
}
function ensureRuntime(state) {
  const rt = state.bombs ||= {};
  if (!Number.isFinite(rt.cooldownUntil)) rt.cooldownUntil = 0;
  rt.cooldowns ||= {};
  // A missing rack is the legacy/pre-rack shape — the additive default is the starter kit,
  // never an empty bay (old saves and first-boot fixtures both land here).
  if (!rt.rack || typeof rt.rack !== 'object') applyStarterKit(rt);
  normalizeStock(rt);
  normalizeRack(rt);
  normalizeSelection(rt);
  return rt;
}
function blocked(state, owner) {
  return state.mode !== 'flight' || !owner?.alive || owner.flags?.docked || state.ui?.screenStack?.length > 0;
}
function considerShove(rows, id, dx, dz, mag) {
  if (rows.length < BOMB_SHOVE_CAP) { rows.push(Object.freeze({ id, dx, dz, mag })); return; }
  let weakest = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i].mag < rows[weakest].mag) weakest = i;
  if (mag > rows[weakest].mag) rows[weakest] = Object.freeze({ id, dx, dz, mag });
}

export const bombs = {
  name: 'bombs',
  saveSnapshotOwned: true,
  init(ctx) {
    this.destroy();
    Object.assign(this, { state: ctx.state, bus: ctx.bus, helpers: ctx.helpers, registry: ctx.registry });
    this._active = [];
    this._targets = [];
    this._gooCoverage = [];
    this._motion = {};
    this._viscosity = { x: 0, y: 0, z: 0 };
    this._ownerCooldowns = new Map();
    ensureRuntime(ctx.state);
    // Rack work is dock-side only: every ui: intent is gated by the same berth authority
    // the Shipworks module verbs use. Direct method calls stay open to internal callers
    // (sandbox, rewards, focused tests) — same contract as ships.fitModule.
    const rackIntent = (fn) => (p) => {
      const access = shipworksStationAccess(this.state);
      if (!access.outfit) {
        this.bus.emit('toast', { text: access.outfitReason || 'Dock at a shipyard to work the bomb rack', kind: 'info', ttl: 1.8 });
        this.bus.emit('bombs:denied', { reason: 'not_docked' });
        return;
      }
      fn(p || {});
    };
    this._unsubs = [
      this.bus.on('sector:exit', () => this.releaseAll('sector_exit')),
      this.bus.on('sector:enter', () => this.releaseAll('sector_enter')),
      this.bus.on('game:new', () => this._resetRuntime('new_game')),
      // Both new-game aliases exist on the live route (main.js emits game:newGame); the rack
      // bag is persistent state now, so a missed reset would leak sockets/stock into a run.
      this.bus.on('game:newGame', () => this._resetRuntime('new_game')),
      // save:loaded is NOT a reset: deserialize() already restored rack/stock/cooldowns (or
      // applied the starter kit to a pre-rack save). This sweep only releases live bomb
      // entities; persistent bag state must survive the load boundary.
      this.bus.on('save:loaded', () => this.releaseAll('save_loaded')),
      this.bus.on('ui:buyPayload', rackIntent((p) => this.buyPayload(p))),
      this.bus.on('ui:fitPayload', rackIntent((p) => this.fitPayload(p))),
      this.bus.on('ui:unfitPayload', rackIntent((p) => this.unfitPayload(p))),
      this.bus.on('ui:sellPayload', rackIntent((p) => this.sellPayload(p))),
      this.bus.on('ui:restockBombRack', rackIntent(() => this.restockRack())),
      this.bus.on('ui:upgradeBombRack', rackIntent(() => this.upgradeRack())),
    ];
  },
  destroy() {
    this.releaseAll('destroy');
    for (const off of this._unsubs || EMPTY) if (typeof off === 'function') off();
    this._unsubs = [];
    this._ownerCooldowns?.clear();
    this.state = this.bus = this.helpers = this.registry = null;
  },
  newGame() { this._resetRuntime('new_game'); },
  update(dt, state) {
    if (state.mode !== 'flight' || !(dt > 0) || !Number.isFinite(dt)) return;
    const rt = ensureRuntime(state), actions = state.input?.actions;
    const player = state.entities.get(state.playerId);
    if (actions?.cycleBomb) {
      actions.cycleBomb = false;
      if (!blocked(state, player)) this.cycleSelection(state);
    }
    this._collect(state);
    // R is the existing shared ordnance command. Read it BEFORE impulseCharges consumes it;
    // never clear another owner's edge. Both consumers are pinned by a manifest-order test.
    if (actions?.chargeDetonate && !blocked(state, player)) this.commandDetonate(player.id, state);
    this._tickBombs(dt, state);
    if (actions?.dropBomb) {
      actions.dropBomb = false;
      if (!blocked(state, player)) {
        if (rt.selectedId) this.drop(player, rt.selectedId, state);
        else this.bus.emit('toast', { text: 'Bomb rack empty — re-arm at a station shipworks.', kind: 'info', ttl: 1.6 });
      }
    }
  },

  // In-flight cycle walks only LOADED rack sockets — the catalogue order (BOMB_IDS) is the
  // shop listing, never the cycle order. A dry rack answers once per press edge.
  cycleSelection(state = this.state) {
    const rt = ensureRuntime(state);
    const loaded = loadedCells(rt);
    if (!loaded.length) {
      this.bus.emit('bombs:denied', { reason: 'empty_rack' });
      this.bus.emit('toast', { text: 'Bomb rack empty — re-arm at a station shipworks.', kind: 'info', ttl: 1.6 });
      return null;
    }
    const index = loaded.findIndex((c) => c.id === rt.selectedId);
    const next = loaded[(index + 1) % loaded.length];
    rt.selectedId = next.id;
    this.bus.emit('bombs:cycle', { payloadId: next.id, name: bombDef(next.id).name, index: rt.rack.cells.indexOf(next) });
    this.bus.emit('toast', { text: `Bomb bay: ${bombDef(next.id).name}`, kind: 'info', ttl: 1.6 });
    return next.id;
  },

  // ---- station rack verbs (direct methods are ungated; ui: intents carry the berth gate) --
  // Every credit move goes through the economy owner's event seam; this system never writes
  // state.player.credits itself.
  buyPayload({ payloadId, units = 1 } = {}) {
    const def = BOMB_DEFS[payloadId];
    if (!def) return false;
    const n = Math.max(1, Math.floor(Number(units) || 0));
    const cost = def.price * n;
    const credits = Number(this.state.player && this.state.player.credits) || 0;
    if (credits < cost) {
      this.bus.emit('bombs:denied', { reason: 'credits', payloadId, cost });
      this.bus.emit('toast', { text: `Not enough credits — ${n}× ${def.name} is ${cost} cr (${def.price} each).`, kind: 'info', ttl: 1.8 });
      return false;
    }
    this.bus.emit('economy:chargeCredits', { amount: cost, reason: `ordnance:${payloadId}` });
    const rt = ensureRuntime(this.state);
    rt.stock[payloadId] = (rt.stock[payloadId] || 0) + n;
    this.bus.emit('bombs:stockChanged', { payloadId, stock: rt.stock[payloadId], delta: n });
    this.bus.emit('toast', { text: `${n}× ${def.name} stowed — hangar holds ${rt.stock[payloadId]}.`, kind: 'info', ttl: 1.8 });
    return true;
  },

  // Fit loads the socket's magazine from hangar stock. Fitting a payload already seated in
  // another socket consolidates its load here (one payload lives in one socket); the socket's
  // previous occupant returns its remaining units to stock.
  fitPayload({ socketIndex, payloadId } = {}) {
    const rt = ensureRuntime(this.state), def = BOMB_DEFS[payloadId];
    const i = Math.floor(Number(socketIndex));
    if (!def || !Number.isSafeInteger(i) || i < 0 || i >= rt.rack.sockets) return false;
    const cell = rt.rack.cells[i];
    if (cell && cell.id === payloadId) {
      const move = Math.min(def.magazine - cell.count, rt.stock[payloadId] || 0);
      if (move <= 0) {
        this.bus.emit('toast', { text: `No ${def.name} in the hangar to load.`, kind: 'info', ttl: 1.8 });
        return false;
      }
      cell.count += move;
      rt.stock[payloadId] -= move;
      this._rackChanged(`Topped up ${def.name} — socket ${i + 1} holds ${cell.count}.`);
      return true;
    }
    // Units available = hangar stock + whatever the same payload already carries elsewhere.
    const other = rt.rack.cells.findIndex((c, k) => k !== i && c && c.id === payloadId);
    const carried = other >= 0 ? rt.rack.cells[other].count : 0;
    const available = (rt.stock[payloadId] || 0) + carried;
    if (available <= 0) {
      this.bus.emit('bombs:denied', { reason: 'no_stock', payloadId });
      this.bus.emit('toast', { text: `No ${def.name} in the hangar — buy ordnance first.`, kind: 'info', ttl: 1.8 });
      return false;
    }
    const load = Math.min(def.magazine, available);
    if (other >= 0) rt.rack.cells[other] = null;
    rt.stock[payloadId] = available - load;
    if (cell) rt.stock[cell.id] = (rt.stock[cell.id] || 0) + cell.count;
    rt.rack.cells[i] = { id: payloadId, count: load };
    this._rackChanged(`${def.name} loaded in socket ${i + 1} — ${load} ready.`);
    return true;
  },

  unfitPayload({ socketIndex } = {}) {
    const rt = ensureRuntime(this.state);
    const i = Math.floor(Number(socketIndex));
    if (!Number.isSafeInteger(i) || i < 0 || i >= rt.rack.sockets) return false;
    const cell = rt.rack.cells[i];
    if (!cell) return false;
    rt.stock[cell.id] = (rt.stock[cell.id] || 0) + cell.count;
    rt.rack.cells[i] = null;
    this._rackChanged(`${bombDef(cell.id).name} back in the hangar.`);
    return true;
  },

  // Dock-side resupply: refill every fitted magazine from hangar stock for one flat yard
  // fee (economy data: BOMB_RACK.restockFeeCr). A dry socket keeps its fit, so this is the
  // whole combat-rearm loop — buy stock, dock, restock.
  restockRack() {
    const rt = ensureRuntime(this.state);
    const needy = rt.rack.cells.filter((c) => c && (rt.stock[c.id] || 0) > 0 && c.count < BOMB_DEFS[c.id].magazine);
    if (!needy.length) {
      this.bus.emit('toast', { text: 'Nothing to restock — rack is full or the hangar has no matching ordnance.', kind: 'info', ttl: 1.8 });
      return false;
    }
    const credits = Number(this.state.player && this.state.player.credits) || 0;
    if (credits < BOMB_RACK.restockFeeCr) {
      this.bus.emit('bombs:denied', { reason: 'credits', cost: BOMB_RACK.restockFeeCr });
      this.bus.emit('toast', { text: `Restock fee is ${BOMB_RACK.restockFeeCr} cr — not enough credits.`, kind: 'info', ttl: 1.8 });
      return false;
    }
    let moved = 0;
    for (const cell of needy) {
      const move = Math.min(BOMB_DEFS[cell.id].magazine - cell.count, rt.stock[cell.id] || 0);
      cell.count += move;
      rt.stock[cell.id] -= move;
      moved += move;
    }
    this.bus.emit('economy:chargeCredits', { amount: BOMB_RACK.restockFeeCr, reason: 'service:ordnance_restock' });
    this._rackChanged(`Rack restocked — ${moved} unit${moved === 1 ? '' : 's'} loaded, ${BOMB_RACK.restockFeeCr} cr yard fee.`);
    return true;
  },

  upgradeRack() {
    const rt = ensureRuntime(this.state);
    if (rt.rack.sockets >= BOMB_RACK.socketsMax) {
      this.bus.emit('toast', { text: 'The rack is already at full extension.', kind: 'info', ttl: 1.8 });
      return false;
    }
    const credits = Number(this.state.player && this.state.player.credits) || 0;
    if (credits < BOMB_RACK.socketUpgradeCr) {
      this.bus.emit('bombs:denied', { reason: 'credits', cost: BOMB_RACK.socketUpgradeCr });
      this.bus.emit('toast', { text: `A third rack socket is ${BOMB_RACK.socketUpgradeCr} cr — not enough credits.`, kind: 'info', ttl: 1.8 });
      return false;
    }
    this.bus.emit('economy:chargeCredits', { amount: BOMB_RACK.socketUpgradeCr, reason: 'service:bomb_rack_socket' });
    rt.rack.sockets += 1;
    rt.rack.cells.push(null);
    this._rackChanged(`Rack extended — ${rt.rack.sockets} sockets fitted.`);
    return true;
  },

  sellPayload({ payloadId, units = 1 } = {}) {
    const def = BOMB_DEFS[payloadId];
    if (!def) return false;
    const rt = ensureRuntime(this.state);
    const have = rt.stock[payloadId] || 0;
    const n = Math.min(have, Math.max(1, Math.floor(Number(units) || 0)));
    if (n <= 0) return false;
    const refund = Math.max(1, Math.floor(def.price * n * BOMB_RACK.sellbackFraction));
    rt.stock[payloadId] = have - n;
    this.bus.emit('economy:grantCredits', { amount: refund, reason: `ordnance:resell:${payloadId}` });
    this.bus.emit('bombs:stockChanged', { payloadId, stock: rt.stock[payloadId], delta: -n });
    this.bus.emit('toast', { text: `${n}× ${def.name} sold back — ${refund} cr.`, kind: 'info', ttl: 1.8 });
    return true;
  },

  _rackChanged(text) {
    normalizeStock(this.state.bombs);
    normalizeSelection(this.state.bombs);
    this.bus.emit('bombs:rackChanged', { rack: this.state.bombs.rack, stock: this.state.bombs.stock });
    this.bus.emit('toast', { text, kind: 'info', ttl: 1.8 });
  },

  // One eligibility scan and one stable order per occupied tick, NOT eight payload-specific
  // whole-world scans. The spatial hash excludes noncolliding loose bodies: using it alone
  // would silently drop valid targets. This complete scan is bounded by live world population.
  _collect(state) {
    this._active.length = 0;
    for (const e of liveBombList(state)) if (e?.alive && e.type === BOMB_TYPE && e.data) this._active.push(e);
    this._active.sort(compareBombEntityIds);
    this._targets.length = 0;
    if (!this._active.length) return;
    for (const e of state.entityList || EMPTY) {
      if (e?.alive && e.pos && (DAMAGE_TYPES.has(e.type) || movable(e))) this._targets.push(e);
    }
    this._targets.sort(compareBombEntityIds);
  },

  // Public common release path for later AI adoption. No NPC doctrine is enabled by this PR.
  // Caller must hold a live entity; it cannot smuggle an unregistered owner into attribution.
  // Rack law (PQ-205.03): the PLAYER may only drop a payload sitting loaded in a rack socket,
  // and each drop consumes one unit of it. Non-player owners bypass the rack entirely — NPC
  // drops (action_drop_bomb, combatDefs) have no hangar and never will.
  drop(owner, payloadId, state = this.state) {
    if (!state || blocked(state, owner) || state.entities.get(owner.id) !== owner || !BOMB_DEFS[payloadId]) return null;
    const now = simNow(state), rt = ensureRuntime(state);
    const isPlayer = owner.id === state.playerId;
    let cell = null;
    if (isPlayer) {
      cell = rt.rack.cells.find((c) => c && c.id === payloadId && c.count > 0) || null;
      if (!cell) {
        this.bus.emit('bombs:denied', { ownerId: owner.id, reason: 'not_loaded', payloadId });
        return null;
      }
    }
    let bay = isPlayer ? rt : this._ownerCooldowns.get(owner.id);
    if (!bay) this._ownerCooldowns.set(owner.id, bay = { cooldownUntil: 0, cooldowns: {} });
    if (now < Math.max(bay.cooldownUntil || 0, bay.cooldowns[payloadId] || 0)) return null;
    let owned = 0, total = 0;
    for (const e of liveBombList(state)) {
      if (!e?.alive || e.type !== BOMB_TYPE) continue;
      total++;
      if (e.data?.ownerId === owner.id) owned++;
    }
    if (owned >= BOMB_DRIFT.maxActive || total >= BOMB_DRIFT.maxWorldActive) {
      this.bus.emit('bombs:denied', { ownerId: owner.id, reason: owned >= BOMB_DRIFT.maxActive ? 'bay_full' : 'world_full' });
      if (owner.id === state.playerId) this.bus.emit('toast', { text: 'Bomb bay full — trigger armed ordnance or let its fuze finish.', kind: 'info', ttl: 1.6 });
      return null; // no cooldown, no eviction, no free explosion
    }
    const def = bombDef(payloadId), vx = Number(owner.vel?.x) || 0, vz = Number(owner.vel?.z) || 0;
    const heading = Math.hypot(vx, vz) > 12 ? Math.atan2(vz, vx) : owner.rot || 0;
    const standoff = Math.max(0, owner.radius || 6) + BOMB_DRIFT.dropStandoffWu;
    const pos = { x: owner.pos.x - Math.cos(heading) * standoff, z: owner.pos.z - Math.sin(heading) * standoff };
    const bomb = this.helpers.spawnEntity({
      type: BOMB_TYPE, pos, vel: { x: vx, z: vz }, rot: heading,
      radius: 1.4, mass: 2, collides: false, physicsBody: false, team: owner.team, ownerId: owner.id,
      data: {
        kind: 'bomb', bombId: def.id, ownerId: owner.id, phase: 'drift', armed: false,
        armedAt: now + BOMB_DRIFT.armS, detonateAt: now + def.fuzeS,
        spawnedAt: now, fieldStartedAt: 0, fieldEndsAt: 0, nextFieldTick: 0,
        triggered: false, spinRadS: 0, sectorId: state.world?.currentSectorId || null,
      },
    });
    if (!bomb) return null;
    bomb.data.spinRadS = (Math.abs(Math.trunc(bomb.id)) % 2 ? 1 : -1) * BOMB_DRIFT.maxSpinRadS;
    bay.cooldownUntil = now + BOMB_DRIFT.releaseIntervalS;
    bay.cooldowns[payloadId] = now + def.cooldownS;
    if (cell) {
      // A dropped unit leaves the magazine. The cell keeps its payload id at 0 — the socket
      // stays fitted, dock-side restock refills it. If the selection just ran dry the bay
      // auto-advances to the next loaded socket so the verb never points at an empty cell.
      cell.count = Math.max(0, cell.count - 1);
      if (cell.count === 0 && rt.selectedId === payloadId) {
        // Advance in socket order past the socket that just ran dry, wrapping once — not a
        // jump back to the first loaded socket on a multi-socket rack.
        const cells = rt.rack.cells;
        const from = Math.max(0, cells.indexOf(cell));
        let next = null;
        for (let step = 1; step <= cells.length; step++) {
          const candidate = cells[(from + step) % cells.length];
          if (candidate && candidate.count > 0) { next = candidate; break; }
        }
        rt.selectedId = next ? next.id : null;
        this.bus.emit('bombs:cycle', {
          payloadId: rt.selectedId, name: next ? bombDef(next.id).name : null,
          index: next ? cells.indexOf(next) : -1, reason: 'depleted',
        });
      }
      this.bus.emit('bombs:stockChanged', { payloadId, loaded: cell.count, delta: -1 });
    }
    this.bus.emit('bombs:dropped', { bombId: bomb.id, payloadId, ownerId: owner.id, pos, vel: { x: vx, z: vz }, radius: def.radius });
    this.bus.emit('audio:cue', { id: 'massline.bombDrop', position: pos, gain: 0.5 });
    return bomb;
  },

  commandDetonate(ownerId, state = this.state) {
    if (!state || blocked(state, state.entities.get(ownerId))) return 0;
    let count = 0;
    for (const e of liveBombList(state)) {
      if (e?.alive && e.type === BOMB_TYPE && e.data?.ownerId === ownerId && e.data.phase === 'drift'
        && simNow(state) >= e.data.armedAt) {
        this._prime(e, 'command', simNow(state)); count++;
      }
    }
    if (count) this.bus.emit('bombs:commanded', { ownerId, count, tick: state.tick });
    return count;
  },

  _prime(bomb, trigger, now) {
    const d = bomb.data;
    if (d.phase !== 'drift') return false;
    d.phase = 'warning';
    d.trigger = trigger;
    d.warningAt = now;
    d.resolveAt = Math.min(d.detonateAt, now + BOMB_DRIFT.warningS);
    this.bus.emit('bombs:primed', {
      bombId: bomb.id, payloadId: d.bombId, ownerId: d.ownerId, trigger,
      pos: { x: bomb.pos.x, z: bomb.pos.z }, resolveAt: d.resolveAt, radius: bombDef(d.bombId).radius,
    });
    return true;
  },

  _tickBombs(dt, state) {
    const now = simNow(state), start = now - dt;
    for (const bomb of this._active) {
      if (!bomb.alive) continue;
      const d = bomb.data;
      const x0 = bomb.pos.x, z0 = bomb.pos.z;
      // Bombs are outside core's physics-movable index, so their owner snapshots interpolation.
      if (bomb.prevPos) { bomb.prevPos.x = x0; bomb.prevPos.z = z0; }
      bomb.prevRot = bomb.rot;
      integrateBombDrift(this._motion, x0, z0, bomb.vel.x, bomb.vel.z, dt, d.phase === 'field'
        ? bombDef(d.bombId).field?.driftDragPerS ?? BOMB_DRIFT.dragPerS : BOMB_DRIFT.dragPerS);
      // Explicit kinematic exception: these are bomb-owned entities, never foreign bodies.
      bomb.pos.x = this._motion.x; bomb.pos.z = this._motion.z;
      bomb.vel.x = this._motion.vx; bomb.vel.z = this._motion.vz;
      bomb.rot += (d.spinRadS || 0) * dt;
      if (d.phase === 'field') {
        if (now >= d.fieldEndsAt) this._endField(bomb, state, 'expired');
        continue;
      }
      if (!d.armed && now >= d.armedAt) {
        d.armed = true;
        this.bus.emit('bombs:armed', { bombId: bomb.id, payloadId: d.bombId, pos: { x: bomb.pos.x, z: bomb.pos.z } });
      }
      if (d.phase === 'drift') {
        if (d.armed && this._findTriggerVictim(state, bomb, d, x0, z0, dt, Math.max(0, (d.armedAt - start) / dt))) {
          this._prime(bomb, 'proximity', now);
        } else if (now >= d.detonateAt - BOMB_DRIFT.warningS) this._prime(bomb, 'fuze', now);
      }
      if (d.phase === 'warning' && now + 1e-9 >= d.resolveAt) this._detonate(bomb, d, state, d.trigger);
    }
    // Resolve ALL lifecycle transitions before fields sample one another. New fields get no
    // retroactive force for time before opening; expired ones contribute no final ghost impulse.
    // Count overlaps ONCE: O(fields * targets), never an O(fields² * targets) inner brake scan.
    this._gooCoverage.length = this._targets.length;
    this._gooCoverage.fill(0);
    for (const bomb of this._active) {
      if (!bomb.alive || bomb.data.phase !== 'field' || bomb.data.fieldStartedAt >= now) continue;
      const def = bombDef(bomb.data.bombId);
      if (def.field?.kind !== 'goo') continue;
      for (let i = 0; i < this._targets.length; i++) {
        const ent = this._targets[i];
        if (ent.alive && movable(ent) && bombSurfaceFalloff(Math.hypot(ent.pos.x - bomb.pos.x, ent.pos.z - bomb.pos.z), ent.radius, def.radius) > 0) this._gooCoverage[i]++;
      }
    }
    for (const bomb of this._active) {
      if (bomb.alive && bomb.data.phase === 'field') this._tickField(bomb, state, Math.min(dt, now - bomb.data.fieldStartedAt));
    }
  },

  _findTriggerVictim(state, bomb, d, x0 = bomb.pos.x, z0 = bomb.pos.z, dt = 0, minT = 0) {
    let best = null, bestT = Infinity;
    const def = bombDef(d.bombId);
    for (const e of this._targets) {
      if (!e.alive || !craft(e) || e.id === d.ownerId || (bomb.team != null && e.team != null && e.team === bomb.team)) continue;
      const t = sweptBombContact(e.pos.x - x0, e.pos.z - z0,
        e.pos.x + (e.vel?.x || 0) * dt - bomb.pos.x,
        e.pos.z + (e.vel?.z || 0) * dt - bomb.pos.z,
        def.triggerRadius + Math.max(0, e.radius || 0), minT);
      if (t < bestT) { best = e; bestT = t; } // stable sorted-ID tie break
    }
    return best;
  },

  _detonate(bomb, d, state, trigger) {
    if (!bomb.alive || d.triggered || (d.phase !== 'drift' && d.phase !== 'warning')) return false;
    const def = bombDef(d.bombId), pos = { x: bomb.pos.x, z: bomb.pos.z };
    d.triggered = true; d.detonatedTick = state.tick;
    const result = def.field?.kind === 'singularity' ? null
      : this._blastVictims(state, { pos, def, ownerId: d.ownerId, originId: bomb.id, trigger });
    if (def.field) {
      d.phase = 'field'; d.fieldStartedAt = simNow(state); d.fieldEndsAt = d.fieldStartedAt + def.field.durationS;
      d.nextFieldTick = state.tick + def.field.tickEveryTicks;
    } else { d.phase = 'spent'; bomb.alive = false; }
    this._emitDetonated(bomb, d, def, state, pos, trigger, result);
    return true;
  },
  _emitDetonated(bomb, d, def, state, pos, trigger, result) {
    this.bus.emit('bombs:detonated', {
      schemaVersion: 2, bombId: bomb.id, payloadId: def.id, ownerId: d.ownerId,
      pos, vel: { x: bomb.vel.x, z: bomb.vel.z }, radius: def.radius, trigger,
      hits: result?.hits || EMPTY, shoves: result?.shoves || EMPTY,
    });
    const cueId = trigger === 'collapse' && def.collapseAudioCue ? def.collapseAudioCue : def.audioCue;
    this.bus.emit('audio:cue', {
      id: cueId, position: pos, gain: 0.65,
      bombId: bomb.id, payloadId: def.id, trigger, trackId: bomb.id,
    });
  },

  _blastVictims(state, { pos, def, ownerId, originId, trigger, impulseOverride = null, damageOverride = null }) {
    const impulse = impulseOverride ?? def.impulse, damage = damageOverride ?? def.damage;
    const hits = [], shoves = [], attackerMass = massOf(state.entities.get(ownerId));
    for (const ent of this._targets) {
      if (!ent.alive || ent.id === originId) continue;
      const dx = ent.pos.x - pos.x, dz = ent.pos.z - pos.z, dist = Math.hypot(dx, dz);
      const falloff = bombSurfaceFalloff(dist, ent.radius, def.radius);
      if (!(falloff > 0)) continue;
      let dirX = dist > 1e-8 ? dx / dist : 0, dirZ = dist > 1e-8 ? dz / dist : 1;
      // Havoc is a cross-current, not a recoloured radial concussion. Preserve total impulse.
      if (def.tangentRatio) {
        const q = def.tangentRatio, norm = Math.hypot(1, q), x = dirX;
        dirX = (dirX - dirZ * q) / norm; dirZ = (dirZ + x * q) / norm;
      }
      const magnitude = impulse * falloff;
      if (magnitude > 0 && movable(ent) && this._applyImpulse(ent, dirX * magnitude, dirZ * magnitude, state, 'bomb_blast')) {
        considerShove(shoves, ent.id, dirX, dirZ, magnitude);
        this._publishHitstun(state, ent, { dirX, dirZ, magnitude, ownerId, attackerMass, payloadId: def.id, trigger });
      }
      if (DAMAGE_TYPES.has(ent.type) && (damage > 0 || def.statuses?.length)) {
        const packet = scalarHitToDamagePacket({
          damage: damage * falloff, damageType: def.damageType, pos,
          penetration: def.penetration || 0, heat: def.heat || 0, statuses: def.statuses || EMPTY,
          subsystemShare: def.subsystemShare ?? null, shieldBypass: def.shieldBypass || 0,
          source: { kind: 'bomb', payloadId: def.id, bombId: originId },
        });
        packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
        const result = this._routeDamage({ attackerId: ownerId, targetId: ent.id, packet, origin: { kind: 'bomb', id: originId, payloadId: def.id } });
        // hits are routing receipts, not a claim of hull loss (shields/armour may absorb it).
        if (result !== false && result?.ok !== false) hits.push(ent.id);
      }
    }
    shoves.sort((a, b) => b.mag - a.mag || compareBombEntityIds(a, b));
    return { hits: Object.freeze(hits), shoves: Object.freeze(shoves) };
  },
  _publishHitstun(state, victim, input) {
    if (!victim || victim.alive === false) return;
    if (victim.type !== 'ship' && victim.type !== 'drone') return;
    if (victim.id === state.playerId) return; // B13: the player is never stunned
    const victimMass = massOf(victim, 1);
    const deltaV = input.magnitude / victimMass;
    if (!(deltaV > 0)) return;
    const hitSide = signedHitSide(victim, { x: input.dirX, z: input.dirZ }, {
      pos: {
        x: Number(victim.pos && victim.pos.x) || 0,
        z: (Number(victim.pos && victim.pos.z) || 0) + Math.max(4, (victim.radius || 8) * 0.75),
      },
    }, victim.id);
    const provenance = Object.freeze({
      schemaVersion: 1,
      kind: 'bomb',
      source: input.trigger || 'fuze',
      tag: 'bomb_blast',
      payloadId: input.payloadId == null ? null : String(input.payloadId),
    });
    recordImpulseProvenance(victim, {
      actorId: input.ownerId == null ? null : input.ownerId,
      weaponId: input.payloadId == null ? null : input.payloadId,
      tag: 'bomb_blast',
      appliedTick: state.tick | 0,
      magnitude: input.magnitude,
    });
    publishHitstunImpulse(this.bus, {
      source: 'bomb',
      victimId: victim.id,
      attackerId: input.ownerId == null ? null : input.ownerId,
      attackerMass: Math.max(0.1, Number(input.attackerMass) || 1),
      victimMass,
      deltaV,
      dirX: input.dirX,
      dirZ: input.dirZ,
      hitSide,
      provenance,
      tick: state.tick,
    });
  },

  _tickField(bomb, state, dt) {
    if (!(dt > 0)) return;
    const d = bomb.data, def = bombDef(d.bombId), f = def.field;
    if (!f) return;
    const envelope = bombFieldEnvelope(simNow(state), d.fieldStartedAt, f.durationS, f.endStrength ?? 1);
    const applyStatusTick = state.tick >= d.nextFieldTick;
    // No historical damage burst after a long step: update is a fixed 60 Hz contract. Advance
    // the cadence arithmetically, so an irregular fixture cannot permanently phase-shift it.
    if (applyStatusTick) d.nextFieldTick += (Math.floor((state.tick - d.nextFieldTick) / f.tickEveryTicks) + 1) * f.tickEveryTicks;
    for (let targetIndex = 0; targetIndex < this._targets.length; targetIndex++) {
      const ent = this._targets[targetIndex];
      if (!ent.alive || ent.id === bomb.id) continue;
      const dx = bomb.pos.x - ent.pos.x, dz = bomb.pos.z - ent.pos.z, dist = Math.hypot(dx, dz);
      const falloff = bombSurfaceFalloff(dist, ent.radius, def.radius);
      if (!(falloff > 0)) continue;
      if (f.kind === 'singularity' && movable(ent) && dist > 1e-8) {
        const mass = massOf(ent), couple = Math.max(FIELD_COUPLING.minShipCouple, FIELD_COUPLING.refMass / Math.max(mass, FIELD_COUPLING.refMass));
        const j = f.strength * envelope * falloff * couple * mass * dt;
        queuePhysicsImpulse(ent, { x: dx / dist * j, z: dz / dist * j });
      } else if (f.kind === 'goo' && movable(ent)) {
        const coverage = this._gooCoverage[targetIndex] || 1;
        if (fillBombViscosityImpulse(this._viscosity, ent.vel, bomb.vel, effectiveMass(state, ent), dt, f.dragPerS * falloff, 1 / Math.max(1, coverage))) {
          queuePhysicsImpulse(ent, this._viscosity);
        }
      }
      if (!applyStatusTick || !craft(ent)) continue;
      const crush = f.kind === 'singularity' && Math.max(0, dist - (ent.radius || 0)) <= f.crushInnerRadius;
      if (f.kind !== 'goo' && !crush) continue;
      const packet = scalarHitToDamagePacket({
        damage: crush ? f.crushDamage : 0, damageType: crush ? 'plasma' : 'kinetic', pos: bomb.pos,
        statuses: crush ? EMPTY : [{ id: 'status_goo', stacks: f.applyStacks }],
        source: { kind: 'bomb', payloadId: def.id, bombId: bomb.id, phase: crush ? 'crush' : 'tar' },
      });
      packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
      this._routeDamage({ attackerId: d.ownerId, targetId: ent.id, packet, origin: { kind: 'bomb', id: bomb.id, payloadId: def.id } });
    }
  },

  _endField(bomb, state, reason) {
    if (!bomb.alive || bomb.data.phase !== 'field') return;
    const d = bomb.data, def = bombDef(d.bombId), pos = { x: bomb.pos.x, z: bomb.pos.z };
    bomb.alive = false; d.phase = 'spent';
    if (reason === 'expired' && def.field?.kind === 'singularity') {
      const result = this._blastVictims(state, { pos, def, ownerId: d.ownerId, originId: bomb.id, trigger: 'collapse',
        impulseOverride: def.field.collapseImpulse, damageOverride: def.field.collapseDamage });
      this._emitDetonated(bomb, d, def, state, pos, 'collapse', result);
    }
    this.bus?.emit('bombs:fieldEnded', {
      schemaVersion: 2, bombId: bomb.id, payloadId: def.id, ownerId: d.ownerId, pos,
      trigger: reason === 'expired' && def.field?.kind === 'singularity' ? 'collapse' : reason,
    });
  },
  _applyImpulse(ent, x, z, state, reason) {
    const physics = this.helpers?.combatPhysics;
    return !!physics?.applyImpulse && physics.applyImpulse({ entityId: ent.id, impulse: { x, z }, point: null, reason, tick: state.tick }) !== false;
  },
  _routeDamage(request) {
    if (typeof this.helpers?.routeCombatDamage === 'function') return this.helpers.routeCombatDamage(request);
    const combat = this.registry?.get?.('combat');
    if (combat?.ensureKernel) return combat.ensureKernel().routeDamage(request);
    this.bus.emit('combat:routeDamage', request);
    return null;
  },
  releaseAll(reason = 'release') {
    if (!this.state) return 0;
    let count = 0;
    for (const e of liveBombList(this.state)) {
      if (!e?.alive || e.type !== BOMB_TYPE) continue;
      if (e.data?.phase === 'field') this._endField(e, this.state, reason);
      e.alive = false;
      if (e.data) e.data.phase = 'spent';
      count++;
    }
    this._ownerCooldowns?.clear();
    if (count) this.bus?.emit('bombs:released', { count, reason });
    return count;
  },
  _resetRuntime(reason) {
    this.releaseAll(reason);
    if (!this.state) return;
    const rt = ensureRuntime(this.state);
    applyStarterKit(rt);
    Object.assign(rt, { cooldownUntil: 0, cooldowns: {} });
    normalizeSelection(rt);
  },

  // ---- save owner (PQ-205.03) -----------------------------------------------------------
  // The whole bag persists: fitted cells (type + remaining units), socket count, hangar
  // stock, per-payload cooldowns and the live selection. In-flight bomb entities are
  // transient — non-persistent actors never serialize.
  serialize() {
    const rt = ensureRuntime(this.state);
    return {
      v: 1,
      selectedId: rt.selectedId,
      cooldownUntil: rt.cooldownUntil,
      cooldowns: { ...rt.cooldowns },
      rack: {
        sockets: rt.rack.sockets,
        cells: rt.rack.cells.map((c) => (c ? { id: c.id, count: c.count } : null)),
      },
      stock: { ...rt.stock },
    };
  },
  deserialize(data) {
    const rt = ensureRuntime(this.state);
    // Pre-rack saves carry no `bombs` key at all (and a partial bag without a rack is treated
    // the same): the additive default is the starter kit, not an error and not an empty bay.
    if (!data || typeof data !== 'object' || !data.rack || typeof data.rack !== 'object') {
      applyStarterKit(rt);
      rt.cooldownUntil = 0;
      rt.cooldowns = {};
      normalizeSelection(rt);
      return;
    }
    rt.cooldownUntil = Math.max(0, Number(data.cooldownUntil) || 0);
    rt.cooldowns = {};
    for (const [id, until] of Object.entries(data.cooldowns || {})) {
      const t = Number(until);
      if (BOMB_DEFS[id] && Number.isFinite(t) && t >= 0) rt.cooldowns[id] = t;
    }
    const sockets = Math.max(1, Math.min(BOMB_RACK.socketsMax, Math.floor(Number(data.rack.sockets)) || BOMB_RACK.socketsBase));
    const savedCells = Array.isArray(data.rack.cells) ? data.rack.cells : [];
    rt.rack = { sockets, cells: new Array(sockets).fill(null) };
    rt.stock = {};
    for (let i = 0; i < savedCells.length; i++) {
      const c = savedCells[i], def = c && BOMB_DEFS[c.id];
      const count = Math.floor(Number(c && c.count));
      const normalized = def ? { id: def.id, count: Math.max(0, Math.min(def.magazine, Number.isFinite(count) ? count : 0)) } : null;
      if (i < sockets) rt.rack.cells[i] = normalized;
      // A save made before a socket reduction (or a crafted oversize rack) never destroys
      // paid-for ordnance: overflow cell contents return to the hangar.
      else if (normalized && normalized.count > 0) rt.stock[normalized.id] = (rt.stock[normalized.id] || 0) + normalized.count;
    }
    for (const [id, n] of Object.entries(data.stock || {})) {
      const count = Math.floor(Number(n));
      if (BOMB_DEFS[id] && count > 0) rt.stock[id] = (rt.stock[id] || 0) + count;
    }
    rt.selectedId = typeof data.selectedId === 'string' ? data.selectedId : null;
    normalizeSelection(rt);
  },
};

/** Allocating convenience for tooling/HUD, never used inside the sim hot path. */
export function listBombs(state) {
  return [...liveBombList(state)].filter(e => e?.alive && e.type === BOMB_TYPE);
}
