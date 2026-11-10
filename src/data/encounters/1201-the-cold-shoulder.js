// CR-CHAIN — THE COLD SHOULDER. A Free Frontier ice hauler sits dead in the fog with two raiders
// clamped to its flanks, hull to hull, cutting their way aboard. The hauler's own cargo — sealed
// cryogenic ice pods — drifts in the gap where it vented them trying to shake the boarders. Three
// physical answers: shoot the boarders off; shove them off the hull with your own; or sling an ice
// pod into a boarder — the ordinary lootShards cryo flash freezes its helm (status_cryo_lock) and a
// frozen hull cannot hold a clamp, so the hauler's crew kicks it loose. Fly on and the boarders
// finish the job: the hauler leaves under a Reach flag. The boarding clock is the raiders' own
// contact: it only runs while a live, unfrozen raider sits on the hull.
import { deepFreeze, defineEncounter } from './catalog.js';
import {
  alive, dist, entityById, priorOutcome, publishSituationNews, settleSituation,
} from '../../systems/crSituationKit.js';

export const encounterOrder = 1201;
export const trigger = deepFreeze({
  id: 'the_cold_shoulder',
  tier: 'minor',
  deck: 'combat',
  weight: 0.8,
  zoneTypes: ['nebula_fog', 'mining_belt'],
  script: 'selfRegistered',
  pressureCost: 18,
  cooldownS: 1500,
  proximity: true,
  gates: { sectorIds: ['sector_veil_nebula', 'sector_charon_expanse'] },
});

export const COLD = Object.freeze({
  windowS: 150,
  boardS: 75,              // unfrozen raider-seconds on the hull before the hauler is taken
  clampGapWu: 14,          // hull-to-hull gap under which a raider is clamped on
  spawnGapWu: 2,
  pods: 3,
  podAmount: 30,
  podRingWu: 120,
  pay: 360,
  icedBonus: 90,
  kickSpeed: 24,           // WU/s the crew puts into a frozen boarder's hull
});

/** A frozen clamp lets go: the hauler's crew kicks the boarder off through the published impulse
 * authority, once. Momentum, not a teleport — the boarder drifts off on its own mass. */
function crewKick(d, state, hauler, raider) {
  const physics = d.helpers && d.helpers.combatPhysics;
  if (!physics || typeof physics.applyImpulse !== 'function') return false;
  const dx = raider.pos.x - hauler.pos.x, dz = raider.pos.z - hauler.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const mag = (Number(raider.mass) || 30) * COLD.kickSpeed;
  return physics.applyImpulse({
    entityId: raider.id, impulse: { x: (dx / len) * mag, z: (dz / len) * mag },
    point: null, reason: 'cr_cold_shoulder_crew_kick', tick: state.tick,
  }) !== false;
}

export function hullGap(a, b) {
  return dist(a.pos, b.pos) - (Number(a.radius) || 0) - (Number(b.radius) || 0);
}

