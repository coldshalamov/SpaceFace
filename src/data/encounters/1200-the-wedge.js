// CR-FEED / CR-CHAIN — THE WEDGE. A dead ore hauler spilled its deck load across a refinery feed
// lane: four heavy ore pods sit shoulder to shoulder in the throat, three working haulers idle
// nose-to-tail behind them, and the dead ship's fuel racks drift loose beside the jam. The lane
// opens when every pod is out of the lane — however it leaves: a Massline dragging pods out one by
// one, a hull shoving them, or one fuel rack slammed into the pile (the ordinary lootShards
// explosive blast kicks every loose payload in its radius at once — one throw clears what four
// tows would). Push the pile down the lane and it ploughs the queue; strip the dead hauler instead
// and the queue turns away. Flying on leaves the jam.
//
// Every judgement reads the world: pod positions against the lane, the queue's hulls and stations,
// the fuel racks' own detonation flags, the wreck's salvage pool. Credits and rep go out as
// director intents; the outcome lands in story.depthProgramEncounters so the next jam here knows
// who you were.
import { deepFreeze, defineEncounter } from './catalog.js';
import {
  alive, dist, entityById, priorOutcome, publishSituationNews, settleSituation,
} from '../../systems/crSituationKit.js';

export const encounterOrder = 1200;
export const trigger = deepFreeze({
  id: 'the_wedge',
  tier: 'minor',
  deck: 'civilian',
  weight: 0.9,
  zoneTypes: ['refinery_approach'],
  script: 'selfRegistered',
  pressureCost: 10,
  cooldownS: 1500,
  proximity: true,
  gates: { sectorIds: ['sector_vesta_forge', 'sector_charon_expanse', 'sector_hyperion_cut'] },
});

export const WEDGE = Object.freeze({
  windowS: 300,
  pods: 4,
  podAmount: 80,
  podUnitMass: 0.5,        // 40 mass each: towable, shovable, and inside a fuel rack's blast
  podRadius: 7,
  laneHalfWu: 80,          // a pod this far off the lane axis no longer blocks it
  laneAheadWu: 260,        // ...or this far down-lane past the throat
  queueGapWu: 95,
  queueBackWu: 170,
  rackSideWu: 120,
  rackAmount: 24,
  shovedWu: 25,            // a queued hauler knocked this far off its station was ploughed
  hurtFrac: 0.2,
  blastWindowS: 20,        // the lane opened this soon after a rack cooked off: the blast did it
  pay: 320,
  blastBonus: 80,
  afterStripPay: 160,      // the yard remembers a stripper: half pay next time
});

const LANE_REGION_BACK_WU = WEDGE.queueBackWu + WEDGE.queueGapWu * 2 + 120;

function hullFrac(e) {
  return e && Number(e.hullMax) > 0 ? Math.max(0, Number(e.hull) || 0) / Number(e.hullMax) : 0;
}

function poolLeft(e) {
  const pool = e && e.data && e.data.salvagePool;
  if (!pool || typeof pool !== 'object') return 0;
  let n = 0;
  for (const v of Object.values(pool)) n += Math.max(0, Number(v) || 0);
  return n;
}

/** Lane frame: along = down-lane distance from the throat, across = off-axis distance. */
export function laneFrame(w, pos) {
  const dx = pos.x - w.throat.x, dz = pos.z - w.throat.z;
  return { along: dx * w.lane.x + dz * w.lane.z, across: Math.abs(dx * -w.lane.z + dz * w.lane.x) };
}

