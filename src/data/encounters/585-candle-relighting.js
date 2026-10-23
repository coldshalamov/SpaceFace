// 585 — The Candle Relighting. The Fleet's tender column walks the relight run out to the
// Candle Fleet memorial: twenty-four lamps for the Pit convoy, one plinth that stays dark.
// Guaranteed once in the starter sector's first day so the first hour contains one thing that
// is not a lesson or a fight — a shift already under way, going somewhere, that a curious
// pilot can follow. Following is the whole reward: the walk ends at the memorial the landmark
// quest wants scanned, and nobody shoots at anybody.
//
// Self-registered runtime (the raid's shape): the module owns the cast, the walk, and the
// witness beat. Locomotion copies the lived-vignette intent writes — passive hulls opt into
// the shared tactical navigation, so the column clears the starter field instead of grinding
// through it.
import { deepFreeze, defineEncounter } from './catalog.js';
import { sectorGlobalOrigin } from '../../data/sectorCoordinates.js';
import { modelTruthPlanarRadius } from '../../data/modelTruth.js';

export const encounterOrder = 585;

// The authored day-0 promise: land after the opening raid's window (60–170 s) and around the
// onboarding rail's closing choice, before the first dock usually settles the evening. The
// window's floor also sits above every organic tier ceiling (~530 s) and above the other
// pinned windows ([60,170] raid, [180,420] salvage tail), so the ≥45 s spacing pass can
// always clear neighbors — two pinned windows must never overlap-adjacent within a sector-day.
const EARLY_WINDOW_S = deepFreeze([540, 810]);
const WALK_DEADLINE_S = 300;
const ARRIVAL_RANGE_WU = 36; // two native HOLD arrival radii, maintained working vicinity
const SETTLED_SPEED_WU_S = 4; // native HOLD brake threshold, not perfectly stationary
const SERVICE_SECONDS = 8;
const ORIGINAL_CAST = new WeakMap(); // transient identity only; live encounters are not saved
const MEMORIAL_RADIUS_WU = 100; // sectorAnchors.js: the existing Candle Fleet body

function hullRadius(entity) {
  // Include the measured adopted skin as well as the gameplay radius; specialist hulls
  // need not fit inside their archetype's small legacy collision circle.
  return Math.max(1, Number(entity?.radius) || 0, modelTruthPlanarRadius(entity));
}

function workMarks(ids, state, memorial, direction) {
  const radius = Math.max(...ids.map((id) => hullRadius(state.entities.get(id))));
  const setback = MEMORIAL_RADIUS_WU + radius + ARRIVAL_RANGE_WU + 40;
  const spacing = 2 * (radius + ARRIVAL_RANGE_WU) + 40;
  const slots = [0, -1, 1, -2, 2];
  // A near-side apron, not a ring through the memorial: the incoming column fans out
  // before the body. The outer lamps never have to cross the dark plinth to find a mark.
  return ids.map((id, index) => ({
    id,
    x: memorial.x - direction.x * setback - direction.z * slots[index] * spacing,
    z: memorial.z - direction.z * setback + direction.x * slots[index] * spacing,
  }));
}

function approachMark(entity, mark) {
  if (!entity?.pos) return;
  const data = entity.data || (entity.data = {});
  const ai = data.ai || (data.ai = {});
  ai.passive = true;
  ai.allowPassiveManeuver = true;
  ai.roe = 'hold_fire';
  ai.activity = {
    kind: 'hail_hold', reason: 'encounter:candle_relighting',
    anchor: { x: mark.x, z: mark.z }, anchorVelocity: { x: 0, z: 0 },
    targetId: null, preferredRange: 0,
  };
  const intent = data.intent || (data.intent = {});
  intent.tx = mark.x; intent.tz = mark.z; intent.fire = false;
}

function settle(d, live, state, outcome) {
  if (live.data.relightingResolved) return;
  live.data.relightingResolved = true;
  // The director schedules cleanup by numeric ids. Remove recycled identities from this
  // encounter's list before handing it back, so no replacement receives a despawn order.
  const originals = ORIGINAL_CAST.get(live) || [];
  for (const id of [...(live.ids || [])]) {
    if (originals.includes(state.entities.get(id))) continue;
    // Retire only this encounter's stale membership through its existing owner. The
    // normal entity:destroyed listener owns active-budget cleanup; do not forge that event.
    d._noteLiveGone(state.encounterDirector, live, id, {});
  }
  // The director already saves its bounded receipt list. No new story ledger, reward,
  // relit-candle counter, or restoration promise for the transient cast.
  return d.resolve(live, outcome, { speak: true });
}
const WITNESS_RANGE_WU = 420;

// The memorial's authored sector-local anchor (sectorAnchors.js); Helios is the one sector
// whose origin is (0, 0), and this module is Helios-gated, but convert through the real
// boundary anyway so the bearing math cannot silently depend on that coincidence.
function memorialPos() {
  const origin = sectorGlobalOrigin('sector_helios_prime');
  return { x: origin.x + 1680, z: origin.z - 820 };
}

function bearingFrom(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1) return { x: 1, z: 0 };
  return { x: dx / distance, z: dz / distance };
}

const CAST = deepFreeze([
  { id: 'lead', archetype: 'pallet_jack', scanLabel: 'FLEET TENDER LEAD', offset: 240 },
  { id: 'lamp_1', archetype: 'mothlight', scanLabel: 'FLEET LAMP 1', offset: 180 },
  { id: 'lamp_2', archetype: 'mothlight', scanLabel: 'FLEET LAMP 2', offset: 120 },
  { id: 'lamp_3', archetype: 'mothlight', scanLabel: 'FLEET LAMP 3', offset: 60 },
  { id: 'lamp_4', archetype: 'mothlight', scanLabel: 'FLEET LAMP 4', offset: 0 },
]);

