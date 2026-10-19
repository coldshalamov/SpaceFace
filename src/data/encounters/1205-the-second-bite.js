// WF-08 — THE SECOND BITE. The first thing the Caved Shaft taught this sector is that the rock
// bites back: a hollow pocket folded Bite Two's auger inward, snapped the claim platform, and spat
// the crew pod loose — six souls on a 180-second oxygen clock, tumbling out of the wreck's shadow
// while the claim's own ore and one volatile fuel rack drift beside the hull. Two escorts hold the
// perimeter; the claim desk is already on the wire. The Reach heard the same mayday — a scav pack
// is inbound on the bearing, and it arrives mid-scene whether or not the player has made up their
// mind.
//
// Every judgement reads the world: the pod's own causal stamp (survivorPod owns rescue, ransom,
// capture, and expiry), the platform's salvage pool, the squad ledger for who killed what. The pod
// is a real persistent tetherable body owned by survivorPod — the encounter only frames it. Fight
// the pack off and fly away and the crew still dies of air: the combat buys the tow, it is not the
// tow. Strip the platform while they suffocate and the claim remembers a scavenger, not a rescuer.
import { deepFreeze, defineEncounter } from './catalog.js';
import {
  alive, entityById, priorOutcome, publishSituationNews, settleSituation,
} from '../../systems/crSituationKit.js';
import { CAUSAL_POD_TTL_S } from '../../systems/survivorPod.js';

export const encounterOrder = 1205;
export const trigger = deepFreeze({
  id: 'the_second_bite',
  tier: 'major',
  deck: 'civilian',
  weight: 1,
  zoneTypes: ['mining_belt'],
  script: 'selfRegistered',
  pressureCost: 26,
  cooldownS: 3600,
  proximity: true,
  fireWithinWu: 520,
  gates: { sectorIds: ['sector_hyperion_cut'] },
});

export const SECOND_BITE = Object.freeze({
  windowS: CAUSAL_POD_TTL_S + 30,   // the oxygen clock is the real deadline; this only mops up
  scavengerDelayS: 55,              // the Reach heard the same mayday
  scavengerDistWu: 1350,            // inbound bearing from the wreck
  scavengerLootWu: 620,             // raiders this close to the site when the air runs out ate the claim
  podDriftSpeed: 11,                // payload vel source — survivorPod keeps 0.2 of it (~2.2 WU/s tumble)
  orePods: 3,
  oreRadius: 7,
  rackAmount: 18,
  rackSideWu: 95,
  escortDistWu: 140,
  crewSavedPay: 260,                // claim-desk thanks, on top of the pod's own salvage fee
});

function poolLeft(e) {
  const pool = e && e.data && e.data.salvagePool;
  if (!pool || typeof pool !== 'object') return 0;
  let n = 0;
  for (const v of Object.values(pool)) n += Math.max(0, Number(v) || 0);
  return n;
}

/** The crew pod's own ledger: survivorPod's resolution receipts are the ground truth, kept after
 * the pod body retires — a towed-in rescue disposes the entity, so the stamp is not enough. */
