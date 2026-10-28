// 705 — THE NEST. A Reach freighter nursery with two salvaged blast baffles.
// Compact nursery brood fits bare Class I; standard Wasps need live Line T1.
// Tearing a 400t blast baffle requires Class III capacity and live Line T1.
// Guns and a deliberate escape remain valid. Real damage owns every death and aftermath.
// The visit owner persists this finite cast and its decision; trophy/raid records do not
// claim an implemented physical Sker trophy wall or a scheduled next-lane raid.
import { deepFreeze, defineEncounter } from './catalog.js';
import { faction as REACH } from '../factions/reach.js';

export const encounterOrder = 705;
export const trigger = deepFreeze({
  id: 'the_nest',
  tier: 'minor',
  deck: 'patrol',
  weight: 0.7,
  zoneTypes: ['ambush_lane', 'outlaw_zone', 'radiation_field', 'derelict_field'],
  script: 'selfRegistered',
  fallbackScript: 'pirateRaid',
  pressureCost: 34,
  cooldownS: 1400,
  proximity: true,
  fireWithinWu: 720,
  gates: { maxSecurity: 0.6 },
});

const NEST = (REACH.custom && REACH.custom.nestCarrier) || {};
const TROPHY = (REACH.custom && REACH.custom.trophyWall) || {};
const DOOR_COUNT = Math.max(1, Math.round(Number(NEST.doorCount) || 2));
const NEST_SIZE = Math.max(1, Math.round(Number(NEST.nestSize) || 6));
const LAUNCH_S = Math.max(1, Number(NEST.launchIntervalS) || 5);
const TEAR_WU = Math.max(40, Number(NEST.tearWu) || 120);
const RETURN_HITS = Math.max(1, Math.round(Number(NEST.waspReturnHits) || 3));
const VENT_AT = Math.max(1, Math.round(Number(NEST.ventAtDoorsTorn) || 1));
const BAY_OFFSETS = Object.freeze([{ dx: 0, dz: -24 }, { dx: 0, dz: 24 }]);
export const NEST_BAY_OFFSETS = BAY_OFFSETS;
const DEADLINE_S = 280;
const ESCAPE_WU = 3000;
const COMPACT_BROOD = 'nursery_compact_v1';
const AUTHORED_ID = 'campaign47a:charon:nest:v1';
const AUTHORED_SECTOR = 'sector_charon_expanse';
function authoredIdentity(live) {
  return live?.shapeId === 'the_nest' && live.id === AUTHORED_ID && live.sectorId === AUTHORED_SECTOR;
}
/** Narrow pre-admission sizing for this authored nursery, never a live-body mutation. */
export function applyNestBroodSpawnSpec(spec, live, slot) {
  if (!spec || !bindings.has(live) || !authoredIdentity(live)
    || live.data?.nest?.broodVariant !== COMPACT_BROOD || !/^wasp:[0-5]$/.test(slot || '')) return spec;
  spec.radius = 9;
  spec.data ||= {};
  spec.data.nestBroodVariant = COMPACT_BROOD;
  return spec;
}

// Object bindings are deliberately transient. Save files carry semantic slots, never entity IDs.
const bindings = new WeakMap();
const BAY_OPEN_S = 2;
const integer = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
const finite = (value, limit = 1e7) => Number.isFinite(value) && Math.abs(value) <= limit;
const vector = (v, limit) => v && finite(v.x, limit) && finite(v.z, limit)
  ? { x: v.x, z: v.z } : null;
function heldByPlayer(state, entity) {
  if (!entity) return false;
  const tether = state.player?.tether;
  if (tether?.active === true && tether.targetId === entity.id) return true;
  return Object.values(state.combat?.attachments?.byId || {}).some(a => a && a.state === 'active'
    && a.ownerId === state.playerId && a.targetId === entity.id);
}
function actorSnapshot(e, slot, state) {
  if (!e || state.entities.get(e.id) !== e) return { slot, status: 'missing' };
  return { slot, status: e.alive === false ? 'dead' : 'live', pos: { x: e.pos.x, z: e.pos.z },
    vel: { x: Number(e.vel?.x) || 0, z: Number(e.vel?.z) || 0 },
    rot: Number(e.rot) || 0, angVel: Number(e.angVel) || 0, hull: Math.max(0, Number(e.hull) || 0),
    armorHp: Math.max(0, Number(e.armorHp) || 0), cap: Math.max(0, Number(e.cap) || 0),
    shield: Math.max(0, Number(e.shield) || 0),
    torn: e.data?.torn === true, marked: e.data?.thrownBy === 'player',
    latched: e.data?.latchedBy === 'player', held: heldByPlayer(state, e) };
}
function normalizeActor(raw, slot) {
  if (!raw || raw.slot !== slot || !['live', 'dead', 'missing'].includes(raw.status)) return null;
  if (raw.status === 'missing') return { slot, status: 'missing' };
  const pos = vector(raw.pos), vel = vector(raw.vel, 10000);
  if (!pos || !vel || !finite(raw.rot, 1e6) || !finite(raw.angVel, 10000)
    || ['hull', 'armorHp', 'shield', 'cap'].some(k => !finite(raw[k], 100000) || raw[k] < 0)) return null;
  return { slot, status: raw.status, pos, vel, rot: raw.rot, angVel: raw.angVel, hull: raw.hull,
    armorHp: raw.armorHp, cap: raw.cap,
    shield: raw.shield, torn: raw.torn === true, marked: raw.marked === true, latched: raw.latched === true, held: raw.held === true };
}