export const runtime = Object.freeze({
  fire(d, live, state) {
    const memorial = memorialPos();
    const anchor = live.anchor || { x: 0, z: 0 };
    // The column forms up behind the player's frame and walks outward past it — you see a
    // line of lamps overtake you on the Fleet bearing, and following is your choice.
    const dir = bearingFrom(anchor, memorial);
    const start = { x: anchor.x - dir.x * 220, z: anchor.z - dir.z * 220 };
    live.deadlineAt = d.now() + WALK_DEADLINE_S;
    live.plan = live.plan || {};
    live.plan.ships = CAST.map((member) => ({
      archetype: member.archetype,
      level: 2,
      pos: { x: start.x + dir.x * member.offset, z: start.z + dir.z * member.offset },
      factionId: 'faction_scn',
      context: 'convoy_civilian',
      role: member.id,
      passive: true,
      team: 2,
      scanLabel: member.scanLabel,
    }));
    const ids = d.spawnShips(live, live.plan.ships) || [];
    if (ids.length < CAST.length) return d.abort(live, 'spawn_failed');
    ORIGINAL_CAST.set(live, ids.map(id => state.entities.get(id)));
    live.data.leadId = ids[0];
    live.data.memorial = memorial;
    live.data.workMarks = workMarks(ids, state, memorial, dir);
    live.phase = 'walk';
    for (const mark of live.data.workMarks) approachMark(state.entities.get(mark.id), mark);
    // The one primary line (one-voice law): who they are, where they are going, why follow.
    d.say(live, 'info',
      'FLEET TENDERS: Relight run. We keep twenty-four lamps for the convoy; the last plinth stays dark. Walk with us.',
      null, { literal: true, primary: true });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done' || live.data.relightingResolved) return;
    const marks = live.data.workMarks;
    // Older in-memory records never imply that an unobserved shift finished. Saves omit
    // live encounters entirely; do not counterfeit a replacement column here.
    if (!Array.isArray(marks) || marks.length !== CAST.length) return settle(d, live, state, 'interrupted');
    const original = ORIGINAL_CAST.get(live);
    if (!original) return settle(d, live, state, 'interrupted');
    let present = 0;
    let settled = 0;
    for (const [index, mark] of marks.entries()) {
      const ship = state.entities.get(mark.id);
      if (!ship || ship !== original[index] || ship.alive === false || !(ship.hull > 0) || !ship.pos) continue;
      present++;
      approachMark(ship, mark);
      const speed = Math.hypot(ship.vel?.x ?? Infinity, ship.vel?.z ?? Infinity);
      if (Math.hypot(ship.pos.x - mark.x, ship.pos.z - mark.z) <= ARRIVAL_RANGE_WU
        && speed <= SETTLED_SPEED_WU_S) settled++;
    }
    if (present < CAST.length) return settle(d, live, state, present ? 'interrupted' : 'lost');
    if (settled === CAST.length) {
      if (!Number.isFinite(live.data.serviceStartedAt)) live.data.serviceStartedAt = now;
      live.phase = 'service';
      if (now - live.data.serviceStartedAt >= SERVICE_SECONDS
        && live.data.serviceStartedAt + SERVICE_SECONDS <= live.deadlineAt) {
        const memorial = live.data.memorial;
        const player = d.player && d.player();
        const witnessed = player?.pos && Math.hypot(player.pos.x - memorial.x,
          player.pos.z - memorial.z) <= WITNESS_RANGE_WU;
        return settle(d, live, state, witnessed ? 'witnessed' : 'relit');
      }
    } else {
      delete live.data.serviceStartedAt;
      live.phase = 'walk';
    }
    if (now >= live.deadlineAt) return settle(d, live, state, settled ? 'partial' : 'walked_on');
  },
});

export const trigger = deepFreeze({
  id: 'candle_relighting',
  tier: 'ambient',
  deck: 'civilian',
  weight: 1.0,
  zoneTypes: ['trade_lane', 'civilian_core', 'patrol_corridor'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 6,
  cooldownS: 1500,
  proximity: true,
  earlyWindowGuaranteeDay: 0,
  earlyDelayS: EARLY_WINDOW_S,
  fireWithinWu: 320,
  gates: {
    sectorIds: ['sector_helios_prime'],
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'wake',
    place: 'trade_lane',
    twist: 'follow_on',
    actor: 'faction_scn',
  },
  title: 'THE CANDLE RELIGHTING',
  factionId: 'faction_scn',
  motive: 'memorial_shift',
  engagementTrigger: 'hailed',
  noCombat: true,
  receipts: {
    witnessed: 'FLEET TENDERS: Twenty-four tended. The last plinth stays dark. Bring a scanner close and it answers.',
    relit: 'FLEET TENDERS: The column completed its watch at the Fleet. The last plinth stays dark.',
    partial: 'FLEET TENDERS: Some lamps reached their marks. The watch is unfinished; we cannot call it lit.',
    walked_on: 'FLEET TENDERS: Still short of the Fleet. The relight watch is delayed, not finished.',
    interrupted: 'FLEET TENDERS: A tender is missing. Break off the relight watch; we are not all here.',
    lost: 'FLEET TENDERS: The column is gone. No completed relight watch was recorded.',
  },
  primaryLine: 'FLEET TENDERS: Relight run. We keep twenty-four lamps for the convoy; the last plinth stays dark. Walk with us.',
});