export function podBlocksLane(w, pod) {
  if (!alive(pod) || !pod.pos) return false;
  const f = laneFrame(w, pod.pos);
  return f.across < WEDGE.laneHalfWu && f.along < WEDGE.laneAheadWu && f.along > -LANE_REGION_BACK_WU;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');
    const rng = d.stream(live, 'wedge_layout');
    const a = rng() * Math.PI * 2;
    const u = { x: Math.cos(a), z: Math.sin(a) };          // traffic flows +u
    const p = { x: -u.z, z: u.x };
    const throat = { x: center.x, z: center.z };
    const at = (along, across) => ({ x: throat.x + u.x * along + p.x * across, z: throat.z + u.z * along + p.z * across });
    const prior = priorOutcome(state, live.shapeId);

    const hulk = d.spawnWreck(live, {
      pos: at(140, 110), pool: { cmdty_scrap_metal: 4, cmdty_ore_iron: 2 },
      scanLabel: 'DEAD ORE HAULER — SPILLED ITS DECK LOAD', storyPropKind: 'cr_wedge_hulk',
    });
    // Racks spawn before the ore so they carry the lower ids: lootShards reads the first jettisoned
    // pod of an impact pair as the volatile one, and a rack must not hide behind an ore pod
    // (foreign-file request in the PR: check both sides of the pair).
    const rackIds = [];
    for (const side of [1, -1]) {
      const rack = d.spawnCargoPod(live, {
        pos: at(-30 * side, WEDGE.rackSideWu * side), vel: { x: 0, z: 0 },
        commodityId: 'cmdty_fuel_cells', amount: WEDGE.rackAmount,
        ownerName: 'the dead ore hauler', factionId: 'faction_dmc',
      });
      if (!rack) continue;
      rack.data.scanLabel = 'LOOSE FUEL RACK — VOLATILE';
      rack.data.encounterId = live.id;
      rackIds.push(rack.id);
    }

    const podIds = [];
    const step = WEDGE.podRadius * 2;
    for (let i = 0; i < WEDGE.pods; i++) {
      const pod = d.spawnCargoPod(live, {
        pos: at(0, (i - (WEDGE.pods - 1) / 2) * step), vel: { x: 0, z: 0 },
        commodityId: 'cmdty_ore_iron', amount: WEDGE.podAmount, unitMass: WEDGE.podUnitMass, radius: WEDGE.podRadius,
        ownerName: 'the dead ore hauler', factionId: 'faction_dmc',
      });
      if (!pod) continue;
      pod.data.scanLabel = 'SPILLED ORE POD — JAMMING THE THROAT';
      pod.data.encounterId = live.id;
      podIds.push(pod.id);
    }
    const specs = [];
    for (let i = 0; i < 3; i++) {
      specs.push({
        archetype: 'mule_trader', level: 1, role: 'hauler', factionId: 'faction_dmc', team: 2,
        context: 'civilian', passive: true, pos: at(-(WEDGE.queueBackWu + i * WEDGE.queueGapWu), 0),
        scanLabel: `FEED-LANE HAULER ${i + 1} — HOLDING FOR THE JAM`,
      });
    }
    d.spawnShips(live, specs);
    const haulers = d.entsOf(live, 'hauler');
    if (!hulk || podIds.length < WEDGE.pods || !haulers.length) return d.abort(live, 'no_bodies');

    live.data.wedge = {
      hulkId: hulk.id, throat, lane: u, podIds, rackIds,
      haulerIds: haulers.map((h) => h.id),
      haulerStart: Object.fromEntries(haulers.map((h) => [h.id, { x: h.pos.x, z: h.pos.z, hull: hullFrac(h) }])),
      poolAtStart: poolLeft(hulk),
      blastAt: null, latched: false, ploughed: false,
      prior: prior ? prior.outcome : null,
      settled: false,
    };
    live.deadlineAt = d.now() + WEDGE.windowS;
    live.phase = 'jammed';
    live.approach = { signal: 'ore_pile_and_queue', contacts: haulers.length + podIds.length, t: d.now() };
    d.say(live, 'alert', prior && prior.outcome === 'stripped'
      ? 'FEED LANE: Another load spilled in the throat. Last pilot here stripped the dead hull and left us sitting. Move the ore this time, or move on.'
      : 'FEED LANE: Dead hauler dumped its deck load across the throat and we are three deep behind it. Get that ore out of the lane — out the side, not down it. Mind the fuel racks.',
    null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const w = live.data && live.data.wedge;
    if (!w || w.settled) return;
    if (name === 'tetherAttached' && payload && w.podIds.includes(payload.targetId)) w.latched = true;
  },

  tick(d, live, state, now) {
    const w = live.data && live.data.wedge;
    if (!w || w.settled || live.phase === 'done') return;
    const tether = state.player && state.player.tether;
    if (tether && tether.active && w.podIds.includes(tether.targetId)) w.latched = true;
    if (w.blastAt == null && w.rackIds.some((id) => { const r = entityById(state, id); return !!(r && r.data && r.data.volatileDetonated); })) {
      w.blastAt = now;
    }
    for (const id of w.haulerIds) {
      const h = entityById(state, id);
      const s = w.haulerStart[id];
      if (!alive(h) || dist(h.pos, s) >= WEDGE.shovedWu || s.hull - hullFrac(h) >= WEDGE.hurtFrac) w.ploughed = true;
    }
    const blocking = w.podIds.filter((id) => podBlocksLane(w, entityById(state, id))).length;
    if (blocking === 0) return this._settle(d, live, state, w, w.ploughed ? 'cleared_hurt' : 'cleared');
    const hulk = entityById(state, w.hulkId);
    if (w.poolAtStart > 0 && (!alive(hulk) || poolLeft(hulk) <= 0)) return this._settle(d, live, state, w, 'stripped');
    if (now >= live.deadlineAt) return this._settle(d, live, state, w, 'jammed');
  },

  _settle(d, live, state, w, outcome) {
    if (w.settled) return;
    w.settled = true;
    const now = d.now();
    const blasted = w.blastAt != null && now - w.blastAt <= WEDGE.blastWindowS;
    const via = blasted ? 'blast' : (w.latched ? 'line' : 'shove');
    if (outcome === 'cleared' && blasted) outcome = 'blown_clear';
    const pay = w.prior === 'stripped' ? WEDGE.afterStripPay : WEDGE.pay;
    if (outcome === 'cleared') {
      d.grant(pay, 'the_wedge:cleared');
      d.rep('faction_dmc', 3, 'the_wedge_cleared');
    } else if (outcome === 'blown_clear') {
      d.grant(pay + WEDGE.blastBonus, 'the_wedge:blown_clear');
      d.rep('faction_dmc', 3, 'the_wedge_blown_clear');
      publishSituationNews(d, live, 'FEED LANE OPENED THE HARD WAY: a pilot cooked off a loose fuel rack against the spilled ore and blew the whole pile out of the throat. The queue moved within the minute.');
    } else if (outcome === 'cleared_hurt') {
      d.rep('faction_dmc', -2, 'the_wedge_ploughed');
      publishSituationNews(d, live, 'FEED LANE HAULER STOVE IN: the jam was cleared straight into the queue behind it. The yard is billing nobody and forgiving nobody.');
    } else if (outcome === 'stripped') {
      d.rep('faction_dmc', -3, 'the_wedge_stripped');
      publishSituationNews(d, live, 'FEED LANE STAYS SHUT: a passing salvor stripped the dead ore hauler and left the queue sitting behind its spilled load.');
    }
    live.vars = { ...(live.vars || {}), via };
    return settleSituation(d, live, state, outcome, { via, ploughed: w.ploughed, blasted: w.blastAt != null });
  },
});

