// 356 — THE SURGE LINE (CR-ANVIL braid: the Veil sling variant).
// The Blind Nebula's storm lane is a conveyor on a clock: warning, then a six-second surge
// that hurls anything inside the sheet downrange, then calm. This braid stages the read
// the Anvil witness never shows — bodies WAIT for the throw. A Free Frontier courier holds
// inside the lane mouth between surges, helium-3 pods drift beside it, and Vael catchers
// sit inside the same lane downrange: when the surge fires, everyone rides one wave, and
// the catchers land on the courier at the exit. Nothing is scripted to move — the sheet
// is the only engine. The player can ride the surge beside them, cut the catch off at the
// exit, or stand out of the lane entirely and let the weather decide.
import { deepFreeze, defineEncounter } from './catalog.js';
import { WEATHER_VOLUMES, weatherPhase, pointInsideWeatherVolume } from '../environmentalMachinery.js';
import { setEntityDoctrine } from '../../ai/doctrine.js';

export const encounterOrder = 356;
export const trigger = deepFreeze({
  id: 'surge_line',
  tier: 'minor',
  deck: 'combat',
  weight: 1.0,
  // One zone in the whole sector map is Blind Nebula fog, and the storm lane sits on its
  // center — the zoneTypes pin IS the site lock; sectorIds is belt-and-suspenders for the
  // day any other sector grows a fog bank.
  zoneTypes: ['nebula_fog'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 25,
  cooldownS: 900,
  proximity: true,
  gates: {
    sectorIds: ['sector_veil_nebula'],
    maxSecurity: 0.9,
    minSectorTier: 1,
    storyBeatMin: 1,
  },
});

const LANE = WEATHER_VOLUMES.find((v) => v && v.id === 'veil_storm_lane');
const POD_COMMODITY = 'cmdty_gas_helium3';
const POD_COUNT = 3;
const COURIER_MOUTH_WU = 60;        // courier holds this far inside the lane mouth
const CATCHER_EXIT_WU = 380;        // catchers hold inside the lane near the exit
const CATCHER_LATERAL_WU = 46;
const EXIT_LINE_WU = 520;           // riding past this counts as clearing the lane
const RIDE_DEADLINE_S = 160;
const SITE_DRIFT_WU = 900;

function releaseCast(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

function setCatchersHold(catchers, exitPoint, courierId, encounterId) {
  for (const c of catchers) {
    setEntityDoctrine(c, {
      activity: {
        kind: 'loiter',
        anchor: exitPoint,
        preferredRange: 60,
        reason: 'surge_line:waiting_for_the_wave',
        encounterId: encounterId || null,
      },
      roe: 'hold_fire',
    });
    const cd = c.data || (c.data = {});
    if (cd.combat) cd.combat.targetId = courierId || null;
  }
}

function setCatchersStrike(catchers, courierId, encounterId) {
  for (const c of catchers) {
    if (!c || c.alive === false) continue;
    setEntityDoctrine(c, {
      activity: {
        kind: 'attack_run',
        targetId: courierId || null,
        reason: 'surge_line:wave_rider',
        encounterId: encounterId || null,
      },
      roe: 'weapons_free',
    });
    const cd = c.data || (c.data = {});
    if (cd.ai) {
      cd.ai.pursueTargetId = courierId || null;
      cd.ai.targetId = courierId || null;
    }
    (cd.combat || (cd.combat = {})).targetId = courierId || null;
  }
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + (live.shape.deadlineS || RIDE_DEADLINE_S);
    if (!LANE || !LANE.globalPos || !LANE.dir) return d.abort(live, 'no_lane');
    if (live.plan && live.plan.relocated === true) return d.abort(live, 'site_moved');
    const anchor = live.plan && live.plan.zoneCenter;
    if (anchor && Number.isFinite(anchor.x)) {
      const adx = anchor.x - LANE.globalPos.x, adz = anchor.z - LANE.globalPos.z;
      if (adx * adx + adz * adz > SITE_DRIFT_WU * SITE_DRIFT_WU) return d.abort(live, 'site_moved');
    }
    const sectorId = state && state.world && state.world.currentSectorId;
    if (sectorId && sectorId !== LANE.sectorId) return d.abort(live, 'no_lane');

    const ships = live.plan.ships || [];
    const courierSpecs = ships.filter((sh) => sh && sh.role === 'hauler');
    const catcherSpecs = ships.filter((sh) => sh && sh.role === 'raider');
    if (!courierSpecs.length || !catcherSpecs.length) return d.abort(live, 'no_cast');

    const mouth = LANE.globalPos;
    const dir = LANE.dir;
    const lateral = { x: -dir.z, z: dir.x };
    const rng = d.stream(live, 'surge_layout');

    // The courier holds inside the mouth between surges — a body waiting for a throw.
    courierSpecs.forEach((spec) => {
      spec.pos.x = mouth.x + dir.x * COURIER_MOUTH_WU + lateral.x * (rng() - 0.5) * 30;
      spec.pos.z = mouth.z + dir.z * COURIER_MOUTH_WU + lateral.z * (rng() - 0.5) * 30;
    });
    // The catchers sit inside the same lane near the exit — the surge delivers the courier
    // to them; it carries the hunters too. Nobody has an unfair seat on the wave.
    catcherSpecs.forEach((spec, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      spec.pos.x = mouth.x + dir.x * (CATCHER_EXIT_WU + rng() * 40) + lateral.x * side * CATCHER_LATERAL_WU;
      spec.pos.z = mouth.z + dir.z * (CATCHER_EXIT_WU + rng() * 40) + lateral.z * side * CATCHER_LATERAL_WU;
    });

    const ids = d.spawnShips(live, ships);
    if (!ids.length || d.aliveCount(live, 'hauler') < 1 || d.aliveCount(live, 'raider') < 1) {
      return d.abort(live, 'no_budget');
    }

    const courier = d.entsOf(live, 'hauler')[0];
    courier.vel = { x: 0, z: 0 };
    const cdata = courier.data || (courier.data = {});
    cdata.jobKind = 'hauler';
    cdata.scanLabel = 'COURIER — HOLDING FOR THE SURGE';
    (cdata.ai || (cdata.ai = {})).moraleImmune = true; // it chose the lane; it does not bolt the moment guns warm
    setEntityDoctrine(courier, {
      activity: {
        kind: 'loiter',
        anchor: { x: mouth.x + dir.x * COURIER_MOUTH_WU, z: mouth.z + dir.z * COURIER_MOUTH_WU },
        preferredRange: 40,
        reason: 'surge_line:waiting_for_the_wave',
      },
      roe: 'hold_fire',
    });

    const catchers = d.entsOf(live, 'raider');
    const exitPoint = {
      x: mouth.x + dir.x * CATCHER_EXIT_WU,
      z: mouth.z + dir.z * CATCHER_EXIT_WU,
    };
    for (const c of catchers) {
      c.vel = { x: 0, z: 0 };
      const cd = c.data || (c.data = {});
      cd.scanLabel = 'CATCHER — RIDING THE LANE';
    }
    setCatchersHold(catchers, exitPoint, courier.id, live.id);

    // Cargo riding the same lane — pods inside the sheet slide when the surge does.
    live.data.pods = [];
    for (let i = 0; i < POD_COUNT; i++) {
      const along = 100 + i * 90 + rng() * 30;
      const lat = (rng() - 0.5) * LANE.field.halfWidth * 1.2;
      const pod = d.spawnCargoPod(live, {
        commodityId: POD_COMMODITY,
        amount: 2,
        pos: {
          x: mouth.x + dir.x * along + lateral.x * lat,
          z: mouth.z + dir.z * along + lateral.z * lat,
        },
        vel: { x: 0, z: 0 },
        ownerName: 'VEIL COURIER LINE',
        factionId: 'faction_free',
      });
      if (pod && pod.id != null) live.data.pods.push(pod.id);
    }

    live.data.lane = { x: mouth.x, z: mouth.z, dx: dir.x, dz: dir.z };
    live.data.lastPhase = weatherPhase(LANE, d.now()).phase;
    live.data.caught = false;
    live.phase = 'conflict';
    d.say(live, 'alert',
      'FOG WATCH: a courier is holding in the storm lane — and it is not the only hull waiting on the surge.',
      null, { primary: true, literal: true });
    d.emit('comms:log', {
      from: 'VEIL COURIER',
      text: 'Calm window. Holding the mouth \u2014 next wave throws me clean past the fog line.',
      kind: 'encounter',
    });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const courier = d.entsOf(live, 'hauler')[0] || null;
    const catchers = d.entsOf(live, 'raider').filter((e) => e && e.alive !== false);
    const lane = live.data.lane;

    const phase = weatherPhase(LANE, now).phase;
    if (phase !== live.data.lastPhase) {
      if (phase === 'warning') {
        d.emit('comms:log', {
          from: 'VEIL COURIER',
          text: 'Surge in two \u2014 everything in the sheet goes downrange.',
          kind: 'encounter',
        });
      } else if (phase === 'surge' && !live.data.caught) {
        live.data.caught = true;
        // The wave is live: the catchers stop waiting and ride it onto the courier.
        setCatchersStrike(d.entsOf(live, 'raider'), courier ? courier.id : null, live.id);
        d.emit('comms:log', {
          from: 'VEIL COURIER',
          text: 'RIDING \u2014 and the lane is not empty.',
          kind: 'encounter',
        });
      }
      live.data.lastPhase = phase;
    }

    if (!courier) {
      releaseCast(live);
      return d.resolve(live, 'rider_down', { speak: true });
    }

    if (!catchers.length) {
      d.grant(170, 'surge:line_held');
      d.rep('faction_free', 3, 'surge_line_held');
      d.emit('comms:log', {
        from: 'VEIL COURIER',
        text: 'Lane\u2019s clear. The wave owes you \u2014 next surge is free freight.',
        kind: 'encounter',
      });
      releaseCast(live);
      return d.resolve(live, 'line_held', { speak: true });
    }

    // Rode it out: the courier crossed the exit line under its own drift plus the wave.
    if (courier.pos) {
      const along = (courier.pos.x - lane.x) * lane.dx + (courier.pos.z - lane.z) * lane.dz;
      if (along >= EXIT_LINE_WU) {
        releaseCast(live);
        return d.resolve(live, 'rode_the_surge', { speak: true });
      }
    }

    if (now >= live.deadlineAt) {
      releaseCast(live);
      return d.resolve(live, 'storm_passed', { speak: false });
    }
  },
});

