// 351 — THE CHORD (CR-CHAIN braid: a planet well and a field well as one curve).
// A gas skimmer's helium-3 train broke loose and is riding The Anvil's sling band — a live arc
// of drifting pods tracing the planet's pull. The skiff that lost them works the head of the
// train; a raider pair is cutting the chord — a straight line across the arc the planet keeps
// bending. The braid is the geometry: the pods ride the planet's curve, and a player-deployed
// field well on the same seam composes with it into one curve — sling the whole train free,
// bend the raiders' chord into the danger band, or simply ride the arc and collect.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 351;
export const trigger = deepFreeze({
  id: 'sling_chord',
  tier: 'minor',
  deck: 'combat',
  weight: 1.0,
  // Only a planetary_mass zone can host the braid — today that is The Anvil alone, which is
  // correct: the situation exists where the world's pull is a working instrument.
  zoneTypes: ['planetary_mass'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 34,
  cooldownS: 780,
  proximity: true,
  fireWithinWu: 520,
  gates: {
    maxSecurity: 0.75,
    minSectorTier: 1,
    storyBeatMin: 1,
  },
});

// Train geometry: pods ride the sling band (planet band edges 1040 skim / 1450 sling); a
// tangential velocity at the witness speed puts them on the authored curve. The planet's
// annular well supplies the inward pull — in live physics the drift line arcs; in a bare
// sim the stamps are still honest (the braid is a situation, not a scripted path).
const TRAIN_PODS = 7;
const TRAIN_RADIUS_WU = 1180;        // mid sling band, where the authored sling witness rides
const TRAIN_ARC_STEP_RAD = 0.10;     // arc spacing between pods
const TRAIN_TANGENT_SPEED = 66;      // just under the witness speed — the train is bleeding
const RAID_DEADLINE_S = 110;

function tangentAt(theta) {
  return { x: -Math.sin(theta), z: Math.cos(theta) };
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + (live.shape.deadlineS || RAID_DEADLINE_S);
    const center = live.plan && live.plan.zoneCenter;
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) {
      return d.abort(live, 'no_planet_anchor');
    }
    const ships = live.plan.ships;
    const skiffSpec = ships.find((sh) => sh && sh.role === 'hauler');
    const raiderSpecs = ships.filter((sh) => sh && sh.role === 'raider');
    if (!skiffSpec || !raiderSpecs.length) return d.abort(live, 'no_cast');

    // Lay the whole cast on the planet's arc before materialization. Angles come from the
    // live stream so the same seed always cuts the same chord.
    const rng = d.stream(live, 'chord_layout');
    const theta0 = rng() * Math.PI * 2;
    live.data.chord = { center: { x: center.x, z: center.z }, theta0 };

    // The skiff works the head of its own lost train — tangential speed, hull fine, hold light.
    const headTheta = theta0 + TRAIN_PODS * TRAIN_ARC_STEP_RAD + 0.10;
    skiffSpec.pos.x = center.x + Math.cos(headTheta) * 1150;
    skiffSpec.pos.z = center.z + Math.sin(headTheta) * 1150;

    // The raiders cut the chord: spawned at the influence edge, aimed at a lead point on the
    // arc — a straight line the planet's pull visibly bends.
    const midTheta = theta0 + Math.floor(TRAIN_PODS / 2) * TRAIN_ARC_STEP_RAD;
    const chordVels = [];
    let ri = 0;
    for (const spec of raiderSpecs) {
      const spawnTheta = theta0 - 0.9 - ri * 0.35;
      const interceptTheta = midTheta + 0.12 + ri * 0.05;
      const ix = center.x + Math.cos(interceptTheta) * TRAIN_RADIUS_WU;
      const iz = center.z + Math.sin(interceptTheta) * TRAIN_RADIUS_WU;
      spec.pos.x = center.x + Math.cos(spawnTheta) * 2300;
      spec.pos.z = center.z + Math.sin(spawnTheta) * 2300;
      const dx = ix - spec.pos.x, dz = iz - spec.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      chordVels.push({ x: (dx / len) * 92, z: (dz / len) * 92 });
      ri++;
    }

    const ids = d.spawnShips(live, ships);
    if (!ids.length || d.aliveCount(live, 'hauler') < 1 || d.aliveCount(live, 'raider') < 1) {
      return d.abort(live, 'no_budget');
    }

    const skiff = d.entsOf(live, 'hauler')[0];
    const sh = tangentAt(headTheta);
    skiff.vel = { x: sh.x * 68, z: sh.z * 68 };
    const spawnedRaiders = d.entsOf(live, 'raider');
    spawnedRaiders.forEach((raider, i) => {
      if (chordVels[i]) raider.vel = { x: chordVels[i].x, z: chordVels[i].z };
    });
    const sdata = skiff.data || (skiff.data = {});
    const sai = sdata.ai || (sdata.ai = {});
    sai.jobKind = 'skimmer';
    sai.moraleImmune = true; // it is gathering, not fleeing — the script owns its exit
    sdata.scanLabel = 'GAS SKIFF — TRAIN ADRIFT';
    sdata.cargo = { cmdty_gas_helium3: 4 };

    for (const raider of d.entsOf(live, 'raider')) {
      const rdata = raider.data || (raider.data = {});
      (rdata.combat || (rdata.combat = {})).targetId = skiff.id;
      if (rdata.ai) {
        rdata.ai.targetId = skiff.id;
        rdata.ai.pursueTargetId = skiff.id;
      }
    }

    // The train: helium-3 pods strung along the arc, each on tangential velocity — riding the
    // sling band's pull exactly as the planet's sling witness does. Persistent, physical,
    // salvageable, tetherable — and curvable by any well laid on the seam.
    const podRng = d.stream(live, 'train_pods');
    live.data.trainIds = [];
    for (let i = 0; i < TRAIN_PODS; i++) {
      const theta = theta0 + i * TRAIN_ARC_STEP_RAD + (podRng() - 0.5) * 0.02;
      const r = TRAIN_RADIUS_WU + (podRng() - 0.5) * 80;
      const tv = tangentAt(theta);
      const speed = TRAIN_TANGENT_SPEED + (podRng() - 0.5) * 10;
      const pod = d.spawnCargoPod(live, {
        pos: { x: center.x + Math.cos(theta) * r, z: center.z + Math.sin(theta) * r },
        vel: { x: tv.x * speed, z: tv.z * speed },
        commodityId: 'cmdty_gas_helium3',
        amount: podRng() < 0.35 ? 2 : 1,
        ownerId: skiff.id,
        ownerName: 'gas skiff',
        factionId: 'faction_mts',
      });
      if (pod) live.data.trainIds.push(pod.id);
    }

    live.phase = 'conflict';
    d.say(live, 'alert',
      'SKIM WATCH: gas train adrift on the Anvil — a crew is losing its whole load to the curve.',
      null, { primary: true, literal: true });
    d.emit('comms:log', {
      from: 'MTS GAS SKIFF',
      text: 'Load slipped the band — it is riding the planet, and they are cutting the chord on me. Anything you put on that seam bends with it.',
      kind: 'encounter',
    });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const skiff = d.entsOf(live, 'hauler')[0] || null;
    const raidersAlive = d.aliveCount(live, 'raider') > 0;

    if (!skiff) {
      // The gatherer is down; the train keeps riding the pull whether or not anyone is paid.
      releaseCast(live);
      return d.resolve(live, 'skiff_down', { speak: true });
    }

    if (!raidersAlive) {
      const intact = (live.data.trainIds || [])
        .filter((id) => { const e = state.entities.get(id); return e && e.alive !== false; })
        .length;
      d.grant(90 + 30 * intact, 'curve:train_recovered');
      d.rep('faction_mts', 3, 'chord_cut');
      d.emit('comms:log', {
        from: 'MTS GAS SKIFF',
        text: intact > 0
          ? 'Chord is clear. Whatever is still on the curve is yours if you can hold it — I am taking what I can reach.'
          : 'Chord is clear. The planet kept my whole train — go on, it is a fair catch now.',
        kind: 'encounter',
      });
      releaseCast(live);
      return d.resolve(live, 'chord_cut', { speak: true });
    }

    if (now >= live.deadlineAt) {
      // The arc carries the train past the fight — pods stay physical, cast released.
      releaseCast(live);
      return d.resolve(live, 'arc_drifts', { speak: false });
    }
  },
});

