// CR-ANVIL / CR-CHAIN — THE KICK START. A Free Frontier tug with a dead drive is coasting down the
// lane on nothing but momentum — no drag out here, so it will not stop — straight at a Reach picket
// parked downrange to collect it. Off to the side, the tug crew's own berth buoy blinks: the place
// it was trying to reach. The tug is a real body with real mass: latch it and haul it into the
// berth; put your hull on its flank and steer it in; or slam the loose fuel rack it shed into its
// side — the ordinary explosive slam is a radial kick, and a kick is what a dead drive needs. Do
// nothing and the momentum delivers it to the picket, and the tug flies Reach colours afterwards.
import { deepFreeze, defineEncounter } from './catalog.js';
import {
  alive, dist, entityById, priorOutcome, publishSituationNews, settleSituation,
} from '../../systems/crSituationKit.js';

export const encounterOrder = 1202;
export const trigger = deepFreeze({
  id: 'the_kick_start',
  tier: 'minor',
  deck: 'civilian',
  weight: 0.85,
  zoneTypes: ['trade_lane', 'ambush_lane'],
  script: 'selfRegistered',
  pressureCost: 12,
  cooldownS: 1500,
  proximity: true,
  gates: { sectorIds: ['sector_tethys_junction', 'sector_ceres_belt', 'sector_pallas_drift', 'sector_charon_expanse'] },
});

export const KICK = Object.freeze({
  windowS: 150,
  driftSpeed: 8,           // WU/s of coast the dead drive left it
  picketAlongWu: 420,
  claimGapWu: 30,          // hull gap at which the picket's grapples take it
  berthAlongWu: 140,
  berthAcrossWu: 240,
  berthWu: 90,
  divertedAcrossWu: 160,   // past the picket this far off its line: it coasts free
  rackAcrossWu: -60,
  rackAmount: 24,
  pay: 340,
  divertedPay: 180,
});

/** Along/across the tug's original drift line from its start point. */
export function driftFrame(k, pos) {
  const dx = pos.x - k.start.x, dz = pos.z - k.start.z;
  return { along: dx * k.dir.x + dz * k.dir.z, across: dx * -k.dir.z + dz * k.dir.x };
}

const gap = (a, b) => dist(a.pos, b.pos) - (Number(a.radius) || 0) - (Number(b.radius) || 0);