/** Strict bounded save boundary; no archetypes, arbitrary data or numeric IDs cross it. */
export function normalizeNestSnapshot(raw) {
  if (!raw || raw.version !== 1 || !integer(raw.remaining, NEST_SIZE)
    || !integer(raw.launched, NEST_SIZE) || raw.remaining + raw.launched !== NEST_SIZE
    || !integer(raw.returnHits, RETURN_HITS) || !integer(raw.tornDoors, DOOR_COUNT)
    || !Array.isArray(raw.doors) || raw.doors.length !== DOOR_COUNT
    || !Array.isArray(raw.wasps) || raw.wasps.length !== raw.launched
    || !Array.isArray(raw.consumedWaspSlots)) return null;
  const broodVariant = raw.broodVariant === undefined ? 'standard' : raw.broodVariant;
  if (!['standard', COMPACT_BROOD].includes(broodVariant)) return null;
  const carrier = normalizeActor(raw.carrier, 'carrier');
  const doors = raw.doors.map((a, i) => normalizeActor(a, `door:${i}`));
  const wasps = raw.wasps.map((a, i) => normalizeActor(a, `wasp:${i}`));
  if (!carrier || doors.some(a => !a) || wasps.some(a => !a)) return null;
  const pendingCarrierOutcome = raw.pendingCarrierOutcome ?? null;
  if (pendingCarrierOutcome !== null && !['carrier_down', 'carrier_gutted'].includes(pendingCarrierOutcome)) return null;
  if ((carrier.status === 'dead') !== (pendingCarrierOutcome !== null)
    || (pendingCarrierOutcome && raw.contactEstablished !== true)) return null;
  for (const key of ['launchIn', 'deadlineIn', 'bayOpenIn']) {
    if (!finite(raw[key], DEADLINE_S) || raw[key] < 0) return null;
  }
  const consumed = [...new Set(raw.consumedWaspSlots)];
  if (consumed.length !== raw.consumedWaspSlots.length || consumed.length !== raw.returnHits
    || consumed.some(i => !integer(i, raw.launched - 1))) return null;
  const pending = raw.guttingPendingSlot == null ? null : raw.guttingPendingSlot;
  if (pending != null && (raw.returnHits !== RETURN_HITS || !consumed.includes(pending) || raw.guttingAttempted === true)) return null;
  const contacts = raw.returnContacts == null ? [] : raw.returnContacts;
  if (!Array.isArray(contacts) || contacts.length > NEST_SIZE
    || new Set(contacts.map(c => c?.slot)).size !== contacts.length
    || contacts.some(c => !c || !integer(c.slot, raw.launched - 1) || consumed.includes(c.slot)
      || !vector(c.pos) || !finite(c.impulse, 1e12) || c.impulse <= 0 || !integer(c.tick, Number.MAX_SAFE_INTEGER))) return null;
  return { version: 1, carrier, doors, wasps, broodVariant, pendingCarrierOutcome, remaining: raw.remaining, launched: raw.launched,
    returnHits: raw.returnHits, tornDoors: raw.tornDoors, vented: raw.vented === true,
    contactEstablished: raw.contactEstablished === true, consumedWaspSlots: consumed,
    guttingPendingSlot: pending, guttingAttempted: raw.guttingAttempted === true,
    returnContacts: contacts.map(c => ({ slot: c.slot, pos: { ...c.pos }, impulse: c.impulse, tick: c.tick })),
    launchIn: raw.launchIn, deadlineIn: raw.deadlineIn, bayOpenIn: raw.bayOpenIn };
}

export function captureNestRuntime(state, live, now) {
  const rec = live?.data?.nest, bound = bindings.get(live);
  if (!rec || !bound) return null;
  const carrier = bound.carrierDeath || actorSnapshot(bound.carrier, 'carrier', state);
  return normalizeNestSnapshot({ version: 1, carrier, broodVariant: rec.broodVariant,
    pendingCarrierOutcome: carrier.status === 'dead' && rec.contactEstablished
      ? (rec.guttingConfirmed ? 'carrier_gutted' : 'carrier_down') : null,
    doors: bound.doors.map((e, i) => bound.deadDoors[i] || actorSnapshot(e, `door:${i}`, state)),
    wasps: bound.wasps.map((e, i) => bound.deadWasps[i] || actorSnapshot(e, `wasp:${i}`, state)),
    remaining: rec.remaining, launched: rec.launched, returnHits: rec.returnHits,
    tornDoors: rec.tornDoors, vented: rec.vented, contactEstablished: rec.contactEstablished,
    consumedWaspSlots: [...rec.consumedWaspSlots],
    guttingPendingSlot: rec.guttingPending == null ? null : rec.guttingPending,
    guttingAttempted: rec.guttingAttempted === true,
    returnContacts: [...rec.returnContacts.values()],
    launchIn: Math.max(0, Math.min(DEADLINE_S, rec.nextLaunchS - now)),
    deadlineIn: Math.max(0, Math.min(DEADLINE_S, live.deadlineAt - now)),
    bayOpenIn: Math.max(0, Math.min(BAY_OPEN_S, rec.bayOpenUntil - now)) });
}