export default defineEncounter(trigger, {
  shape: { situation: 'salvage', place: trigger.zoneTypes, twist: 'logic', actor: 'faction_dmc' },
  factionId: 'faction_dmc',
  title: 'THE WEDGE',
  primaryLine: 'FEED LANE: Dead hauler dumped its deck load across the throat and we are three deep behind it. Get that ore out of the lane — out the side, not down it. Mind the fuel racks.',
  verbs: ['latch', 'tow', 'shove', 'throw', 'salvage'],
  choices: [
    { id: 'drag', verb: 'latch', text: 'Latch the spilled ore pods and drag them out the side of the lane.' },
    { id: 'blast', verb: 'throw', text: 'Slam a loose fuel rack into the pile and let the blast clear it in one go.' },
    { id: 'strip', verb: 'salvage', text: 'Strip the dead hauler for scrap and leave the pile.' },
    { id: 'pass', verb: 'fly_on', text: 'Fly on and leave the queue sitting.' },
  ],
  civilian: { archetypes: ['mule_trader'], size: [3, 3], factionId: 'faction_dmc', context: 'civilian', team: 2, passive: true },
  bark: null,
  deadlineS: WEDGE.windowS,
  receipts: {
    cleared: 'LANE OPEN — the ore is out of the throat and the queue is moving. The yard pays.',
    blown_clear: 'BLOWN CLEAR — one fuel rack scattered the whole pile. The yard pays, with a bonus for nerve.',
    cleared_hurt: 'OPEN, BUT AT A PRICE — the pile went into the queue on the way out. No pay; the yard remembers.',
    stripped: 'STRIPPED — you took the dead hull\'s scrap and left the lane shut. The queue turns away.',
    jammed: 'The lane stays jammed. The queue gives up and goes the long way round.',
  },
});
