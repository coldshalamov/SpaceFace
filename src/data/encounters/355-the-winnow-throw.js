// 355 — THE WINNOW THROW (CR-ANVIL braid: a sling variant that is not the Anvil).
// The Feedstock Belt's ore winnow is a cycle, not a place: a gather well herds loose pods
// into the throat, a warning beat, then the discharge cone throws the batch east toward
// the foundry approach. This braid stages the shift honestly: longshore mules loiter on
// the gathering batch (the waiting bodies), ore pods sit inside the real gather well, and
// claim-jumpers run the discharge lane inbound — they want the throw, not the crew.
// Every moving part is the machine's own physics: gather pulls, discharge hurls, and the
// pods keep whatever the field gives them. The player can tow a pod out mid-gather, ride
// the throw, feed a jumper to the cone, or break the claim and let the shift finish.
import { deepFreeze, defineEncounter } from './catalog.js';
import { VESTA_ORE_WINNOW, vestaWinnowPhase } from '../environmentalMachinery.js';
import { setEntityDoctrine } from '../../ai/doctrine.js';

export const encounterOrder = 355;
export const trigger = deepFreeze({
  id: 'winnow_throw',
  tier: 'minor',
  deck: 'combat',
  weight: 1.0,
  // The braid needs the winnow — it lives in one sector's one belt zone. sectorIds keeps
  // the planner from spending other belts' slots on a machine that is not there.
  zoneTypes: ['mining_belt'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 25,
  cooldownS: 900,
  proximity: true,
  gates: {
    sectorIds: ['sector_vesta_forge'],
    maxSecurity: 0.75,
    minSectorTier: 1,
    storyBeatMin: 1,
  },
});

const WINNOW = VESTA_ORE_WINNOW;
const POD_COMMODITY = 'cmdty_ore_copper';
const POD_COUNT = 5;
const BATCH_EXIT_WU = 330;          // pods past this east of the winnow read as thrown
const JUMPER_STAGE_WU = 820;        // jumpers inbound up the discharge lane
const JUMPER_SPEED = 62;
const SHIFT_DEADLINE_S = 140;
const SITE_DRIFT_WU = 900;          // relocated anchors this far off the machine abort honest

function releaseCast(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + (live.shape.deadlineS || SHIFT_DEADLINE_S);
    // Site-locked: a proximity-starved relocation would strand the cast away from the
    // machine it claims to be working. Abort honest rather than lie at the marker.
    const anchor = live.plan && live.plan.zoneCenter;
    if (live.plan && live.plan.relocated === true) return d.abort(live, 'site_moved');
    if (anchor && Number.isFinite(anchor.x)) {
      const adx = anchor.x - WINNOW.globalPos.x, adz = anchor.z - WINNOW.globalPos.z;
      if (adx * adx + adz * adz > SITE_DRIFT_WU * SITE_DRIFT_WU) return d.abort(live, 'site_moved');
    }
    const sectorId = state && state.world && state.world.currentSectorId;
    if (sectorId && sectorId !== WINNOW.sectorId) return d.abort(live, 'no_winnow');

    const ships = live.plan.ships || [];
    const loaderSpecs = ships.filter((sh) => sh && sh.role === 'hauler');
    const jumperSpecs = ships.filter((sh) => sh && sh.role === 'raider');
    if (!loaderSpecs.length || !jumperSpecs.length) return d.abort(live, 'no_cast');

    // The gather well holds the batch at the throat; loaders orbit the batch on the well's
    // west rim, clear of the discharge cone's mouth.
    const mouth = WINNOW.globalPos;
    const rng = d.stream(live, 'winnow_layout');
    loaderSpecs.forEach((spec, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      spec.pos.x = mouth.x - 120 - rng() * 40;
      spec.pos.z = mouth.z + side * (70 + rng() * 30);
    });
    jumperSpecs.forEach((spec, i) => {
      const lateral = (i - (jumperSpecs.length - 1) / 2) * 120;
      spec.pos.x = mouth.x - JUMPER_STAGE_WU - rng() * 80;
      spec.pos.z = mouth.z + lateral;
    });

    const ids = d.spawnShips(live, ships);
    if (!ids.length || d.aliveCount(live, 'hauler') < 1 || d.aliveCount(live, 'raider') < 1) {
      return d.abort(live, 'no_budget');
    }

    for (const loader of d.entsOf(live, 'hauler')) {
      loader.vel = { x: 0, z: 0 };
      const ldata = loader.data || (loader.data = {});
      ldata.jobKind = 'salvor';
      ldata.scanLabel = 'WINNOW LONGSHORE — SHIFT';
      setEntityDoctrine(loader, {
        activity: { kind: 'loiter', anchor: { x: mouth.x - 90, z: mouth.z }, preferredRange: 90 },
        roe: 'hold_fire',
      });
    }
    const loaders = d.entsOf(live, 'hauler');
    const prey = loaders[0] || null;
    for (const jumper of d.entsOf(live, 'raider')) {
      jumper.vel = { x: JUMPER_SPEED, z: 0 };
      const jd = jumper.data || (jumper.data = {});
      jd.scanLabel = 'CLAIM-JUMPER — INBOUND';
      // The batch is the prize: aim the run at the crew on the throat, not the player's flank.
      if (jd.ai && prey) jd.ai.pursueTargetId = prey.id;
      (jd.combat || (jd.combat = {})).targetId = prey ? prey.id : null;
    }

    // The batch is already inside the gather well — real pods on the real field. The well
    // herds them; the discharge throws them; nobody scripts it.
    live.data.pods = [];
    for (let i = 0; i < POD_COUNT; i++) {
      const a = rng() * Math.PI * 2;
      const r = 46 + rng() * 110;
      const pod = d.spawnCargoPod(live, {
        commodityId: POD_COMMODITY,
        amount: 2,
        pos: { x: mouth.x + Math.cos(a) * r, z: mouth.z + Math.sin(a) * r },
        vel: { x: 0, z: 0 },
        ownerName: 'WINNOW SHIFT',
        factionId: 'faction_dmc',
      });
      if (pod && pod.id != null) live.data.pods.push(pod.id);
    }

    live.data.winnow = { x: mouth.x, z: mouth.z };
    live.data.lastPhase = vestaWinnowPhase(d.now()).phase;
    live.data.warned = false;
    live.data.thrown = false;
    live.phase = 'conflict';
    d.say(live, 'alert',
      'SHIFT WATCH: the winnow is loading — the throw goes east when the throat warns.',
      null, { primary: true, literal: true });
    d.emit('comms:log', {
      from: 'WINNOW LONGSHORE',
      text: 'Batch is gathering. Jumpers on the lane again — keep them off the throat until the throw.',
      kind: 'encounter',
    });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const loadersAlive = d.aliveCount(live, 'hauler') > 0;
    const raidersAlive = d.aliveCount(live, 'raider') > 0;
    const winnow = live.data.winnow;

    const phase = vestaWinnowPhase(now).phase;
    if (phase !== live.data.lastPhase) {
      if (phase === 'warning') {
        live.data.warned = true;
        d.emit('comms:log', {
          from: 'WINNOW LONGSHORE',
          text: 'Throat\u2019s live \u2014 stand clear the cone.',
          kind: 'encounter',
        });
      } else if (phase === 'discharge') {
        live.data.thrown = true;
        d.emit('comms:log', {
          from: 'WINNOW LONGSHORE',
          text: 'THERE GOES THE BATCH \u2014 east, ride it or leave it.',
          kind: 'encounter',
        });
      }
      live.data.lastPhase = phase;
    }

    if (!loadersAlive) {
      releaseCast(live);
      return d.resolve(live, 'crew_down', { speak: true });
    }

    if (!raidersAlive) {
      d.grant(190, 'winnow:claim_broken');
      d.rep('faction_dmc', 3, 'winnow_shift_held');
      d.emit('comms:log', {
        from: 'WINNOW LONGSHORE',
        text: 'Claim\u2019s clear. The throw owes you a pod or two \u2014 take what the cone left.',
        kind: 'encounter',
      });
      releaseCast(live);
      return d.resolve(live, 'claim_broken', { speak: true });
    }

    // The shift finished under pressure: a full throw happened and the batch physically
    // left the throat — thrown, collected, scattered; the machine keeps its rhythm either way.
    if (live.data.thrown && phase === 'calm') {
      const podIds = new Set(live.data.pods || []);
      let near = 0, gone = 0;
      const found = new Set();
      for (const e of state.entityList || []) {
        if (!e || !podIds.has(e.id)) continue;
        found.add(e.id);
        if (e.alive === false || !e.pos) { gone++; continue; }
        const dx = e.pos.x - winnow.x, dz = e.pos.z - winnow.z;
        if (dx > BATCH_EXIT_WU || dx * dx + dz * dz > 480 * 480) gone++;
        else near++;
      }
      gone += podIds.size - found.size; // despawned/collected pods are gone from the throat
      if (gone >= Math.max(1, Math.ceil(podIds.size * 0.6))) {
        releaseCast(live);
        return d.resolve(live, 'batch_away', { speak: true });
      }
    }

    if (now >= live.deadlineAt) {
      releaseCast(live);
      return d.resolve(live, 'shift_ended', { speak: false });
    }
  },
});

