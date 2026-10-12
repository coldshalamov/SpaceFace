// CR-CHAIN (law × cargo × body) — THE DECLARATION. A Quiet runner blew a coupling on the Tethys
// approach and its deck of stolen goods is coasting — three pods, no drag, a slow line — straight
// into the scan cone of a Concord customs cutter parked across the lane. The cutter is the real
// law owner's scanner (lawSecurity: cone, dwell, hull occlusion, contraband:scanned); this
// encounter only reads what it decides. Haul or shove the pods back to the runner and the Quiet
// pay; push them into the cone and Concord takes them (and, on your line, books you for it); or
// park your own hull between the cutter and the pods — a hull blocks a scanner's sight, yours
// included — and walk them home in your shadow. Fly on and customs reads every one.
import { deepFreeze, defineEncounter } from './catalog.js';
import {
  alive, dist, entityById, priorOutcome, publishSituationNews, settleSituation,
} from '../../systems/crSituationKit.js';

export const encounterOrder = 1203;
export const trigger = deepFreeze({
  id: 'the_declaration',
  tier: 'minor',
  deck: 'civilian',
  weight: 0.85,
  zoneTypes: ['border_checkpoint', 'trade_lane'],
  script: 'selfRegistered',
  pressureCost: 10,
  cooldownS: 1500,
  proximity: true,
  gates: { sectorIds: ['sector_tethys_junction'] },
});

export const DECL = Object.freeze({
  windowS: 180,
  pods: 3,
  podAmount: 20,
  driftSpeed: 4,
  podSpreadWu: 26,
  podStartAlongWu: 40,
  cutterAlongWu: 330,
  coneRangeWu: 230,        // the cone reaches back down the lane to along 100
  runnerAcrossWu: -90,
  homeWu: 80,
  returnedPay: 300,
  turnedInPay: 140,
  touchedWu: 40,           // a pod this far off its coast line was moved by someone
});

/** Data modules never import systems (import cycle); lawSecurity cones take a heading in atan2(z, x) radians (pointInScanCone). */
function headingToward(origin, point) {
  return Math.atan2(point.z - origin.z, point.x - origin.x);
}