function canonical(state, entity) { return entity && state.entities.get(entity.id) === entity ? entity : null; }
function applySnapshot(entity, saved) {
  if (!entity || !saved) return;
  // Newly materialized transient actors have no proven Line attachment. Do not re-mark a held
  // Wasp on Continue. Adopted generic-save bodies retain their existing owner's weapon state.
  if (saved.marked && !saved.held) entity.data.thrownBy = 'player';
  if (saved.latched) entity.data.latchedBy = 'player';
  if (saved.torn) entity.data.torn = true;
}

/** Called by the director before core admission; factory identity and physical recipe stay authoritative. */
export function applyNestSavedSpawnSpec(spec, raw) {
  const saved = normalizeActor(raw, raw?.slot);
  if (!saved || saved.status !== 'live' || !/^(carrier|door:[01]|wasp:[0-5])$/.test(saved.slot)) return spec;
  spec.pos = { ...saved.pos }; spec.vel = { ...saved.vel };
  spec.rot = saved.rot; spec.angVel = saved.angVel;
  for (const [key, max] of [['hull', 'hullMax'], ['armorHp', 'armorMax'], ['shield', 'shieldMax'], ['cap', 'capMax']]) {
    if (Number.isFinite(spec[max])) spec[key] = Math.min(spec[max], saved[key]);
  }
  return spec;
}

/** Conservative site preflight, not a replacement for native collision admission. */
export function nestSnapshotSpawnSites(raw) {
  const saved = normalizeNestSnapshot(raw);
  if (!saved) return null;
  return [saved.carrier, ...saved.doors, ...saved.wasps].filter(a => a.status === 'live')
    .map(a => ({ pos: { ...a.pos }, radius: a.slot === 'carrier' ? 80 : a.slot.startsWith('door:') ? 16 : 24, slot: a.slot }));
}

/** Generic save owners may already have restored a launched physics actor. Adopt exactly one
 * same-visit semantic occupant, never a recycled numeric ID or an ambiguous duplicate. */
export function nestSnapshotAdoptions(state, raw, encounterId) {
  const saved = normalizeNestSnapshot(raw);
  if (!saved || typeof encounterId !== 'string' || (saved.broodVariant === COMPACT_BROOD && encounterId !== AUTHORED_ID)) return { ok: false, actors: new Map() };
  const actors = new Map();
  for (const row of [saved.carrier, ...saved.doors, ...saved.wasps]) {
    const matches = [...state.entities.values()].filter(e => e?.data?.nestEncounterId === encounterId
      && e.data.nestSlot === row.slot);
    if (matches.length > 1) return { ok: false, actors: new Map() };
    const e = matches[0];
    if (!e) continue;
    const type = row.slot.startsWith('door:') ? 'beacon' : 'ship';
    if (e.type !== type || (row.status === 'live') !== (e.alive !== false)) return { ok: false, actors: new Map() };
    if (row.slot.startsWith('wasp:') && (e.mass !== 16 || e.radius !== (saved.broodVariant === COMPACT_BROOD ? 9 : 12)
      || (e.data.nestBroodVariant ?? 'standard') !== saved.broodVariant)) return { ok: false, actors: new Map() };
    if (row.status === 'live') actors.set(row.slot, e);
  }
  return { ok: true, actors };
}

export function restoredNestActors(state, encounterId, snapshot) {
  const result = nestSnapshotAdoptions(state, snapshot, encounterId);
  return result.ok ? { ok: true, bySlot: result.actors } : { ok: false, reason: 'ambiguous_nest_restore' };
}

function socketPosition(carrier, off) {
  const angle = Number(carrier.rot) || 0, c = Math.cos(angle), s = Math.sin(angle);
  return { x: carrier.pos.x + off.dx * c - off.dz * s,
    z: carrier.pos.z + off.dx * s + off.dz * c };
}

function hangTrophy(d, live, label) {
  // This is a remembered plate receipt. A physical Sker wall/theft is a separate owner.
  const wall = d.state.trophyWall || (d.state.trophyWall = { plates: [] });
  const id = `plate_${live.id}`;
  if (wall.plates.some(p => p.id === id)) return;
  const plate = { id, label, atS: d.now(), sectorId: live.sectorId || null,
    stationId: TROPHY.stationId || 'sker_haven' };
  wall.plates.push(plate);
  d.emit('reach:trophyHung', { plate, t: d.now() });
}

function resolveNest(d, live, outcome) {
  const rec = live.data.nest;
  if (!rec || live.phase === 'done') return;
  if (['carrier_down', 'carrier_gutted', 'nest_emptied'].includes(outcome)) {
    hangTrophy(d, live, `NEST CARRIER — ${outcome === 'nest_emptied' ? 'EMPTIED' : 'GUTTED'}`);
  }
  if (outcome === 'carrier_escapes') {
    const story = d.state.story || (d.state.story = {});
    (story.flags || (story.flags = {})).reach_nest_raids_next_lane = { atS: d.now(), sectorId: live.sectorId || null };
  }
  rec.terminalOutcome = outcome;
  // Keep actual cast membership: the director retires only its own surviving actors.
  d.resolve(live, outcome, { speak: true });
}