// Same contract as 344/350: resolving must not stamp the cast for despawn — the skiff keeps
// gathering and the raiders keep being pirates as ordinary world entities.
function releaseCast(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

export default defineEncounter(trigger, {
  shape: {
    situation: 'salvage',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'mule_trader',
  },
  motive: 'cargo_raid',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'THE CHORD',
  primaryLine: 'SKIM WATCH: gas train adrift on the Anvil — a crew is losing its whole load to the curve.',
  squad: {
    archetypes: ['reaver_pirate', 'wasp_swarmer'],
    size: [2, 2],
    doctrine: 'thief',
    formation: 'loose',
  },
  civilian: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_mts',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  bark: null,
  telegraph: 'A gas train is riding the Anvil\'s pull — someone is cutting the chord.',
  deadlineS: RAID_DEADLINE_S,
  aftermath: {
    flee: 'The skiff runs the shallows home; the train keeps riding the curve.',
    kill: 'The arc goes quiet. Pods keep tracing the band, ownerless.',
  },
  receipts: {
    chord_cut: 'CHORD CUT — the skiff lives. Its train still rides the Anvil\'s pull.',
    skiff_down: 'SKIFF DOWN — the gatherer is gone. The train drifts the curve alone.',
    arc_drifts: 'The train rides past — pods still tracing the band, the pursuit gone.',
  },
});
