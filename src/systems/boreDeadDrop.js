// A hollowed bore room behind a false rock cap. The site record holds the goods.
// Cargo remains the only writer of the hold: this module plans the pocket, disguises
// the mouth, and lists stacks a lawful scan is already allowed to see.
//
// lawSecurity pulls combat, and combat imports cargo, which imports this file, so this
// module cannot import lawSecurity without closing that cycle while cargo is still
// evaluating. The composition root (src/core/registry.js) hands the witness query in
// through setDeadDropWitnessSource instead; until it does, nobody has seen the mouth.
// (A Node-only module import here would stop the browser build from loading.)

import { COMMODITIES } from '../data/commodities.js';

// drill.js owns this width and also imports addCargo. Inlined so the cache does
// not import the drill system. A refilled mouth must leave the cleared-tile list
// or the next session unions the old hole back open.
const DRILL_COLS = 28;
const MAX_ROOM = 6;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const FACES = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

const COMMODITY_NAME = new Map(COMMODITIES.map((row) => [row.id, row.name]));
let witnessesNearFn = null;

function commodityDisplayName(commodityId) {
  const name = COMMODITY_NAME.get(commodityId);
  return typeof name === 'string' && name ? name : 'The crate';
}

export function deadDropStowLine(commodityId, witnessed) {
  if (witnessed) return deadDropWitnessLine();
  return `${commodityDisplayName(commodityId)} is in the room behind the cap. The mouth reads as solid rock.`;
}

export function deadDropWitnessLine() {
  return 'A patrol saw you at the mouth. The rock will not hide what is inside.';
}

export function deadDropReturnLine(commodityId) {
  return `${commodityDisplayName(commodityId)} is back aboard.`;
}

/** The law system's witness query, registered once by the composition root. */
export function setDeadDropWitnessSource(fn) {
  witnessesNearFn = typeof fn === 'function' ? fn : null;
}

function witnessesNear(state, query) {
  if (typeof witnessesNearFn !== 'function') return [];
  const seen = witnessesNearFn(state, query);
  return Array.isArray(seen) ? seen : [];
}

function tileIndex(col, row) {
  return (Math.trunc(row) * DRILL_COLS) + Math.trunc(col);
}

function inBounds(field, col, row) {
  if (!Array.isArray(field) || col < 0 || col >= field.length) return false;
  const column = field[col];
  return Array.isArray(column) && row >= 0 && row < column.length;
}

function cell(field, col, row) {
  return inBounds(field, col, row) ? field[col][row] : null;
}

function isEmpty(tile) {
  return !!(tile && tile.type === 'empty');
}

function anchoredSites(state) {
  const sites = state && state.sites;
  const byId = sites && sites.byId;
  if (!byId || typeof byId !== 'object') return [];
  const order = Array.isArray(sites.order) ? sites.order : Object.keys(byId);
  const out = [];
  for (let i = 0; i < order.length; i++) {
    const site = byId[order[i]];
    if (site && site.anchored === true) out.push(site);
  }
  return out;
}

function siteForAsteroid(state, asteroidId) {
  if (asteroidId == null) return null;
  const sites = anchoredSites(state);
  for (let i = 0; i < sites.length; i++) {
    if (sites[i].asteroidId === asteroidId) return sites[i];
  }
  return null;
}

function asteroidEntity(state) {
  const id = state && state.drill && state.drill.asteroidId;
  const entities = state && state.entities;
  if (id == null || !entities || typeof entities.get !== 'function') return null;
  return entities.get(id) || null;
}

function playerShip(state) {
  const id = state && state.playerId;
  const entities = state && state.entities;
  if (id == null || !entities || typeof entities.get !== 'function') return null;
  return entities.get(id) || null;
}

function entryWasSeen(state) {
  const ship = playerShip(state);
  const pos = ship && ship.pos;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return false;
  const seen = witnessesNear(state, {
    pos: { x: pos.x, z: pos.z },
    offenderEntityId: state.playerId,
  });
  return seen.length > 0;
}

function readStacks(raw) {
  const stacks = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { stacks, malformed: true };
  let malformed = false;
  const ids = Object.keys(raw);
  for (let i = 0; i < ids.length; i++) {
    const qty = raw[ids[i]];
    if (!Number.isInteger(qty) || qty <= 0) {
      malformed = true;
      continue;
    }
    stacks[ids[i]] = qty;
  }
  return { stacks, malformed };
}

function isHidden(drop) {
  if (!drop || drop.sealed !== true || drop.witnessed === true) return false;
  const read = readStacks(drop.stacks);
  if (read.malformed || Object.keys(read.stacks).length === 0) return false;
  return true;
}