/** Settle a normalized rollback/save death through the same runtime consequence owner, without a new cast. */
export function settleRestoredNestDeath(d, live, state, raw) {
  const saved = normalizeNestSnapshot(raw);
  if (!saved?.contactEstablished || saved.carrier.status !== 'dead' || !saved.pendingCarrierOutcome
    || (saved.broodVariant === COMPACT_BROOD && !authoredIdentity(live))
    || !live || live.shapeId !== 'the_nest' || live.phase !== 'conflict'
    || state !== d.state || state.encounterDirector?.live?.[live.id] !== live) return false;
  live.data ||= {};
  if (live.data.nest?.terminalOutcome) return false;
  live.data.nest = { contactEstablished: true, remaining: saved.remaining,
    launched: saved.launched, tornDoors: saved.tornDoors, returnHits: saved.returnHits };
  // The runtime-authored death cause survives rollback; no cast or player is respawned.
  resolveNest(d, live, saved.pendingCarrierOutcome);
  return true;
}

/** Genuine departure is an escape, not a generic director abort or a player defeat. */
export function departNestRuntime(d, live, state) {
  if (settleNestRuntimeForSave(d, live, state)) return true;
  const rec = live?.data?.nest, bound = bindings.get(live), player = d.player();
  if (!rec?.contactEstablished || !bound || live.phase !== 'conflict' || !player || player.alive === false) return false;
  const carrier = canonical(state, bound.carrier);
  if (!carrier) return false;
  resolveNest(d, live, carrier.alive === false ? 'carrier_down' : 'carrier_escapes');
  return true;
}

/** Save must not strand a genuine kill between combat's event and the director's next tick. */
export function settleNestRuntimeForSave(d, live, state) {
  const rec = live?.data?.nest, bound = bindings.get(live);
  if (!rec?.contactEstablished || !bound || live.phase !== 'conflict') return false;
  const carrier = canonical(state, bound.carrier);
  if (bound.carrierDeath || carrier?.alive === false) {
    resolveNest(d, live, rec.guttingConfirmed ? 'carrier_gutted' : 'carrier_down');
    return true;
  }
  if (carrier && rec.remaining === 0 && rec.tornDoors === DOOR_COUNT) {
    resolveNest(d, live, 'nest_emptied');
    return true;
  }
  return false;
}

function rollback(d, live, reason) {
  const bound = bindings.get(live);
  if (typeof d.helpers?.removeEntity === 'function' && bound) {
    for (const entity of [bound.carrier, ...bound.doors, ...bound.wasps]) {
      if (canonical(d.state, entity) && bound.spawned.has(entity)) d.helpers.removeEntity(entity.id, { reason: 'nest_admission_rollback' });
    }
  }
  if (bound) for (const entity of bound.adopted) {
    if (typeof d.releaseNestActor === 'function') d.releaseNestActor(live, entity);
    else { live.ids = live.ids.filter(id => id !== entity.id); delete live.roles[entity.id]; }
  }
  return d.abort(live, reason);
}

function bayOpen(rec, now) { return rec.tornDoors > 0 || now < rec.bayOpenUntil; }
function bayIndexOpen(rec, bound, index, now) {
  return now < rec.bayOpenUntil || bound.doors[index]?.data?.torn === true || bound.deadDoors[index]?.torn === true;
}
function contactHitsOpenFlank(rec, bound, carrier, pos, now) {
  const angle = Number(carrier.rot) || 0, c = Math.cos(angle), s = Math.sin(angle);
  const dx = pos.x - carrier.pos.x, dz = pos.z - carrier.pos.z;
  const x = dx * c + dz * s, z = -dx * s + dz * c;
  // The released Atlas is 51.6 WU long at this actor's scale. Contact must be on
  // the corresponding real hull flank, not merely near a detached plug or marker.
  return Math.abs(x) <= 26.5 && Math.abs(z) <= 32 && Math.abs(z) >= 1
    && (bound.doors[z < 0 ? 0 : 1]?.data?.torn === true || bound.deadDoors[z < 0 ? 0 : 1]?.torn === true)
    && bayIndexOpen(rec, bound, z < 0 ? 0 : 1, now);
}
function publishBayState(rec, bound, now) {
  bound.carrier.data.nestBayOpen = bayOpen(rec, now);
  bound.carrier.data.nestBayOpenUntil = rec.bayOpenUntil;
  let offsets = bound.carrier.data.nestBayOffsets;
  if (!Array.isArray(offsets) || offsets.length !== DOOR_COUNT || Object.isFrozen(offsets)
    || offsets.some(off => !off || Object.isFrozen(off))) {
    offsets = bound.carrier.data.nestBayOffsets = BAY_OFFSETS.map(off => ({ ...off }));
  }
  const angle = Number(bound.carrier.rot) || 0, c = Math.cos(angle), s = Math.sin(angle);
  for (let i = 0; i < DOOR_COUNT; i++) {
    const door = bound.doors[i], torn = door?.data?.torn || bound.deadDoors[i]?.torn;
    if (door && door.alive !== false && !torn) {
      const dx = door.pos.x - bound.carrier.pos.x, dz = door.pos.z - bound.carrier.pos.z;
      offsets[i].dx = dx * c + dz * s; offsets[i].dz = -dx * s + dz * c;
    } else {
      offsets[i].dx = 0; offsets[i].dz = torn ? (i === 0 ? -8.25 : 8.25) : BAY_OFFSETS[i].dz;
    }
  }
  const states = bound.carrier.data.nestBayStates || (bound.carrier.data.nestBayStates = [false, false]);
  for (let i = 0; i < DOOR_COUNT; i++) states[i] = bayIndexOpen(rec, bound, i, now);
  bound.doors.forEach((door, i) => {
    if (!door?.data) return;
    door.data.nestBayOpen = bayIndexOpen(rec, bound, i, now);
    door.data.nestBayOpenUntil = door.data.torn ? 0 : rec.bayOpenUntil;
  });
}