export default defineEncounter(trigger, {
  // Jettisoned cargo pods resolve pods/pod_cargo_container.glb at spawn — declare it so the
  // pending-item decode runway warms the pod body before telegraph resolves (the menu
  // crucible cohort only covers sessions that ran it).
  warmAssets: ['pods/pod_cargo_container.glb'],
  shape: {
    situation: 'ambush',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_vael',
  },
  motive: 'toll_raid',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_vael',
  context: 'encounter',
  title: 'THE SURGE LINE',
  primaryLine: 'FOG WATCH: a courier is holding in the storm lane — and it is not the only hull waiting on the surge.',
  squad: {
    archetypes: ['quiet_ghost', 'wasp_swarmer'],
    size: [2, 3],
    doctrine: 'thief',
    formation: 'loose',
  },
  civilian: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_free',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  bark: null,
  telegraph: 'The storm lane is mid-cycle — a courier is holding at its mouth.',
  deadlineS: RIDE_DEADLINE_S,
  aftermath: {
    flee: 'The lane empties on the next wave. The fog keeps its schedule.',
    kill: 'The catch never lands. The courier rides out past the fog line.',
  },
  receipts: {
    line_held: 'LINE HELD — the catch broke. The courier rides the next wave out.',
    rider_down: 'RIDER DOWN — the lane delivered the courier to the catch anyway.',
    rode_the_surge: 'RODE THE SURGE — courier and wave went downrange together.',
    storm_passed: 'The storm cycled through. The lane holds its next quiet batch.',
  },
});