function onCell(drop, avatar, which) {
  if (!drop || !avatar) return false;
  const col = Math.trunc(Number(avatar.col));
  const row = Math.trunc(Number(avatar.row));
  if (!Number.isFinite(col) || !Number.isFinite(row)) return false;
  if (which !== 'room' && drop.approach && drop.approach.col === col && drop.approach.row === row) return true;
  if (which === 'approach') return false;
  const room = drop.room;
  if (!Array.isArray(room)) return false;
  for (let i = 0; i < room.length; i++) {
    if (room[i] && room[i].col === col && room[i].row === row) return true;
  }
  return false;
}

function currentDrop(state) {
  const drill = state && state.drill;
  if (!drill) return null;
  const site = siteForAsteroid(state, drill.asteroidId);
  return site && site.deadDrop ? { site, drop: site.deadDrop } : null;
}

function capFromNeighbor(field, col, row) {
  for (let i = 0; i < DIRS.length; i++) {
    const tile = cell(field, col + DIRS[i][0], row + DIRS[i][1]);
    if (!tile || tile.type === 'empty' || tile.type === 'gas' || tile.hazard === true) continue;
    const hp = Math.max(1, Math.floor(Number(tile.maxHp) || Number(tile.hp) || 8));
    return { hp, maxHp: hp, hardness: Math.max(1, Math.floor(Number(tile.hardness) || 1)) };
  }
  return { hp: 8, maxHp: 8, hardness: 1 };
}

function placeOf(site, rock) {
  const anchor = site && site.anchor;
  if (anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.z)) return { x: anchor.x, z: anchor.z };
  const pos = rock && rock.pos;
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) return { x: pos.x, z: pos.z };
  return { x: 0, z: 0 };
}

export function planDeadDropStow(state, commodityId, qty) {
  const amount = Math.floor(Number(qty) || 0);
  if (typeof commodityId !== 'string' || !commodityId || !Number.isInteger(amount) || amount <= 0) return null;
  const drill = state && state.drill;
  if (!drill || drill.active !== true || !Array.isArray(drill.field)) return null;
  const avatar = drill.avatar;
  const face = avatar && FACES[avatar.faceDir];
  if (!face) return null;
  const ac = Math.trunc(Number(avatar.col));
  const ar = Math.trunc(Number(avatar.row));
  if (!Number.isFinite(ac) || !Number.isFinite(ar) || !isEmpty(cell(drill.field, ac, ar))) return null;
  const mc = ac + face[0];
  const mr = ar + face[1];
  if (!isEmpty(cell(drill.field, mc, mr))) return null;

  const seen = new Set([`${ac},${ar}`, `${mc},${mr}`]);
  const queue = [[mc, mr]];
  const blob = [];
  let rejected = false;
  while (queue.length) {
    const [c, r] = queue.shift();
    blob.push([c, r]);
    if (blob.length > MAX_ROOM + 1) {
      rejected = true;
      break;
    }
    for (let i = 0; i < DIRS.length; i++) {
      const nc = c + DIRS[i][0];
      const nr = r + DIRS[i][1];
      const key = `${nc},${nr}`;
      if (seen.has(key)) continue;
      if (!inBounds(drill.field, nc, nr)) {
        rejected = true;
        continue;
      }
      if (!isEmpty(cell(drill.field, nc, nr))) continue;
      seen.add(key);
      queue.push([nc, nr]);
    }
  }
  if (rejected || blob.length < 2) return null;
  const room = [];
  for (let i = 0; i < blob.length; i++) {
    const [c, r] = blob[i];
    if (c === mc && r === mr) continue;
    room.push({ col: c, row: r });
  }
  room.sort((a, b) => a.col - b.col || a.row - b.row);
  if (room.length < 1 || room.length > MAX_ROOM) return null;
  const site = siteForAsteroid(state, drill.asteroidId);
  if (!site || site.deadDrop) return null;
  return {
    commodityId,
    qty: amount,
    site,
    mouth: { col: mc, row: mr },
    approach: { col: ac, row: ar },
    room,
  };
}

export function commitDeadDropStow(state, plan, removed) {
  const qty = Math.floor(Number(removed) || 0);
  if (!plan || !plan.site || !plan.mouth || !Number.isInteger(qty) || qty <= 0) return false;
  const field = state && state.drill && state.drill.field;
  const col = plan.mouth.col;
  const row = plan.mouth.row;
  if (!field || !field[col] || !field[col][row]) return false;
  const disguise = capFromNeighbor(field, col, row);
  // Ore stays empty: a glowing vein is not a disguised hatch.
  field[col][row] = {
    type: 'rock',
    hp: disguise.hp,
    maxHp: disguise.maxHp,
    ore: null,
    hazard: false,
    tierReq: 1,
    hardness: disguise.hardness,
  };
  const rock = asteroidEntity(state);
  const cleared = rock && rock.data && rock.data.drillCleared;
  if (Array.isArray(cleared)) {
    const idx = tileIndex(col, row);
    rock.data.drillCleared = cleared.filter((value) => Math.trunc(Number(value)) !== idx);
  }
  const stacks = {};
  stacks[plan.commodityId] = qty;
  plan.site.deadDrop = {
    sealed: true,
    witnessed: entryWasSeen(state),
    mouth: { col, row },
    approach: { col: plan.approach.col, row: plan.approach.row },
    room: plan.room.map((spot) => ({ col: spot.col, row: spot.row })),
    stacks,
    place: placeOf(plan.site, rock),
  };
  return true;
}