export function coastFrame(c, pos) {
  const dx = pos.x - c.start.x, dz = pos.z - c.start.z;
  return { along: dx * c.dir.x + dz * c.dir.z, across: dx * -c.dir.z + dz * c.dir.x };
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');
    const rng = d.stream(live, 'declaration_layout');
    const a = rng() * Math.PI * 2;
    const u = { x: Math.cos(a), z: Math.sin(a) };
    const p = { x: -u.z, z: u.x };
    const start = { x: center.x, z: center.z };
    const at = (along, across) => ({ x: start.x + u.x * along + p.x * across, z: start.z + u.z * along + p.z * across });
    const prior = priorOutcome(state, live.shapeId);

    const podIds = [];
    for (let i = 0; i < DECL.pods; i++) {
      const pod = d.spawnCargoPod(live, {
        pos: at(DECL.podStartAlongWu - i * DECL.podSpreadWu, (i - 1) * 12),
        vel: { x: u.x * DECL.driftSpeed, z: u.z * DECL.driftSpeed },
        commodityId: 'cmdty_stolen_goods', amount: DECL.podAmount,
        ownerName: 'a Quiet runner', factionId: 'faction_quiet',
      });
      if (!pod) continue;
      pod.data.scanLabel = 'COASTING POD — STOLEN GOODS, HEADED FOR CUSTOMS';
      pod.data.encounterId = live.id;
      pod.data.crCoastAcross = (i - 1) * 12;
      pod.data.crCoastAlong = DECL.podStartAlongWu - i * DECL.podSpreadWu;
      podIds.push(pod.id);
    }
    d.spawnShips(live, [
      { archetype: 'customs_cutter', level: 1, role: 'customs', factionId: 'faction_scn', passive: true,
        pos: at(DECL.cutterAlongWu, 0), scanLabel: 'CONCORD CUSTOMS CUTTER — SCANNING THE LANE' },
      { archetype: 'mule_trader', level: 1, role: 'runner', factionId: 'faction_quiet', team: 2, context: 'civilian', passive: true,
        pos: at(-20, DECL.runnerAcrossWu), scanLabel: 'QUIET RUNNER — COUPLING BLOWN, CARGO LOOSE' },
    ]);
    const cutter = d.entsOf(live, 'customs')[0];
    const runner = d.entsOf(live, 'runner')[0];
    if (!cutter || !runner || podIds.length < DECL.pods) return d.abort(live, 'no_bodies');
    const heading = headingToward(cutter.pos, at(0, 0));
    cutter.data = cutter.data || {};
    // Half-angle and dwell stay the law owner's defaults; only aim and reach are authored.
    cutter.data.customsScanCone = { heading, range: DECL.coneRangeWu };
    for (const s of [cutter, runner]) if (s.data && s.data.ai) s.data.ai.allowPassiveManeuver = false;

    live.data.declaration = {
      cutterId: cutter.id, runnerId: runner.id, podIds, start, dir: u,
      latched: {}, t0: d.now(), prior: prior ? prior.outcome : null, settled: false,
    };
    live.deadlineAt = d.now() + DECL.windowS;
    live.phase = 'coasting';
    live.approach = { signal: 'pods_coasting_at_customs', contacts: podIds.length + 2, t: d.now() };
    d.say(live, 'alert', prior && prior.outcome === 'seized'
      ? 'QUIET RUNNER: Coupling went again and the deck is walking into the cutter. Last time somebody watched it all go. Hulls block the scan, friend. Any hull.'
      : 'QUIET RUNNER: Coupling blew and my whole deck is drifting into that cutter\'s cone. Bring it back and I pay. Or don\'t, and Concord gets a good day.',
    null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const c = live.data && live.data.declaration;
    if (c && !c.settled && name === 'tetherAttached' && payload && c.podIds.includes(payload.targetId)) c.latched[payload.targetId] = true;
  },

  tick(d, live, state, now) {
    const c = live.data && live.data.declaration;
    if (!c || c.settled || live.phase === 'done') return;
    const tether = state.player && state.player.tether;
    if (tether && tether.active && c.podIds.includes(tether.targetId)) c.latched[tether.targetId] = true;
    const runner = entityById(state, c.runnerId);
    let scanned = 0, home = 0, touchedScanned = 0, open = 0;
    for (const id of c.podIds) {
      const pod = entityById(state, id);
      if (!alive(pod) || !pod.pos) continue;
      if (pod.data && pod.data.customsScanned) {
        scanned++;
        const f = coastFrame(c, pod.pos);
        const coastAlong = (pod.data.crCoastAlong || 0) + DECL.driftSpeed * (now - c.t0);
        const off = Math.max(Math.abs(f.across - (pod.data.crCoastAcross || 0)), Math.abs(f.along - coastAlong));
        if (c.latched[id] || off >= DECL.touchedWu) touchedScanned++;
      } else if (alive(runner) && dist(pod.pos, runner.pos) <= DECL.homeWu) home++;
      else open++;
    }
    if (open > 0 && now < live.deadlineAt) return;
    let outcome;
    if (home > 0 && scanned === 0) outcome = 'returned';
    else if (home > 0) outcome = 'split';
    else if (scanned > 0) outcome = touchedScanned > 0 ? 'turned_in' : 'seized';
    else outcome = 'scattered';
    return this._settle(d, live, state, c, outcome, { scanned, home, touchedScanned });
  },

  _settle(d, live, state, c, outcome, facts) {
    if (c.settled) return;
    c.settled = true;
    if (outcome === 'returned') {
      d.grant(DECL.returnedPay, 'the_declaration:returned');
      d.rep('faction_quiet', 4, 'the_declaration_returned');
    } else if (outcome === 'split') {
      d.grant(Math.round(DECL.returnedPay * facts.home / DECL.pods), 'the_declaration:split');
      d.rep('faction_quiet', 1, 'the_declaration_split');
    } else if (outcome === 'turned_in') {
      d.grant(DECL.turnedInPay, 'the_declaration:turned_in');
      d.rep('faction_scn', 2, 'the_declaration_turned_in');
      d.rep('faction_quiet', -4, 'the_declaration_turned_in');
      publishSituationNews(d, live, 'STOLEN DECK DELIVERED TO CUSTOMS: a pilot pushed a Quiet runner\'s loose cargo straight into a Concord cutter\'s scan. The Quiet have a name now.');
    } else if (outcome === 'seized') {
      publishSituationNews(d, live, 'CUSTOMS READS A DRIFTING DECK: a Quiet runner\'s cargo coasted into a Concord scan on the Tethys approach while traffic flew past.');
    }
    return settleSituation(d, live, state, outcome, facts);
  },
});

export default defineEncounter(trigger, {
  shape: { situation: 'puzzle', place: trigger.zoneTypes, twist: 'logic', actor: 'faction_quiet' },
  factionId: 'faction_quiet',
  title: 'THE DECLARATION',
  primaryLine: 'QUIET RUNNER: Coupling blew and my whole deck is drifting into that cutter\'s cone. Bring it back and I pay. Or don\'t, and Concord gets a good day.',
  verbs: ['latch', 'tow', 'shove', 'shadow'],
  choices: [
    { id: 'haul', verb: 'latch', text: 'Haul the coasting pods back to the runner before the cutter reads them.' },
    { id: 'shadow', verb: 'shove', text: 'Park your hull between the cutter and the pods and walk them home in your shadow.' },
    { id: 'declare', verb: 'shove', text: 'Push the pods into the cutter\'s cone and let Concord have them.' },
    { id: 'pass', verb: 'fly_on', text: 'Fly on; customs reads them all.' },
  ],
  bark: null,
  deadlineS: DECL.windowS,
  receipts: {
    returned: 'RETURNED — the runner has its deck back and Concord never read it. The Quiet pay.',
    split: 'SPLIT — some of the deck made it home; customs read the rest.',
    turned_in: 'TURNED IN — you delivered the deck to customs. Concord pays a finder\'s fee; the Quiet remember.',
    seized: 'SEIZED — the deck coasted into the cutter\'s scan. Nobody pays you anything.',
    scattered: 'The deck drifted off into the dark. Nobody gets it.',
  },
});