function hitThroughCombat(d, target, playerId, impactorId) {
  // The regular damage owner creates deaths, loot and aftermath. A rejected hit is not a kill.
  const damage = Math.max(1, Number(target.hull) || 0) + Math.max(0, Number(target.shield) || 0)
    + Math.max(0, Number(target.armorHp) || 0) * 100 + 1000;
  d.emit('projectile:hit', { targetId: target.id, ownerId: playerId, damage, damageType: 'kinetic',
    pos: { x: target.pos.x, z: target.pos.z }, penetration: 1,
    origin: { kind: 'nest_return', impactorId } });
}

function creditReturn(d, live, wasp, index) {
  const rec = live.data.nest, bound = bindings.get(live), carrier = canonical(d.state, bound.carrier);
  const contact = rec.returnContacts.get(index);
  if (!contact) return false;
  rec.returnContacts.delete(index); // One actual contact, one attempt, even when damage rejects it.
  const observedDead = bound.deadWasps[index]?.status === 'dead';
  if (!carrier || carrier.alive === false || rec.returnHits >= RETURN_HITS || rec.consumedWaspSlots.has(index)
    || (!observedDead && !canonical(d.state, wasp))) return false;
  if (!observedDead && wasp.alive !== false) {
    rec.returnPending = index;
    hitThroughCombat(d, wasp, d.player()?.id || d.state.playerId, wasp.id);
    rec.returnPending = null;
    if (wasp.alive !== false) return false;
  }
  rec.consumedWaspSlots.add(index);
  rec.returnHits = Math.min(RETURN_HITS, rec.returnHits + 1);
  d.emit('comms:log', { from: 'NEST CARRIER', text: `Coupling breach ${rec.returnHits}/${RETURN_HITS}.`, kind: 'encounter' });
  // entity:killed is synchronous inside the damage router. Never nest another routeDamage
  // invocation in that event: its scratch buffers are intentionally non-reentrant.
  if (rec.returnHits >= RETURN_HITS && !rec.guttingAttempted) rec.guttingPending = index;
  return true;
}