function podReceipt(state, memoryId) {
  const receipts = state
    && state.survivorPod
    && state.survivorPod.causal
    && state.survivorPod.causal.receipts;
  if (!Array.isArray(receipts)) return null;
  for (let i = receipts.length - 1; i >= 0; i--) {
    const r = receipts[i];
    if (r && r.id === memoryId) return r;
  }
  return null;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');
    const rng = d.stream(live, 'second_bite_layout');
    const a = rng() * Math.PI * 2;
    const u = { x: Math.cos(a), z: Math.sin(a) };           // wreck→drift axis
    const p = { x: -u.z, z: u.x };
    const at = (along, across) => ({ x: center.x + u.x * along + p.x * across, z: center.z + u.z * along + p.z * across });
    const prior = priorOutcome(state, live.shapeId);
    const priorLoss = prior && (prior.outcome === 'lost_air' || prior.outcome === 'stripped'
      || prior.outcome === 'betrayed' || prior.outcome === 'picked_clean');

    const platform = d.spawnWreck(live, {
      pos: { x: center.x, z: center.z },
      pool: { cmdty_scrap_metal: 5, cmdty_ore_titanium: 2 },
      scanLabel: 'BITE TWO — CLAIM PLATFORM — AUGER IN THE ROCK',
      storyPropKind: 'cr_second_bite_platform',
    });
    if (!platform) return d.abort(live, 'no_bodies');
    // The mayday label and the pod's own faction come off the victim record: stamp the platform
    // as the DMC claim hull it was before the pocket took it.
    platform.factionId = 'faction_dmc';
    platform.data.factionId = 'faction_dmc';
    platform.data.trafficRole = 'claim platform';

    const oreIds = [];
    const oreSpecs = [
      { commodityId: 'cmdty_ore_titanium', amount: 30 },
      { commodityId: 'cmdty_ore_iron', amount: 60 },
      { commodityId: 'cmdty_ore_iron', amount: 60 },
    ];
    for (let i = 0; i < oreSpecs.length; i++) {
      const side = i === 0 ? 1 : -1;
      const pod = d.spawnCargoPod(live, {
        pos: at(26 + i * 30, side * (44 + i * 18)), vel: { x: 0, z: 0 },
        commodityId: oreSpecs[i].commodityId, amount: oreSpecs[i].amount,
        unitMass: 0.5, radius: SECOND_BITE.oreRadius,
        ownerName: 'the Bite Two claim', factionId: 'faction_dmc',
      });
      if (!pod) continue;
      pod.data.scanLabel = `CLAIM ORE POD — ${oreSpecs[i].commodityId === 'cmdty_ore_titanium' ? 'SEAM TITANIUM' : 'SEAM IRON'}`;
      pod.data.encounterId = live.id;
      oreIds.push(pod.id);
    }

    const rack = d.spawnCargoPod(live, {
      pos: at(-20, SECOND_BITE.rackSideWu), vel: { x: 0, z: 0 },
      commodityId: 'cmdty_fuel_cells', amount: SECOND_BITE.rackAmount,
      ownerName: 'the Bite Two claim', factionId: 'faction_dmc',
    });
    if (rack) {
      rack.data.scanLabel = 'LOOSE FUEL RACK — VOLATILE';
      rack.data.encounterId = live.id;
    }

    const escortIds = d.spawnShips(live, [
      { archetype: 'mule_trader', level: 4, role: 'escort', factionId: 'faction_dmc', team: 2,
        context: 'civilian', passive: true, pos: at(-SECOND_BITE.escortDistWu, -80),
        scanLabel: 'BITE TWO ESCORT — HOLDING PERIMETER' },
      { archetype: 'mule_trader', level: 4, role: 'escort', factionId: 'faction_dmc', team: 2,
        context: 'civilian', passive: true, pos: at(SECOND_BITE.escortDistWu * 0.8, 110),
        scanLabel: 'BITE TWO ESCORT — HOLDING PERIMETER' },
    ]);

    // The crew pod is survivorPod's own causal pod — persistent, tetherable, on the real oxygen
    // clock. The platform is the victim of record so the mayday hail and the pod's faction carry
    // the claim's identity. It tumbles out of the wreck's shadow along the drift axis.
    const sp = d.registry && typeof d.registry.get === 'function' ? d.registry.get('survivorPod') : null;
    if (!sp || typeof sp._spawnCausalPod !== 'function') return d.abort(live, 'no_pod_owner');
    const sign = Number(platform.id) % 2 ? 1 : -1;
    const pod = sp._spawnCausalPod(state, platform, {
      vel: { x: p.x * sign * SECOND_BITE.podDriftSpeed, z: p.z * sign * SECOND_BITE.podDriftSpeed },
    });
    if (!pod) return d.abort(live, 'no_pod');
    pod.data.scanLabel = 'BITE TWO CREW POD — SIX SOULS — O2 LOW';
    // Register on the squad ledger so a pod kill arrives through squadKill with attribution;
    // the persistent flag keeps it out of every despawn sweep anyway.
    live.ids.push(pod.id);
    live.roles[pod.id] = 'pod';

    if (oreIds.length < SECOND_BITE.orePods || !rack || escortIds.length < 2) {
      return d.abort(live, 'no_bodies');
    }

    live.data.secondBite = {
      platformId: platform.id,
      podId: pod.id,
      podMemoryId: pod.data.survivorPodCausal && pod.data.survivorPodCausal.memoryId,
      oreIds,
      rackId: rack.id,
      escortIds,
      raiderIds: [],
      poolAtStart: poolLeft(platform),
      scavengersAt: d.now() + SECOND_BITE.scavengerDelayS,
      raidersSpawned: false,
      latched: false,
      playerFought: false,
      betrayed: false,
      prior: prior ? prior.outcome : null,
      settled: false,
    };
    live.deadlineAt = d.now() + SECOND_BITE.windowS;
    live.phase = 'adrift';
    live.approach = {
      signal: 'platform_pod_and_pack',
      contacts: 2 + oreIds.length + 1 + 1,
      t: d.now(),
    };
    live.vars = { ...(live.vars || {}), crew: 'Bite Two' };
    d.say(live, 'alert', priorLoss
      ? 'CUT CLAIM DESK: Bite Two\'s auger went into a pocket and the platform is dead — the crew pod is in the water with six aboard. The seams have buried crews under watching hulls before. Not again — get that pod to the Cut Claim Outpost. Reach heard the mayday too.'
      : 'CUT CLAIM DESK: Bite Two\'s auger went into a pocket and the platform is dead — the crew pod is in the water with six aboard. Tow it into the Cut Claim Outpost\'s bubble before the air goes. Reach heard the same mayday; expect a scav pack on the bearing.',
    null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const w = live.data && live.data.secondBite;
    if (!w || w.settled) return;
    if (name === 'tetherAttached' && payload && payload.targetId === w.podId) {
      w.latched = true;
      return;
    }
    if (name === 'squadKill' && payload) {
      const role = payload.role;
      if (role === 'raider' && payload.byPlayer) w.playerFought = true;
      if ((role === 'escort' || role === 'pod') && payload.byPlayer) w.betrayed = true;
    }
  },

  tick(d, live, state, now) {
    const w = live.data && live.data.secondBite;
    if (!w || w.settled || live.phase === 'done') return;
    // A line thrown before this pass still counts — the event is the fast path, the stamp is truth.
    const tether = state.player && state.player.tether;
    if (tether && tether.active && tether.targetId === w.podId) w.latched = true;

    // The crew's fate outranks everything else on the field. survivorPod's receipt is the
    // ground truth and outlives the pod body itself.
    const receipt = podReceipt(state, w.podMemoryId);
    if (receipt) {
      const outcome = receipt.outcome;
      if (outcome === 'rescued') return this._settle(d, live, state, 'crew_saved', { reason: receipt.reason });
      if (outcome === 'ransomed') return this._settle(d, live, state, 'ransomed');
      if (outcome === 'captured') return this._settle(d, live, state, 'pod_taken');
      if (outcome === 'abandoned') {
        const scavengers = this._raidersNear(d, live, w);
        return this._settle(d, live, state, scavengers ? 'picked_clean' : 'lost_air', { playerLeftIt: receipt.playerLeftIt === true });
      }
    }

    // The pod died without a resolution — impact or direct fire. If the squad ledger caught the
    // player at it, that is the betrayal, not an accident.
    const pod = entityById(state, w.podId);
    if (!receipt && !alive(pod)) {
      return this._settle(d, live, state, w.betrayed ? 'betrayed' : 'pod_broken');
    }
    if (w.betrayed) return this._settle(d, live, state, 'betrayed');

    // The claim's platform stripped while its crew suffocates — the world reads scavenging,
    // not salvage.
    const platform = entityById(state, w.platformId);
    if (w.poolAtStart > 0 && (!alive(platform) || poolLeft(platform) <= 0)) {
      return this._settle(d, live, state, 'stripped');
    }

    // The complication lands mid-scene: the scav pack comes in on the mayday bearing.
    if (!w.raidersSpawned && now >= w.scavengersAt) {
      w.raidersSpawned = true;
      this._spawnRaiders(d, live, w);
    }

    if (now >= live.deadlineAt) return this._settle(d, live, state, 'went_quiet');
  },

  _spawnRaiders(d, live, w) {
    const rng = d.stream(live, 'second_bite_pack');
    const a = rng() * Math.PI * 2;
    const u = { x: Math.cos(a), z: Math.sin(a) };
    const p = { x: -u.z, z: u.x };
    const anchor = live.anchor || (live.plan && live.plan.zoneCenter);
    const specs = [];
    const roster = ['reaver_pirate', 'corsair_raider', 'reaver_pirate'];
    for (let i = 0; i < roster.length; i++) {
      const along = SECOND_BITE.scavengerDistWu + i * 90;
      const across = (i - 1) * 110;
      specs.push({
        archetype: roster[i], level: 5 + (i === 1 ? 1 : 0), role: 'raider',
        factionId: 'faction_reach', team: 1, context: 'zone_hostile', passive: false,
        pos: { x: anchor.x + u.x * along + p.x * across, z: anchor.z + u.z * along + p.z * across },
        scanLabel: 'REACH SCAV PACK — ON THE MAYDAY BEARING',
      });
    }
    const ids = d.spawnShips(live, specs);
    w.raiderIds = ids;
    if (ids.length) {
      d.say(live, 'bark',
        'BITE TWO ESCORT: Contacts on the mayday bearing — Reach scav pack inbound on the wreck. If you are taking that pod, take it now.',
        null, { literal: true });
    }
  },

  _raidersNear(d, live, w) {
    const anchor = live.anchor || (live.plan && live.plan.zoneCenter);
    if (!anchor) return false;
    const r2 = SECOND_BITE.scavengerLootWu * SECOND_BITE.scavengerLootWu;
    for (const e of d.entsOf(live, 'raider')) {
      if (!e || !e.pos) continue;
      const dx = e.pos.x - anchor.x, dz = e.pos.z - anchor.z;
      if (dx * dx + dz * dz <= r2) return true;
    }
    return false;
  },

  _settle(d, live, state, outcome, facts = {}) {
    const w = live.data && live.data.secondBite;
    if (!w || w.settled) return;
    w.settled = true;
    const via = w.latched ? 'line' : (w.playerFought ? 'fought' : 'stood_off');
    if (outcome === 'crew_saved') {
      d.grant(SECOND_BITE.crewSavedPay, 'the_second_bite:crew_saved');
      d.rep('faction_dmc', 5, 'the_second_bite_crew_saved');
      publishSituationNews(d, live, 'SEAM CREW PULLED OUT: the Bite Two pod made a Collective dock with air to spare. The claim desk is paying the pilot who answered.');
    } else if (outcome === 'ransomed') {
      d.rep('faction_dmc', 1, 'the_second_bite_ransomed');
      publishSituationNews(d, live, 'BITE TWO CREW CAME BACK THE LONG WAY: the pod turned up at a fence and the claim paid to have its people returned. Ask the pilot who towed them there.');
    } else if (outcome === 'pod_taken') {
      publishSituationNews(d, live, 'SIX SOULS OFF THE WIRE: the Bite Two pod was cut loose by a Reach hull and has not answered since. The claim is offering for any sighting.');
    } else if (outcome === 'betrayed') {
      d.rep('faction_dmc', -6, 'the_second_bite_betrayed');
      publishSituationNews(d, live, 'CLAIM MURDER AT BITE TWO: a hull in the lane fired on the crew\'s own people over the wreck. The Collective has the registry.');
    } else if (outcome === 'pod_broken') {
      publishSituationNews(d, live, 'BITE TWO POD LOST: the crew pod broke up in the seams before anybody could reach it. The claim is holding a minute of silence on the wire.');
    } else if (outcome === 'stripped') {
      d.rep('faction_dmc', -4, 'the_second_bite_stripped');
      publishSituationNews(d, live, 'SCAVENGED OVER THE LIVING: a passing hull stripped the Bite Two platform and left the crew pod in the water. The Collective remembers the difference.');
    } else if (outcome === 'lost_air') {
      if (facts.playerLeftIt) d.rep('faction_dmc', -2, 'the_second_bite_left_it');
      publishSituationNews(d, live, 'SIX SOULS ON THE CLOCK RAN OUT: the Bite Two pod went quiet in the seams. The claim desk logged which registries were in the lane.');
    } else if (outcome === 'picked_clean') {
      publishSituationNews(d, live, 'THE REACH ATE THE CLAIM: the Bite Two site was stripped to the bolts while the crew pod died in the drift. West-march work.');
    }
    live.vars = { ...(live.vars || {}), via };
    return settleSituation(d, live, state, outcome, {
      via, raidersCame: w.raiderIds.length > 0, playerFought: w.playerFought,
      ...facts,
    });
  },
});