function boarders(d, state, c) {
  const hauler = entityById(state, c.haulerId);
  let clamped = 0, frozen = 0, live = 0;
  for (const id of c.raiderIds) {
    const r = entityById(state, id);
    if (!alive(r)) continue;
    live++;
    const chilled = !!(r.flags && r.flags.cryoChilled);
    if (chilled) c.chilledIds[id] = true;
    if (hauler && hullGap(hauler, r) <= COLD.clampGapWu) {
      if (chilled && !c.kickedIds[id] && crewKick(d, state, hauler, r)) c.kickedIds[id] = true;
      if (chilled) frozen++;
      else clamped++;
    }
  }
  return { clamped, frozen, live };
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');
    const rng = d.stream(live, 'cold_layout');
    const a = rng() * Math.PI * 2;
    const p = { x: -Math.sin(a), z: Math.cos(a) };
    const prior = priorOutcome(state, live.shapeId);

    const podIds = [];
    for (let i = 0; i < COLD.pods; i++) {
      const t = a + Math.PI * (0.35 + 0.3 * i);
      const pod = d.spawnCargoPod(live, {
        pos: { x: center.x + Math.cos(t) * COLD.podRingWu, z: center.z + Math.sin(t) * COLD.podRingWu },
        vel: { x: 0, z: 0 }, commodityId: 'cmdty_ice_water', amount: COLD.podAmount,
        ownerName: 'the boarded ice hauler', factionId: 'faction_free',
      });
      if (!pod) continue;
      pod.data.scanLabel = 'VENTED ICE POD — CRYOGENIC';
      pod.data.encounterId = live.id;
      podIds.push(pod.id);
    }
    d.spawnShips(live, [
      { archetype: 'mule_trader', level: 1, role: 'hauler', factionId: 'faction_free', team: 2, context: 'civilian', passive: true,
        pos: { x: center.x, z: center.z }, scanLabel: 'ICE HAULER — BOARDERS ON BOTH FLANKS' },
    ]);
    const haulerFirst = d.entsOf(live, 'hauler')[0];
    if (haulerFirst) {
      const boarder = (side) => ({ archetype: 'wasp_swarmer', level: 1, role: 'boarder', factionId: 'faction_reach', team: 1, passive: true,
        pos: { x: center.x + p.x * side, z: center.z + p.z * side }, scanLabel: 'REACH BOARDER — CLAMPED ON' });
      d.spawnShips(live, [boarder(1), boarder(-1)]);
      for (const r of d.entsOf(live, 'boarder')) {
        const side = Math.sign((r.pos.x - center.x) * p.x + (r.pos.z - center.z) * p.z) || 1;
        const off = (Number(haulerFirst.radius) || 0) + (Number(r.radius) || 0) + COLD.spawnGapWu;
        r.pos.x = center.x + p.x * side * off;
        r.pos.z = center.z + p.z * side * off;
      }
    }
    const hauler = d.entsOf(live, 'hauler')[0];
    const raiders = d.entsOf(live, 'boarder');
    if (!hauler || !raiders.length || podIds.length < 1) return d.abort(live, 'no_bodies');

    live.data.cold = {
      haulerId: hauler.id, raiderIds: raiders.map((r) => r.id), podIds,
      boardedS: 0, chilledIds: {}, kickedIds: {}, lastT: d.now(),
      prior: prior ? prior.outcome : null, settled: false,
    };
    live.deadlineAt = d.now() + COLD.windowS;
    live.phase = 'boarding';
    live.approach = { signal: 'boarders_on_hull', contacts: raiders.length + 1, t: d.now() };
    d.say(live, 'alert', prior && prior.outcome === 'taken'
      ? 'ICE HAULER: Boarders again — the last crew that called this lane got taken while a pilot watched. They freeze, these clamps. Anything cold will do.'
      : 'ICE HAULER: Two clamped on and cutting. We vented the ice to shake them — it did not. Get them off the hull, any way you can.',
    null, { primary: true, literal: true });
  },

  tick(d, live, state, now) {
    const c = live.data && live.data.cold;
    if (!c || c.settled || live.phase === 'done') return;
    const dt = Math.max(0, now - c.lastT);
    c.lastT = now;
    const hauler = entityById(state, c.haulerId);
    if (!alive(hauler)) return this._settle(d, live, state, c, 'hauler_lost');
    const b = boarders(d, state, c);
    c.boardedS += dt * b.clamped;
    if (c.boardedS >= COLD.boardS) return this._settle(d, live, state, c, 'taken');
    if (b.clamped === 0 && b.frozen === 0) {
      return this._settle(d, live, state, c, Object.keys(c.chilledIds).length ? 'iced' : 'driven_off');
    }
    if (now >= live.deadlineAt) return this._settle(d, live, state, c, 'taken');
  },

  _settle(d, live, state, c, outcome) {
    if (c.settled) return;
    c.settled = true;
    const hauler = entityById(state, c.haulerId);
    const iced = Object.keys(c.chilledIds).length;
    if (outcome === 'iced') {
      d.grant(COLD.pay + COLD.icedBonus, 'the_cold_shoulder:iced');
      d.rep('faction_free', 4, 'the_cold_shoulder_iced');
      d.rep('faction_reach', -2, 'the_cold_shoulder_iced');
      publishSituationNews(d, live, 'BOARDERS FROZEN OFF AN ICE HAULER: a passing pilot slung the hauler\'s own vented ice into the clamps. The Reach crews are calling it a cheap trick and staying out of the fog.');
    } else if (outcome === 'driven_off') {
      d.grant(COLD.pay, 'the_cold_shoulder:driven_off');
      d.rep('faction_free', 3, 'the_cold_shoulder_driven_off');
      d.rep('faction_reach', -2, 'the_cold_shoulder_driven_off');
    } else if (outcome === 'taken') {
      if (alive(hauler)) {
        hauler.factionId = 'faction_reach';           // the hull leaves under a new flag
        hauler.data = hauler.data || {};
        hauler.data.scanLabel = 'ICE HAULER — UNDER A REACH FLAG NOW';
      }
      publishSituationNews(d, live, 'ICE HAULER TAKEN IN THE FOG: Reach boarders cut through while traffic flew past. The hull is flying their colours now.');
    } else if (outcome === 'hauler_lost') {
      d.rep('faction_free', -2, 'the_cold_shoulder_hauler_lost');
    }
    return settleSituation(d, live, state, outcome, { iced, boardedS: Math.round(c.boardedS) });
  },
});

export default defineEncounter(trigger, {
  shape: { situation: 'ambush', place: trigger.zoneTypes, twist: 'logic', actor: 'faction_reach' },
  factionId: 'faction_reach',
  title: 'THE COLD SHOULDER',
  primaryLine: 'ICE HAULER: Two clamped on and cutting. We vented the ice to shake them — it did not. Get them off the hull, any way you can.',
  verbs: ['throw', 'latch', 'shove', 'shoot'],
  choices: [
    { id: 'ice', verb: 'throw', text: 'Sling a vented ice pod into a boarder and freeze its clamp loose.' },
    { id: 'shove', verb: 'shove', text: 'Put your hull into a boarder and push it off.' },
    { id: 'shoot', verb: 'shoot', text: 'Shoot the boarders off the hull.' },
    { id: 'pass', verb: 'fly_on', text: 'Fly on.' },
  ],
  bark: null,
  deadlineS: COLD.windowS,
  receipts: {
    iced: 'FROZEN OFF — the hauler\'s own ice broke the clamps. The crew pays, and remembers the trick.',
    driven_off: 'DRIVEN OFF — the boarders are off the hull. The crew pays.',
    taken: 'TAKEN — the boarders cut through. The hauler flies a Reach flag now.',
    hauler_lost: 'The hauler broke up with the boarders still on it. Nobody pays.',
  },
});
