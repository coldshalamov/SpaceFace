// 358 — THE PRESS CAMP (SEAM-BASE: the first destructible base in the world).
// A Reach forward camp riding a lawless pocket: one dockless station-typed base with a
// real hull, a raider garrison holding around it, a pressed captive mule held on the
// hardstand, and the press-gang's take parked in pods beside it. The base is an
// ordinary damageable body carrying
// `data.baseKind: 'pirate_base'` — killing it is the game's first live producer of
// `combat:baseDestroyed` (economy consumes it; sectorSim books base_destroyed instead
// of infrastructure_loss). Resolve the fight or don't: released or not, the camp stays
// a physical thing on the field until somebody breaks it.
import { deepFreeze, defineEncounter } from './catalog.js';
import { setEntityDoctrine } from '../../ai/doctrine.js';
import { occupantGenerationOf } from '../../core/entity.js';
import { ensurePhysicsBodySpec } from '../../core/physicsAuthority.js';

export const encounterOrder = 358;
export const trigger = deepFreeze({
  id: 'press_camp_raid',
  tier: 'minor',
  deck: 'combat',
  weight: 1.0,
  // Forward camps stand where a squad can live off the lane: outlaw pockets, the lanes
  // between, dead fields. Never inside a policed core.
  zoneTypes: ['outlaw_zone', 'ambush_lane', 'derelict_field'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 35,
  cooldownS: 1200,
  proximity: true,
  gates: {
    maxSecurity: 0.75,
    minSectorTier: 1,
    storyBeatMin: 1,
  },
});

const BASE_HULL = 1400;
const BASE_RADIUS = 42;
const BASE_BOUNTY_CR = 520;
const GUARD_PATROL_RADIUS = 130;
const RAID_DEADLINE_S = 130;

function releaseCast(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

// Live encounters are transient across Continue. References protect their original cast;
// the existing director owns save cleanup, receipts, and all durable consequences.
const campWitnesses = new WeakMap();

function witness(entity) {
  return { entity, generation: occupantGenerationOf(entity), ai: entity?.data?.ai,
    activity: entity?.data?.ai?.activity, body: entity?.physicsBody,
    intent: entity?.data?.intent, dead: false };
}

function original(state, record) {
  const entity = record?.entity;
  return entity && record.generation != null
    && state.entities.get(entity.id) === entity
    && occupantGenerationOf(entity) === record.generation ? entity : null;
}

function confirmedDead(state, record) {
  return record?.dead === true || original(state, record)?.alive === false;
}

function foreignCaptive(state, record, captive) {
  const ai = captive.data?.ai;
  const vesselId = captive.data?.vesselId;
  return captive.id === state.playerId || captive.id === state.player?.entityId
    || captive.isPlayer === true || captive.data?.shipjackParked === true
    || (vesselId != null && state.player?.ownedShips?.some(row => row?.vesselId === vesselId))
    || ai !== record.ai || ai?.activity !== record.activity
    || captive.physicsBody !== record.body || captive.data?.intent !== record.intent;
}

function freeCaptive(live, state, d, record) {
  const captive = original(state, record);
  if (!captive || captive.alive === false || foreignCaptive(state, record, captive)) return false;
  if (typeof d.helpers?.aiManeuver?.claimActivity !== 'function'
    || typeof d.helpers.aiManeuver.captureActivity !== 'function') return false;
  const cd = captive.data || (captive.data = {});
  const ai = cd.ai || (cd.ai = {});
  ai.forceFlee = true;
  ai.allowPassiveManeuver = true; // released civilians use the existing tactical helm, never offense
  ai.moraleImmune = false;
  // With the guards gone, retreat has no hostile contact to flee from. Its fallback
  // must be an exit bearing, not the obsolete held hardstand anchor.
  const camp = live.data.camp;
  const dx = captive.pos.x - camp.x, dz = captive.pos.z - camp.z;
  const length = Math.hypot(dx, dz);
  const ux = length > 0.001 ? dx / length : Math.cos(captive.rot || 0);
  const uz = length > 0.001 ? dz / length : Math.sin(captive.rot || 0);
  setEntityDoctrine(captive, {
    activity: { kind: 'flee', reason: 'press_camp:released', targetId: null,
      anchor: { x: captive.pos.x + ux * 960, z: captive.pos.z + uz * 960 },
      preferredRange: 0, leashRadius: 1440, encounterId: live.id },
    roe: 'hold_fire',
  });
  // The capture authority releases this exact activity before any subscriber can
  // flush its held thrust or serialize the newly owned hull. No durable listener.
  d.helpers.aiManeuver.claimActivity(captive, ai.activity, { onCapture: () => {
    ai.activity = null;
    if (ai.forceFlee === true) ai.forceFlee = false;
    if (ai.allowPassiveManeuver === true) ai.allowPassiveManeuver = false;
  } });
  cd.scanLabel = 'PRESSED CAPTIVE — RUNNING';
  d.emit('comms:log', {
    from: 'PRESSED MULE',
    text: 'Guns are off me \u2014 I am gone and I am never coming back this lane.',
    kind: 'encounter',
  });
  return true;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + (live.shape.deadlineS || RAID_DEADLINE_S);
    const anchor = live.plan && live.plan.zoneCenter;
    if (!anchor || !Number.isFinite(anchor.x)) return d.abort(live, 'no_zone_anchor');

    const ships = live.plan.ships || [];
    const captiveSpec = ships.find((sh) => sh && sh.role === 'hauler');
    const guardSpecs = ships.filter((sh) => sh && sh.role === 'raider');
    if (!captiveSpec || !guardSpecs.length) return d.abort(live, 'no_cast');

    // The garrison orbits the hardstand — parked close enough to read as one site.
    // The captive sits on the hardstand itself: a pressed mule held under the guns.
    const rng = d.stream(live, 'press_layout');
    captiveSpec.pos.x = anchor.x + 34;
    captiveSpec.pos.z = anchor.z + 20;
    guardSpecs.forEach((spec, i) => {
      const a = (i / Math.max(1, guardSpecs.length)) * Math.PI * 2 + rng() * 0.4;
      spec.pos.x = anchor.x + Math.cos(a) * (GUARD_PATROL_RADIUS + rng() * 50);
      spec.pos.z = anchor.z + Math.sin(a) * (GUARD_PATROL_RADIUS + rng() * 50);
    });

    // Ships first: every abort below this point happens while the base does not yet
    // exist. Stations never enter the movables lane, so a despawnAt stamp could never
    // retire one — spawning the camp only after the cast is confirmed is the leak fix.
    const ids = d.spawnShips(live, ships);
    if (!ids.length || d.aliveCount(live, 'raider') < 1 || d.aliveCount(live, 'hauler') < 1) {
      return d.abort(live, 'no_budget');
    }

    // The camp itself — a dockless station body with a real hull. `dockless` keeps it out
    // of dockStations (no berth UI, no traffic routing) and of station-service consumers
    // (no-fire bubbles, side-event anchors); `persistent` keeps it a world fixture.
    // team 1 matters: the kill path reads hostility off team, so burning a Reach camp
    // is a lawful hostile kill — never a witnessed unlawful_kill at the bounty desk.
    const base = d.helpers && d.helpers.spawnEntity
      ? d.helpers.spawnEntity({
        type: 'station',
        team: 1,
        factionId: 'faction_reach',
        pos: { x: anchor.x, z: anchor.z },
        vel: { x: 0, z: 0 },
        radius: BASE_RADIUS,
        mass: 1e6,
        hull: BASE_HULL,
        hullMax: BASE_HULL,
        collides: true,
        flags: { persistent: true },
        data: {
          baseKind: 'pirate_base',
          dockless: true,
          stationTypeId: 'pirate_camp',
          services: [],
          factionId: 'faction_reach',
          name: 'Reach Press Camp',
          scanLabel: 'PRESS CAMP — FORWARD BASE',
          bountyCr: BASE_BOUNTY_CR,
          encounter: true,
          encounterId: live.id,
          sectorId: live.sectorId || null,
        },
      })
      : null;
    if (!base) return d.abort(live, 'no_budget');
    live.ids.push(base.id);
    live.roles[base.id] = 'base';

    const captive = d.entsOf(live, 'hauler')[0];
    captive.vel = { x: 0, z: 0 };
    const capd = captive.data || (captive.data = {});
    capd.scanLabel = 'PRESSED CAPTIVE — HELD';
    const capai = capd.ai || (capd.ai = {});
    capai.moraleImmune = true; // a prisoner does not bolt while the guns still point
    setEntityDoctrine(captive, {
      activity: {
        kind: 'hail_hold',
        anchor: { x: captive.pos.x, z: captive.pos.z },
        preferredRange: 12,
        reason: 'press_camp:held',
        encounterId: live.id || null,
      },
      roe: 'hold_fire',
    });
    for (const g of d.entsOf(live, 'raider')) {
      const gd = g.data || (g.data = {});
      gd.scanLabel = 'CAMP GARRISON';
      // The camp is the anchor, not the squad slot — guards hold the site, not a lane.
      setEntityDoctrine(g, {
        activity: {
          kind: 'loiter',
          anchor: { x: anchor.x, z: anchor.z },
          preferredRange: GUARD_PATROL_RADIUS + 60,
          reason: 'press_camp:garrison',
          encounterId: live.id || null,
        },
        roe: 'weapons_free',
      });
      if (gd.combat) gd.combat.targetId = (d.player() && d.player().id) || null;
    }

    // The take: press-ganged freight parked on the hardstand, owned by nobody who can
    // still complain. Scooping it is salvage, not robbery.
    live.data.pods = [];
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2;
      const r = BASE_RADIUS + 26 + rng() * 30;
      const pod = d.spawnCargoPod(live, {
        commodityId: i === 0 ? 'cmdty_stolen_goods' : (i === 1 ? 'cmdty_ore_copper' : 'cmdty_weapons'),
        amount: 2,
        pos: { x: anchor.x + Math.cos(a) * r, z: anchor.z + Math.sin(a) * r },
        vel: { x: 0, z: 0 },
        ownerName: 'PRESS-GANG TAKE',
        factionId: 'faction_reach',
      });
      if (pod && pod.id != null) live.data.pods.push(pod.id);
    }

    live.data.baseId = base.id;
    live.data.captiveId = captive.id;
    live.data.camp = { x: anchor.x, z: anchor.z };
    ensurePhysicsBodySpec(captive); // normalize once before retaining the original body identity
    campWitnesses.set(live, { base: witness(base), captive: witness(captive),
      guards: d.entsOf(live, 'raider').map(witness), settling: false });
    live.phase = 'conflict';
    d.say(live, 'alert',
      'LANE WATCH: a press camp is standing off the lane — a real base, guarded, with the take on the hardstand.',
      null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const proof = campWitnesses.get(live);
    if (!proof || proof.settling || live.phase === 'done' || name !== 'squadKill'
      || d._saveRestoring || state.encounterDirector?.live?.[live.id] !== live) return;
    for (const record of [proof.base, ...proof.guards]) {
      const entity = original(state, record);
      if (entity && entity.id === payload?.id && entity.alive === false) record.dead = true;
    }
  },

  tick(d, live, state, now) {
    if (live.phase === 'done' || d._saveRestoring
      || state.encounterDirector?.live?.[live.id] !== live) return;
    const proof = campWitnesses.get(live);
    if (proof?.settling) return;
    // Absence, storage, a recycled id, or an unprovable legacy live row is not a kill.
    const baseDead = confirmedDead(state, proof?.base);
    const base = original(state, proof?.base);
    const guardsKnown = proof?.guards?.length > 0 && proof.guards.every(record =>
      confirmedDead(state, record) || original(state, record));
    const guardsDead = guardsKnown && proof.guards.every(record => confirmedDead(state, record));
    if (!baseDead && (!base || !guardsKnown)) {
      if (proof) proof.settling = true;
      else campWitnesses.set(live, { settling: true });
      releaseCast(live);
      return d.resolve(live, 'contact_lost', { speak: true });
    }

    if (baseDead) {
      proof.settling = true;
      const freed = freeCaptive(live, state, d, proof.captive);
      d.grant(120, 'press_camp:base_burned');
      d.rep('faction_reach', -3, 'press_camp_burned');
      if (freed) d.rep('faction_free', 2, 'press_camp_captive_freed');
      d.emit('comms:log', {
        from: 'LANE WATCH',
        text: 'The camp is down. Whatever the press-gang was building out here just became salvage.',
        kind: 'encounter',
      });
      releaseCast(live);
      return d.resolve(live, 'base_destroyed', { speak: true });
    }

    // Garrison broken but the hardstand still stands: the camp stays a physical,
    // killable world body — released, not stamped. It can be finished off later.
    if (guardsDead) {
      proof.settling = true;
      freeCaptive(live, state, d, proof.captive);
      d.emit('comms:log', {
        from: 'LANE WATCH',
        text: 'Garrison\u2019s gone but the camp still stands \u2014 it only burns if somebody burns it.',
        kind: 'encounter',
      });
      releaseCast(live);
      return d.resolve(live, 'garrison_broken', { speak: true });
    }

    if (now >= live.deadlineAt) {
      proof.settling = true;
      releaseCast(live);
      return d.resolve(live, 'raid_over', { speak: false });
    }
  },
});