export default defineEncounter(trigger, {
  shape: { situation: 'distress', place: trigger.zoneTypes, twist: 'named', actor: 'faction_dmc' },
  factionId: 'faction_dmc',
  title: 'THE SECOND BITE',
  primaryLine: 'CUT CLAIM DESK: Bite Two\'s auger went into a pocket and the platform is dead — the crew pod is in the water with six aboard. Tow it into the Cut Claim Outpost\'s bubble before the air goes. Reach heard the same mayday; expect a scav pack on the bearing.',
  verbs: ['latch', 'tow', 'fire', 'salvage', 'fly_on'],
  choices: [
    { id: 'tow', verb: 'latch', text: 'Latch the crew pod and tow it into the Cut Claim Outpost\'s bubble.' },
    { id: 'fight', verb: 'fire', text: 'Hold the site — break the Reach pack before it reaches the wreck.' },
    { id: 'strip', verb: 'salvage', text: 'Strip the platform and the loose ore and leave the pod in the water.' },
    { id: 'pass', verb: 'fly_on', text: 'Fly on. The Reach heard the same mayday.' },
  ],
  civilian: { archetypes: ['mule_trader'], size: [2, 2], factionId: 'faction_dmc', context: 'civilian', team: 2, passive: true },
  deadlineS: SECOND_BITE.windowS,
  receipts: {
    crew_saved: 'CREW SAVED — the Bite Two pod is aboard and the air held. The claim pays, and the Collective remembers who answered.',
    ransomed: 'BACK BY RANSOM — the pod came home through a fence. The crew lives; the claim paid twice for it.',
    pod_taken: 'POD TAKEN — a Reach hull cut the crew loose and hauled them off the wire. The claim wants the sighting.',
    betrayed: 'BETRAYED — you fired on the claim\'s own people over the wreck. The Collective has your registry.',
    pod_broken: 'POD BROKEN — the crew pod came apart before anyone could take it. Six souls.',
    stripped: 'STRIPPED — you took the platform\'s bones while the crew suffocated. The Collective remembers the difference.',
    lost_air: 'RAN OUT OF AIR — the pod went quiet in the seams. The claim logged who was in the lane.',
    picked_clean: 'PICKED CLEAN — the Reach stripped the site and the pod died in the drift. West-march work.',
    went_quiet: 'The wire went quiet. Whatever was left at Bite Two, the seams have it now.',
  },
});