export const runtime = Object.freeze({
  fire(d, live, state) {
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');
    const rng = d.stream(live, 'kick_layout');
    const a = rng() * Math.PI * 2;
    const u = { x: Math.cos(a), z: Math.sin(a) };
    const p = { x: -u.z, z: u.x };
    const start = { x: center.x, z: center.z };
    const at = (along, across) => ({ x: start.x + u.x * along + p.x * across, z: start.z + u.z * along + p.z * across });
    const prior = priorOutcome(state, live.shapeId);

    // The rack spawns first so an impact pair names it before any other jettisoned pod (lootShards
    // reads the first pod of the pair as the volatile one).
    const rack = d.spawnCargoPod(live, {
      pos: at(-10, KICK.rackAcrossWu), vel: { x: u.x * KICK.driftSpeed, z: u.z * KICK.driftSpeed },
      commodityId: 'cmdty_fuel_cells', amount: KICK.rackAmount, ownerName: 'the dead-drive tug', factionId: 'faction_free',
    });
    if (rack) { rack.data.scanLabel = 'SHED FUEL RACK — VOLATILE'; rack.data.encounterId = live.id; }
    const berth = d.spawnProp(live, {
      pos: at(KICK.berthAlongWu, KICK.berthAcrossWu), radius: 10,
      scanLabel: 'FREE FRONTIER BERTH BUOY — THE TUG\'S DESTINATION', storyPropKind: 'cr_kick_start_berth', tetherable: false,
    });
    d.spawnShips(live, [
      { archetype: 'mule_trader', level: 1, role: 'tug', factionId: 'faction_free', team: 2, context: 'civilian', passive: true,
        pos: at(0, 0), hullFrac: 0.6, scanLabel: 'DEAD-DRIVE TUG — COASTING, CREW ABOARD' },
      { archetype: 'wasp_swarmer', level: 1, role: 'picket', factionId: 'faction_reach', team: 1, passive: true,
        pos: at(KICK.picketAlongWu, 0), scanLabel: 'REACH PICKET — WAITING FOR THE TUG' },
    ]);
    const tug = d.entsOf(live, 'tug')[0];
    const picket = d.entsOf(live, 'picket')[0];
    if (!tug || !picket || !berth) return d.abort(live, 'no_bodies');
    tug.vel = { x: u.x * KICK.driftSpeed, z: u.z * KICK.driftSpeed };
    tug.data = tug.data || {};
    tug.data.driveDead = true;
    if (tug.data.ai) tug.data.ai.allowPassiveManeuver = false;
    if (picket.data && picket.data.ai) picket.data.ai.allowPassiveManeuver = false;

    live.data.kick = {
      tugId: tug.id, picketId: picket.id, berthId: berth.id, rackId: rack ? rack.id : null,
      start, dir: u, latched: false, blastAt: null,
      prior: prior ? prior.outcome : null, settled: false,
    };
    live.deadlineAt = d.now() + KICK.windowS;
    live.phase = 'coasting';
    live.approach = { signal: 'dead_tug_coasting', contacts: 2, t: d.now() };
    d.say(live, 'alert', prior && prior.outcome === 'claimed'
      ? 'DEAD TUG: Drive is gone and we are coasting at the Reach — again. Last time nobody stopped. Anything with mass will turn us. Anything.'
      : 'DEAD TUG: Drive is gone, we are coasting, and there is a Reach picket at the end of the line. Our berth is off the port side. Push us, pull us, kick us — just turn us.',
    null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const k = live.data && live.data.kick;
    if (k && !k.settled && name === 'tetherAttached' && payload && payload.targetId === k.tugId) k.latched = true;
  },

  tick(d, live, state, now) {
    const k = live.data && live.data.kick;
    if (!k || k.settled || live.phase === 'done') return;
    const tether = state.player && state.player.tether;
    if (tether && tether.active && tether.targetId === k.tugId) k.latched = true;
    const rack = entityById(state, k.rackId);
    if (k.blastAt == null && rack && rack.data && rack.data.volatileDetonated) k.blastAt = now;
    const tug = entityById(state, k.tugId);
    if (!alive(tug)) return this._settle(d, live, state, k, 'lost');
    const berth = entityById(state, k.berthId);
    if (berth && dist(tug.pos, berth.pos) <= KICK.berthWu) return this._settle(d, live, state, k, 'berthed');
    const picket = entityById(state, k.picketId);
    if (alive(picket) && gap(tug, picket) <= KICK.claimGapWu) return this._settle(d, live, state, k, 'claimed');
    const f = driftFrame(k, tug.pos);
    const off = Math.abs(f.across) >= KICK.divertedAcrossWu;
    if (off && f.along >= KICK.picketAlongWu) return this._settle(d, live, state, k, 'diverted');
    if (now >= live.deadlineAt) return this._settle(d, live, state, k, off || !alive(picket) ? 'diverted' : 'claimed');
  },

  _settle(d, live, state, k, outcome) {
    if (k.settled) return;
    k.settled = true;
    const via = k.blastAt != null ? 'blast' : (k.latched ? 'line' : 'hull');
    const tug = entityById(state, k.tugId);
    if (outcome === 'berthed') {
      d.grant(KICK.pay, 'the_kick_start:berthed');
      d.rep('faction_free', 4, 'the_kick_start_berthed');
      if (via === 'blast') publishSituationNews(d, live, 'DEAD TUG BLOWN HOME: a pilot cooked off the tug\'s own fuel rack against its flank and kicked it into the berth. The crew is still deaf and still grateful.');
    } else if (outcome === 'diverted') {
      d.grant(KICK.divertedPay, 'the_kick_start:diverted');
      d.rep('faction_free', 2, 'the_kick_start_diverted');
      d.rep('faction_reach', -1, 'the_kick_start_diverted');
    } else if (outcome === 'claimed') {
      if (alive(tug)) {
        tug.factionId = 'faction_reach';
        tug.data = tug.data || {};
        tug.data.scanLabel = 'PRIZE TUG — UNDER REACH GRAPPLES';
      }
      d.rep('faction_free', -1, 'the_kick_start_claimed');
      publishSituationNews(d, live, 'DEAD TUG TAKEN AS PRIZE: a Free Frontier tug coasted into a Reach picket with its drive out. Traffic watched it go.');
    }
    live.vars = { ...(live.vars || {}), via };
    const f = tug && tug.pos ? driftFrame(k, tug.pos) : { along: 0, across: 0 };
    return settleSituation(d, live, state, outcome, { via, along: Math.round(f.along), across: Math.round(f.across) });
  },
});

export default defineEncounter(trigger, {
  shape: { situation: 'distress', place: trigger.zoneTypes, twist: 'logic', actor: 'faction_free' },
  factionId: 'faction_free',
  title: 'THE KICK START',
  primaryLine: 'DEAD TUG: Drive is gone, we are coasting, and there is a Reach picket at the end of the line. Our berth is off the port side. Push us, pull us, kick us — just turn us.',
  verbs: ['latch', 'tow', 'shove', 'throw'],
  choices: [
    { id: 'tow', verb: 'latch', text: 'Latch the tug and haul it into its berth.' },
    { id: 'shove', verb: 'shove', text: 'Put your hull on its flank and steer it in.' },
    { id: 'kick', verb: 'throw', text: 'Slam its shed fuel rack into its side and let the blast turn it.' },
    { id: 'pass', verb: 'fly_on', text: 'Fly on; the momentum delivers it to the picket.' },
  ],
  bark: null,
  deadlineS: KICK.windowS,
  receipts: {
    berthed: 'BERTHED — the tug is home. The crew pays.',
    diverted: 'TURNED — the tug coasts clear of the picket. Not home, but not taken. The crew pays what it can.',
    claimed: 'CLAIMED — the tug coasted into the picket\'s grapples. It flies Reach colours now.',
    lost: 'The tug broke up before anyone turned it.',
  },
});