export default defineEncounter(trigger, {
  // Jettisoned cargo pods resolve pods/pod_cargo_container.glb at spawn — declare it so the
  // pending-item decode runway warms the pod body before telegraph resolves (the menu
  // crucible cohort only covers sessions that ran it).
  warmAssets: ['pods/pod_cargo_container.glb'],
  shape: {
    situation: 'claim',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
  motive: 'cargo_raid',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'THE WINNOW THROW',
  primaryLine: 'SHIFT WATCH: the winnow is loading — the throw goes east when the throat warns.',
  squad: {
    archetypes: ['corsair_raider', 'wasp_swarmer'],
    size: [2, 3],
    doctrine: 'thief',
    formation: 'loose',
  },
  civilian: {
    archetypes: ['mule_trader'],
    size: [2, 2],
    factionId: 'faction_dmc',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  bark: null,
  telegraph: 'The ore winnow is mid-cycle — a batch is gathering in the throat.',
  deadlineS: SHIFT_DEADLINE_S,
  aftermath: {
    flee: 'The jumpers pull off the lane. The winnow throws what is left of the batch.',
    kill: 'The throat is quiet. The next gather is already loading.',
  },
  receipts: {
    claim_broken: 'CLAIM BROKEN — the shift holds. Pods in the lane are salvage, not theft.',
    crew_down: 'CREW DOWN — the winnow throws an unclaimed batch on schedule.',
    batch_away: 'THE THROW — the batch went east. What the cone caught, the belt keeps.',
    shift_ended: 'Shift over. The winnow cycles on; the lane forgets the jumpers.',
  },
});