export function noteDeadDropWitness(state) {
  const current = currentDrop(state);
  if (!current || current.drop.sealed !== true || current.drop.witnessed === true) return false;
  const avatar = state.drill && state.drill.avatar;
  if (!onCell(current.drop, avatar, 'either')) return false;
  if (!entryWasSeen(state)) return false;
  current.drop.witnessed = true;
  return true;
}

export function openDeadDropCap(state, payload) {
  const drill = state && state.drill;
  if (!drill || !payload) return null;
  const col = Math.trunc(Number(payload.col));
  const row = Math.trunc(Number(payload.row));
  if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
  const site = siteForAsteroid(state, drill.asteroidId);
  const drop = site && site.deadDrop;
  if (!drop || !drop.mouth || drop.mouth.col !== col || drop.mouth.row !== row) return null;
  const wasSealed = drop.sealed !== false;
  if (wasSealed) drop.sealed = false;
  let witnessedFlip = false;
  if (drop.witnessed !== true && entryWasSeen(state)) {
    drop.witnessed = true;
    witnessedFlip = true;
  }
  return wasSealed || witnessedFlip ? { opened: wasSealed, witnessedFlip } : null;
}

export function collectDeadDropLoads(state) {
  const current = currentDrop(state);
  if (!current || current.drop.sealed !== false) return [];
  const avatar = state.drill && state.drill.avatar;
  if (!onCell(current.drop, avatar, 'room')) return [];
  const read = readStacks(current.drop.stacks);
  const ids = Object.keys(read.stacks).sort();
  const loads = [];
  for (let i = 0; i < ids.length; i++) {
    loads.push({
      commodityId: ids[i],
      qty: read.stacks[ids[i]],
      drop: current.drop,
    });
  }
  return loads;
}

export function acceptDeadDropLoad(drop, commodityId, accepted) {
  const n = Math.floor(Number(accepted) || 0);
  if (!drop || !drop.stacks || !Number.isInteger(n) || n <= 0) return;
  const have = Math.floor(Number(drop.stacks[commodityId]) || 0);
  const left = have - n;
  if (left > 0) drop.stacks[commodityId] = left;
  else delete drop.stacks[commodityId];
}

export function exposedDeadDropStacks(state, commodityDef) {
  const out = [];
  const sites = anchoredSites(state);
  for (let s = 0; s < sites.length; s++) {
    const drop = sites[s].deadDrop;
    if (!drop || isHidden(drop)) continue;
    const read = readStacks(drop.stacks);
    const ids = Object.keys(read.stacks).sort();
    for (let i = 0; i < ids.length; i++) {
      const def = typeof commodityDef === 'function' ? commodityDef(state, ids[i]) : null;
      if (!def || !def.legality || def.legality === 'legal') continue;
      out.push({ commodityId: ids[i], qty: read.stacks[ids[i]], def });
    }
  }
  return out;
}

export function takeExposedDeadDrop(state, commodityId, qty) {
  let left = Math.floor(Number(qty) || 0);
  if (!Number.isInteger(left) || left <= 0) return 0;
  let taken = 0;
  const sites = anchoredSites(state);
  for (let i = 0; i < sites.length && left > 0; i++) {
    const drop = sites[i].deadDrop;
    if (!drop || !drop.stacks || isHidden(drop)) continue;
    const have = Math.floor(Number(drop.stacks[commodityId]) || 0);
    if (have <= 0) continue;
    const n = Math.min(have, left);
    const remain = have - n;
    if (remain > 0) drop.stacks[commodityId] = remain;
    else delete drop.stacks[commodityId];
    left -= n;
    taken += n;
  }
  return taken;
}

export function sealedBoreHiddenInSector(state) {
  const sectorId = state && state.world && state.world.currentSectorId;
  if (!sectorId) return false;
  const sites = anchoredSites(state);
  for (let i = 0; i < sites.length; i++) {
    if (sites[i].sectorId !== sectorId) continue;
    if (isHidden(sites[i].deadDrop)) return true;
  }
  return false;
}