export default defineEncounter(trigger, {
  // Jettisoned cargo pods resolve pods/pod_cargo_container.glb at spawn — declare it so the
  // pending-item decode runway warms the pod body before telegraph resolves (the menu
  // crucible cohort only covers sessions that ran it).
  warmAssets: ['pods/pod_cargo_container.glb'],
  shape: {
    situation: 'hunt',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
  motive: 'area_control_interdiction',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'THE PRESS CAMP',
  primaryLine: 'LANE WATCH: a press camp is standing off the lane — a real base, guarded, with the take on the hardstand.',
  squad: {
    archetypes: ['corsair_raider', 'wasp_swarmer'],
    size: [3, 4],
    doctrine: 'anchor',
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
  telegraph: 'A Reach press camp holds a pocket off the lane — garrison on station.',
  deadlineS: RAID_DEADLINE_S,
  aftermath: {
    flee: 'The camp keeps its pocket. The take stays on the hardstand.',
    kill: 'The camp burns. The pocket forgets the press-gang\u2019s name.',
  },
  receipts: {
    base_destroyed: 'BASE DESTROYED — the first press camp to burn; the take is salvage now.',
    garrison_broken: 'GARRISON BROKEN — the camp still stands, unguarded and very flammable.',
    raid_over: 'The raid never came. The camp works its pocket another night.',
    contact_lost: 'CONTACT LOST — no camp destruction or captive release was confirmed.',
  },
});