function launchWasps(d, live, count, now, restoreRows = null) {
  const rec = live.data.nest, bound = bindings.get(live), carrier = bound.carrier;
  let admitted = 0;
  for (let i = 0; i < count; i++) {
    const saved = restoreRows && restoreRows[i];
    if (saved && saved.status === 'dead') { bound.wasps.push(null); rec.waspIds.push(null); continue; }
    const slot = bound.wasps.length;
    const spec = { archetype: 'wasp_swarmer', level: 1, role: 'wasp', factionId: 'faction_reach',
      context: 'patrol', pos: saved ? { ...saved.pos } : socketPosition(carrier, { dx: (slot % 3 - 1) * 50, dz: 130 + Math.floor(slot / 3) * 50 }),
      nestSavedActor: saved || null, nestActorSlot: `wasp:${slot}`,
      scanLabel: rec.broodVariant === COMPACT_BROOD ? 'NURSERY WASP — SMALL BROOD / 16t / CLASS I LINE' : 'NEST WASP — 16t / CLASS I + LINE T1' };
    if (!saved && typeof d.canSpawnNestActor === 'function' && !d.canSpawnNestActor(spec.pos, 24)) break;
    const prior = saved && bound.adoptions.get(saved.slot);
    const ids = prior ? [] : d.spawnShips(live, [spec]);
    const e = prior || (ids.length === 1 ? d.state.entities.get(ids[0]) : null);
    if (!e || e.alive === false) break;
    if (prior) { if (typeof d.adoptNestActor !== 'function' || d.adoptNestActor(live, e, 'wasp') === false) break; bound.adopted.add(e); }
    else bound.spawned.add(e);
    const data = e.data || (e.data = {}), ai = data.ai || (data.ai = {});
    data.nestSlot = `wasp:${slot}`; data.nestEncounterId = live.id;
    ai.passive = false;
    const player = d.player();
    if (player) { ai.targetId = player.id; (data.combat || (data.combat = {})).targetId = player.id; }
    applySnapshot(e, saved);
    bound.wasps.push(e); rec.waspIds.push(e.id); admitted++;
  }
  if (!restoreRows) {
    rec.remaining -= admitted; rec.launched += admitted;
    if (admitted) {
      rec.bayOpenUntil = now + BAY_OPEN_S;
      d.emit('nest:waspsLaunched', { encounterId: live.id, count: admitted, vented: rec.vented, t: now });
      d.emit('comms:log', { from: 'NEST CARRIER', text: 'COUPLINGS EXPOSED — two-second return window.', kind: 'encounter' });
    }
  }
  return admitted;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    if (!d.player() || d.player().alive === false) return d.abort(live, 'no_subject');
    const raw = live.data?.nestSnapshot;
    const saved = raw == null ? null : normalizeNestSnapshot(raw);
    if (raw != null && !saved) return d.abort(live, 'invalid_nest_snapshot');
    if (saved?.broodVariant === COMPACT_BROOD && !authoredIdentity(live)) return d.abort(live, 'invalid_nest_brood_owner');
    if (saved && [saved.carrier, ...saved.doors, ...saved.wasps].some(a => a.status === 'missing')) {
      return d.abort(live, 'unresolved_nest_actor');
    }
    const adoption = saved ? nestSnapshotAdoptions(state, saved, live.id) : { ok: true, actors: new Map() };
    if (!adoption.ok) return d.abort(live, 'ambiguous_nest_restore');
    const center = live.plan?.zoneCenter || live.anchor;
    if (!center || !vector(center)) return d.abort(live, 'no_anchor');
    live.data ||= {};
    const bound = { carrier: null, doors: [], wasps: [], deadDoors: [], deadWasps: [],
      adoptions: adoption.actors, adopted: new Set(), spawned: new Set() };
    bindings.set(live, bound);
    const rec = live.data.nest = { broodVariant: saved?.broodVariant ?? (authoredIdentity(live) && live.data.authoredNestVisit === true ? COMPACT_BROOD : 'standard'), carrierId: null, doorIds: [], waspIds: [],
      remaining: saved?.remaining ?? NEST_SIZE, launched: saved?.launched ?? 0,
      nextLaunchS: d.now() + (saved?.launchIn ?? LAUNCH_S), vented: saved?.vented ?? false,
      returnHits: saved?.returnHits ?? 0, tornDoors: saved?.tornDoors ?? 0,
      consumedWaspSlots: new Set(saved?.consumedWaspSlots || []),
      bayOpenUntil: d.now() + (saved?.bayOpenIn || 0), contactEstablished: false,
      guttingAttempted: saved?.guttingAttempted === true,
      guttingPending: saved?.guttingPendingSlot ?? null,
      returnContacts: new Map((saved?.returnContacts || []).map(c => [c.slot, c])) };
    live.deadlineAt = d.now() + (saved?.deadlineIn ?? DEADLINE_S);
    if (saved?.carrier.status === 'dead') return d.abort(live, 'terminal_nest_snapshot');
    const spec = { archetype: 'nest_carrier', level: 1, role: 'squad', factionId: 'faction_reach',
      passive: true, context: 'patrol', pos: saved ? { ...saved.carrier.pos } : { ...center },
      nestSavedActor: saved?.carrier || null, scanLabel: 'REACH NEST CARRIER — WATCH THE COUPLINGS' };
    const priorCarrier = bound.adoptions.get('carrier');
    const ids = priorCarrier ? [] : d.spawnShips(live, [spec]);
    const carrier = priorCarrier || (ids.length === 1 ? state.entities.get(ids[0]) : null);
    if (!carrier || carrier.alive === false) return rollback(d, live, 'no_cast');
    bound.carrier = carrier; rec.carrierId = carrier.id;
    if (priorCarrier) {
      if (typeof d.adoptNestActor !== 'function' || d.adoptNestActor(live, carrier, 'squad') === false) return rollback(d, live, 'adopt_nest_carrier_failed');
      bound.adopted.add(carrier);
    } else bound.spawned.add(carrier);
    const cd = carrier.data || (carrier.data = {}), ai = cd.ai || (cd.ai = {});
    cd.scanLabel = spec.scanLabel; cd.nestCarrier = true; cd.nestEncounterId = live.id; cd.nestSlot = 'carrier';
    ai.passive = true; ai.holdPosition = true;
    applySnapshot(carrier, saved?.carrier);
    for (let i = 0; i < DOOR_COUNT; i++) {
      const row = saved?.doors[i], off = BAY_OFFSETS[i % BAY_OFFSETS.length];
      if (row?.status === 'dead') { bound.doors.push(null); bound.deadDoors[i] = row; rec.doorIds.push(null); continue; }
      const priorDoor = row && bound.adoptions.get(row.slot);
      const door = priorDoor || d.spawnProp(live, { pos: row ? { ...row.pos } : socketPosition(carrier, off),
        nestSavedActor: row || null, nestActorSlot: `door:${i}`,
        radius: 12, mass: 400, scanLabel: `SALVAGED BLAST BAFFLE ${i + 1} — 400t / CLASS III + LINE T1`,
        storyPropKind: 'nest_door', packagedPropFile: 'places/place_aftermath_aft_cargo_module.glb', packagedPropRadius: 12 });
      if (!door || door.alive === false) return rollback(d, live, 'incomplete_nest_doors');
      if (priorDoor) {
        if (typeof d.adoptNestActor !== 'function' || d.adoptNestActor(live, door, 'nest_door') === false) return rollback(d, live, 'adopt_nest_door_failed');
        bound.adopted.add(door);
      } else bound.spawned.add(door);
      door.data ||= {};
      Object.assign(door.data, { bellyDoor: true, socket: { dx: off.dx, dz: off.dz }, carrierId: carrier.id,
        nestEncounterId: live.id, nestSlot: `door:${i}` });
      applySnapshot(door, row);
      bound.doors.push(door); rec.doorIds.push(door.id);
      if (!live.ids.includes(door.id)) live.ids.push(door.id);
      live.roles[door.id] = 'nest_door';
    }
    if (saved) {
      launchWasps(d, live, saved.wasps.length, d.now(), saved.wasps);
      bound.deadWasps = saved.wasps.map(a => a.status === 'dead' ? a : null);
      if (bound.wasps.length !== saved.wasps.length) return rollback(d, live, 'incomplete_nest_restore');
    }
    rec.contactEstablished = true;
    publishBayState(rec, bound, d.now());
    live.phase = 'conflict';
    d.say(live, 'alert', saved ? 'NEST CARRIER: the same baffles and remaining brood. Your damage still shows. Check your Line connection before returning another Wasp.'
      : `NEST CARRIER: six ${rec.broodVariant === COMPACT_BROOD ? 'small nursery Wasps aboard. Class I can catch this 16t brood' : 'Wasps aboard. These 16t Wasps require Class I capacity and live Line T1'}; ram one into an exposed coupling during launch. The 400t blast baffles require Class III capacity and live Line T1. Guns work. The open lane behind you is your way out.`,
    null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const rec = live.data?.nest, bound = bindings.get(live);
    if (!rec || !bound || live.phase === 'done' || !payload) return;
    if (name === 'tetherAttached') {
      const playerId = d.player()?.id || state.playerId;
      if (!playerId || (payload.actorId !== playerId && payload.controllerId !== playerId)) return;
      const door = bound.doors.find(e => e?.id === payload.targetId && canonical(state, e));
      const wasp = bound.wasps.find(e => e?.id === payload.targetId && canonical(state, e));
      if (door?.alive !== false && door) door.data.latchedBy = 'player';
      if (wasp?.alive !== false && wasp) wasp.data.thrownBy = 'player';
    }
    if (name === 'physicsImpact') {
      const carrier = canonical(state, bound.carrier);
      if (!carrier || carrier.alive === false || !(payload.impulse > 0) || !finite(payload.impulse, 1e12)
        || !vector(payload.pos) || !integer(payload.tick, Number.MAX_SAFE_INTEGER)) return;
      const i = bound.wasps.findIndex(e => e && (e.id === payload.aId || e.id === payload.bId) && canonical(state, e));
      const wasp = bound.wasps[i];
      if (i < 0 || wasp.data?.thrownBy !== 'player' || rec.consumedWaspSlots.has(i)) return;
      const hitId = payload.aId === wasp.id ? payload.bId : payload.aId;
      const doorIndex = bound.doors.findIndex(e => e?.id === hitId && canonical(state, e));
      const hit = hitId === carrier.id ? carrier : doorIndex >= 0 ? bound.doors[doorIndex] : null;
      if (!hit) return;
      if (hit === carrier) {
        if (!contactHitsOpenFlank(rec, bound, carrier, payload.pos, d.now())) return;
      } else {
        // An intact cycling assembly is a real impact target, not a pretend opening through
        // its collider. Once torn away it is scrap and the carrier's exposed flank owns returns.
        if (hit.alive === false || hit.data.torn || !bayIndexOpen(rec, bound, doorIndex, d.now())
          || Math.hypot(payload.pos.x - hit.pos.x, payload.pos.z - hit.pos.z) > (Number(hit.radius) || 12) + 12) return;
      }
      const contactReach = (Number(hit.radius) || 30) + (Number(wasp.radius) || 12) + 20;
      if (Math.hypot(wasp.pos.x - hit.pos.x, wasp.pos.z - hit.pos.z) > contactReach) return;
      const a = payload.aId === hit.id ? hit : wasp, b = a === hit ? wasp : hit;
      if ((payload.aGeneration != null && payload.aGeneration !== a.occupantGeneration)
        || (payload.bGeneration != null && payload.bGeneration !== b.occupantGeneration)) return;
      // The physics producer reuses its payload. Copy only bounded receipt fields now.
      if (!rec.returnContacts.has(i)) rec.returnContacts.set(i, { slot: i,
        pos: { x: payload.pos.x, z: payload.pos.z }, impulse: payload.impulse, tick: payload.tick });
    }
    if (name === 'entityGone' || name === 'squadKill') {
      const carrier = canonical(state, bound.carrier);
      if (carrier?.id === payload.id && carrier.alive === false) {
        bound.carrierDeath = actorSnapshot(carrier, 'carrier', state);
        if (rec.guttingInFlight) rec.guttingConfirmed = true;
      }
      const i = bound.wasps.findIndex(e => e?.id === payload.id && canonical(state, e));
      if (i >= 0 && bound.wasps[i].alive === false) {
        bound.deadWasps[i] = actorSnapshot(bound.wasps[i], `wasp:${i}`, state);
      }
      const j = bound.doors.findIndex(e => e?.id === payload.id && canonical(state, e));
      if (j >= 0 && bound.doors[j].alive === false) bound.deadDoors[j] = actorSnapshot(bound.doors[j], `door:${j}`, state);
    }
  },

  tick(d, live, state, now) {
    const rec = live.data?.nest, bound = bindings.get(live);
    if (!rec || !bound || live.phase === 'done') return;
    const player = d.player();
    const carrier = canonical(state, bound.carrier);
    if (bound.carrierDeath) return resolveNest(d, live, rec.guttingConfirmed ? 'carrier_gutted' : 'carrier_down');
    if (!carrier) return d.abort(live, 'unresolved_nest_carrier');
    if (carrier.alive === false) return resolveNest(d, live, rec.guttingConfirmed ? 'carrier_gutted' : 'carrier_down');
    if (!player || player.alive === false) return d.abort(live, 'subject_gone');
    for (const entity of bound.doors) {
      const door = canonical(state, entity);
      if (!door || door.alive === false || door.data.torn || door.data.latchedBy !== 'player') continue;
      const socket = socketPosition(carrier, door.data.socket), dx = door.pos.x - socket.x, dz = door.pos.z - socket.z;
      if (dx * dx + dz * dz >= TEAR_WU * TEAR_WU) {
        door.data.torn = true; door.data.scanLabel = 'TORN BLAST BAFFLE — FLANK EXPOSED'; rec.tornDoors++;
        d.emit('comms:log', { from: 'NEST CARRIER', text: 'BAFFLE TORN — the carrier flank is exposed. The brood is venting.', kind: 'encounter' });
      }
    }
    if (rec.tornDoors >= VENT_AT && rec.remaining > 0) {
      if (!rec.vented || now >= rec.nextLaunchS) {
        rec.vented = true; rec.nextLaunchS = now + LAUNCH_S;
        launchWasps(d, live, rec.remaining, now);
      }
    } else if (rec.remaining > 0 && now >= rec.nextLaunchS) {
      rec.nextLaunchS = now + LAUNCH_S; launchWasps(d, live, 1, now);
    }
    carrier.data.scanLabel = bayOpen(rec, now) ? 'NEST CARRIER — COUPLINGS EXPOSED / RAM A WASP' : 'NEST CARRIER — COUPLINGS GUARDED / WATCH THE LAUNCH';
    publishBayState(rec, bound, now);
    for (let i = 0; i < bound.wasps.length && live.phase !== 'done'; i++) {
      const wasp = canonical(state, bound.wasps[i]);
      if (rec.returnContacts.has(i)) creditReturn(d, live, wasp, i);
      if (wasp?.alive === false) bound.deadWasps[i] = actorSnapshot(wasp, `wasp:${i}`, state);
    }
    if (rec.guttingPending != null && !rec.guttingAttempted) {
      rec.guttingAttempted = true;
      rec.guttingInFlight = true;
      hitThroughCombat(d, carrier, player.id, bound.wasps[rec.guttingPending]?.id ?? null);
      rec.guttingInFlight = false;
      rec.guttingPending = null;
      if (carrier.alive === false) {
        rec.guttingConfirmed = true;
        return resolveNest(d, live, 'carrier_gutted');
      }
    }
    if (live.phase === 'done') return;
    if (rec.remaining <= 0 && rec.tornDoors === DOOR_COUNT) return resolveNest(d, live, 'nest_emptied');
    const dx = carrier.pos.x - player.pos.x, dz = carrier.pos.z - player.pos.z;
    // Elapsed time alone is not a physical escape. Retain deadlineIn only for save compatibility.
    if (dx * dx + dz * dz > ESCAPE_WU * ESCAPE_WU) resolveNest(d, live, 'carrier_escapes');
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'hunt',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
  motive: 'nest_raid',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_reach',
  context: 'patrol',
  title: 'THE NEST',
  primaryLine: 'NEST CARRIER: couplings cycling. Ram a 16t Wasp into an exposed coupling, use guns, or take the clear lane out.',
  squad: {
    archetypes: ['nest_carrier'],
    size: [1, 1],
    doctrine: 'raider',
    formation: 'none',
    passive: true,
  },
  choices: [],
  bark: null,
  telegraph: 'Salvaged blast baffles guard a Reach carrier. Its launch couplings pulse. Six Wasps aboard.',
  deadlineS: DEADLINE_S,
  aftermath: {
    flee: 'The carrier is still alive. You leave its berth behind.',
    kill: 'The carrier is down. Its loss is recorded.',
  },
  receipts: {
    carrier_gutted: 'GUTTED — three returned Wasps breached the launch couplings.',
    carrier_down: 'The Nest Carrier is dead. Your log records the hull.',
    nest_emptied: 'EMPTIED — the last Wasp is out and both blast baffles are torn away.',
    carrier_escapes: 'You broke contact. The surviving carrier remains a Reach threat.',
    subject_gone: 'The nest settles back into the rocks.',
  },
});
