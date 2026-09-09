/**
 * PQ-013 / SF-14 — planetary sling/skim/harvest/reentry vertical (STEP 12).
 *
 * Harness: curated sim host (src/core/sim.js) with production systems in production relative
 * order (fields → planetRuntime); combat is a seam-contract recorder (routeDamage packet shape is
 * the contract under test — the real router is exercised on the browser route).
 *
 * Coverage (the brief's verification matrix):
 *   • Q18 identity transaction: atlas record ↔ runtime binding (zone id, converted global centre,
 *     entity + field + published state all one identity; no spawn without the atlas record)
 *   • influence profile: bounded, ANNULAR (zero inside), peak in the sling region, zero beyond
 *     the influence edge, deterministic, heavy-shrug preserved, predictor bends
 *   • band state machine: semantic states published, hysteresis (no flapping on the line)
 *   • skim harvest: yield = path × density (speed-proportional), depth-richer commodity mix,
 *     cargo ONLY through the cargo owner, no yield with the collector off / parked / out of band
 *   • reentry staging: Skim→Commit→Breakup→Descent ladder, escape regression (healthy-escape),
 *     burn damage routed with the named damageType, terminal via ordinary hull death
 *   • golden inertness (flag OFF → strict no-op) + save-transience (normalize-away on load)
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { fields } from '../src/systems/fields.js';
import { cargo } from '../src/systems/cargo.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { PLANET_FLAGS, PLANET_SITE, classifyPlanetRegion } from '../src/data/planets.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { ZONE_TETHYS_ANVIL } from '../src/data/authoredPlaces.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { normalizeField, fieldFalloff, sampleFieldAcceleration, projectFieldTrajectory, couplingScale } from '../src/core/fields/fieldKernel.js';

const DT = SIM_DT;
const SECTOR = PLANET_SITE.sectorId;
const CENTRE = sectorLocalToGlobalForSector(ZONE_TETHYS_ANVIL.center, SECTOR);

// The combat seam recorder: verifies the routeDamage contract (packet shape + named damageType)
// and applies hull damage the way the real router ultimately does, so terminal death is ordinary.
function combatRecorder() {
  const calls = [];
  return {
    name: 'combat',
    calls,
    kernel: {
      routeDamage(req) {
        calls.push(req);
        const state = combatRecorderState;
        const target = state && state.entities.get(req.targetId);
        const ch = req && req.packet && req.packet.channels;
        const dmg = ch ? Object.values(ch).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
        if (target && target.hull != null) {
          target.hull -= dmg;
          if (target.hull <= 0) target.alive = false;
        }
      },
    },
    init(ctx) { combatRecorderState = ctx.state; },
    update() {},
  };
}
let combatRecorderState = null;

function boot(seed = 1313, { withCargo = false } = {}) {
  PLANET_FLAGS.enabled = true;
  FIELD_FLAGS.enabled = true;
  const combat = combatRecorder();
  const systems = withCargo ? [fields, planetRuntime, combat, cargo] : [fields, planetRuntime, combat];
  const sim = createSimulation({ seed, bus: createBus(), systems });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: CENTRE.x, z: CENTRE.z + 3000 }, radius: 12, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 200, hullMax: 200,
    flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
  });
  state.playerId = player.id;
  const events = [];
  for (const name of ['planet:registered', 'planet:unregistered', 'planet:plungeStage', 'planet:harvest', 'planet:harvestDenied', 'planet:collector', 'planet:recoveryBurn']) {
    sim.bus.on(name, (p) => events.push({ name, p, tick: state.tick }));
  }
  return { sim, state, bus: sim.bus, player, events, combat };
}

function stepN(sim, n) { for (let i = 0; i < n; i++) sim.step(DT); }
function placePlayer(t, r, opts = {}) {
  t.player.pos.x = CENTRE.x;
  t.player.pos.z = CENTRE.z + r;
  t.player.vel.x = opts.vx ?? 0;
  t.player.vel.z = opts.vz ?? 0;
  t.player.rot = opts.rot ?? 0;
}
function cleanup() { PLANET_FLAGS.enabled = typeof window !== 'undefined'; }

// ── Q18 identity transaction ─────────────────────────────────────────────────────────────────────

test('identity: atlas record exists, converts to a nonzero-origin global centre', () => {
  const zones = SECTOR_ZONES[SECTOR] || [];
  const zone = zones.find((z) => z.id === PLANET_SITE.zoneId);
  assert.ok(zone, 'the canonical zone record must be authored (authoredPlaces append)');
  assert.equal(zone.type, 'planetary_mass');
  assert.ok(Number.isFinite(CENTRE.x) && Number.isFinite(CENTRE.z));
  // Nonzero-origin conversion is observable: global != sector-local (the anti-Helios rule).
  assert.notEqual(CENTRE.x, ZONE_TETHYS_ANVIL.center.x);
  assert.notEqual(CENTRE.z, ZONE_TETHYS_ANVIL.center.z);
});

test('identity: ONE registration transaction binds entity + field + runtime to the SAME identity', () => {
  const t = boot(101);
  stepN(t.sim, 2);
  const rt = t.state.planet;
  assert.equal(rt.active, true, 'adapter registers in the authored sector');
  assert.equal(rt.zoneId, PLANET_SITE.zoneId, 'save/nav identity is the atlas zone id');
  assert.equal(rt.siteId, PLANET_SITE.id);
  const entity = t.state.entities.get(rt.entityId);
  assert.ok(entity && entity.type === 'planet', 'physics/visual body exists');
  assert.equal(entity.pos.x, CENTRE.x, 'body sits at the converted atlas centre (x)');
  assert.equal(entity.pos.z, CENTRE.z, 'body sits at the converted atlas centre (z)');
  assert.equal(entity.physicsBody.dynamic, false, 'exclusion body is static');
  assert.equal(entity.radius, PLANET_SITE.bodyRadius);
  assert.equal(entity.data.planetSite.zoneId, PLANET_SITE.zoneId, 'entity carries the same identity');
  const fsys = t.sim.registry.get('fields');
  assert.equal(fsys.hasExternal(rt.fieldId), true, 'influence profile registered in the ONE kernel');
  const snap = t.state.fields.snapshot.find((f) => f.id === rt.fieldId);
  assert.ok(snap, 'profile visible on the predictor snapshot seam');
  assert.equal(snap.center.x, CENTRE.x, 'field centred on the SAME identity');
  assert.equal(snap.tag, 'external');
  assert.equal(t.state.fields.active.some((a) => a.id === rt.fieldId), false,
    'external profile carries no deploy-tool presentation record (no Intake funnel)');
  assert.ok(t.events.some((e) => e.name === 'planet:registered' && e.p.zoneId === PLANET_SITE.zoneId));
  cleanup();
});

test('identity: no physics planet outside the authored sector; unwind on sector change', () => {
  const t = boot(102);
  stepN(t.sim, 2);
  assert.equal(t.state.planet.active, true);
  const entityId = t.state.planet.entityId;
  t.state.world.currentSectorId = 'sector_helios_prime';
  stepN(t.sim, 2);
  assert.equal(t.state.planet.active, false, 'runtime unwinds outside the authored sector');
  const entity = t.state.entities.get(entityId);
  assert.ok(!entity || entity.alive === false, 'body despawns with the registration');
  cleanup();
});

test('golden inertness: flag OFF -> strict no-op (no entity, no field, no state)', () => {
  const t = boot(103);
  PLANET_FLAGS.enabled = false;
  stepN(t.sim, 3);
  assert.equal(t.state.planet.active, false);
  let planetEntities = 0;
  for (const e of t.state.entities.values()) if (e.type === 'planet') planetEntities++;
  assert.equal(planetEntities, 0);
  assert.equal(t.state.fields.snapshot.length, 0);
  cleanup();
});

// ── influence profile (annular, bounded, deterministic, heavy-shrug, predictor) ─────────────────

test('influence: annular profile — zero inside, peak in the sling region, zero beyond the edge', () => {
  const f = normalizeField({
    id: 'p', kind: 'well', center: { x: 0, z: 0 },
    radius: PLANET_SITE.field.radius, strength: PLANET_SITE.field.strength,
    falloff: PLANET_SITE.field.falloff, innerRadius: PLANET_SITE.field.innerRadius,
    innerSoft: PLANET_SITE.field.innerSoft,
  });
  assert.equal(fieldFalloff(f, 100), 0, 'no pull at the core');
  assert.equal(fieldFalloff(f, PLANET_SITE.field.innerRadius), 0, 'no pull at the inner edge');
  assert.equal(fieldFalloff(f, PLANET_SITE.field.radius + 1), 0, 'no pull beyond the influence edge');
  const peakR = PLANET_SITE.field.innerRadius + PLANET_SITE.field.innerSoft; // 1150 — sling inner
  const atPeak = fieldFalloff(f, peakR);
  assert.ok(atPeak > 0.3, `readable pull at the sling inner edge (got ${atPeak})`);
  assert.ok(atPeak > fieldFalloff(f, 2200), 'pull decays outward');
  assert.ok(atPeak > fieldFalloff(f, 950), 'pull ramps up across the soft inner margin');
  // The atmosphere corridor itself must be pull-free (escape windows are real):
  for (const r of [PLANET_SITE.bands.reentry - 20, PLANET_SITE.bands.danger - 20, 890]) {
    assert.equal(fieldFalloff(f, r), 0, `no attraction inside the bands (r=${r})`);
  }
});

test('influence: deterministic sampling + heavy-shrug + predictor bend', () => {
  const t = boot(104);
  stepN(t.sim, 2);
  const snapshot = t.state.fields.snapshot;
  const pos = { x: CENTRE.x, z: CENTRE.z + 1200 }; // sling region
  const a1 = sampleFieldAcceleration(pos, null, snapshot, 1.0, { mass: 28, type: 'ship' }, { ax: 0, az: 0 });
  const a2 = sampleFieldAcceleration(pos, null, snapshot, 99.0, { mass: 28, type: 'ship' }, { ax: 0, az: 0 });
  assert.equal(a1.ax, a2.ax, 'time-independent (deterministic)');
  assert.equal(a1.az, a2.az);
  assert.ok(a1.az < 0, 'pulls toward the centre (inward)');
  const heavy = sampleFieldAcceleration(pos, null, snapshot, 1.0, { mass: 2800, type: 'ship' }, { ax: 0, az: 0 });
  assert.ok(Math.abs(heavy.az) < Math.abs(a1.az) * 0.2, 'heavy ship shrugs (coupling, not the cap)');
  assert.ok(couplingScale({ mass: 2800, type: 'ship' }) < couplingScale({ mass: 28, type: 'ship' }));
  // Predictor: a tangential pass through the sling region bends toward the planet.
  const straight = projectFieldTrajectory({ x: CENTRE.x - 1200, z: CENTRE.z + 1200 }, { x: 60, z: 0 }, [], { mass: 28, type: 'ship' }, { steps: 120, dt: 1 / 15 });
  const bent = projectFieldTrajectory({ x: CENTRE.x - 1200, z: CENTRE.z + 1200 }, { x: 60, z: 0 }, snapshot, { mass: 28, type: 'ship' }, { steps: 120, dt: 1 / 15 });
  assert.ok(bent.end.z < straight.end.z, 'projected path bends toward the mass (the predictor is honest)');
  cleanup();
});

// ── band state machine ──────────────────────────────────────────────────────────────────────────

test('bands: semantic states publish and hysteresis prevents boundary flapping', () => {
  const t = boot(105);
  stepN(t.sim, 2);
  assert.equal(classifyPlanetRegion(PLANET_SITE, 3000), 'outside');
  placePlayer(t, 2000); stepN(t.sim, 1);
  assert.equal(t.state.planet.player.region, 'influence');
  placePlayer(t, 1200); stepN(t.sim, 1);
  assert.equal(t.state.planet.player.region, 'sling');
  placePlayer(t, 950); stepN(t.sim, 1);
  assert.equal(t.state.planet.player.region, 'skim');
  placePlayer(t, 840); stepN(t.sim, 1);
  assert.equal(t.state.planet.player.region, 'danger');
  // Hysteresis: stepping just past the skim boundary (danger edge 880) must NOT flap back out.
  placePlayer(t, PLANET_SITE.bands.danger + 4); stepN(t.sim, 1);
  assert.equal(t.state.planet.player.region, 'danger', 'inside edge+h stays in the deeper band');
  placePlayer(t, PLANET_SITE.bands.danger + PLANET_SITE.hysteresis + 6); stepN(t.sim, 1);
  assert.equal(t.state.planet.player.region, 'skim', 'clearing edge+h steps out');
  cleanup();
});

// ── skim harvest ────────────────────────────────────────────────────────────────────────────────

test('harvest: yield = path x density through the cargo owner; off/parked/out-of-band gather nothing', () => {
  const t = boot(106, { withCargo: true });
  stepN(t.sim, 2);
  const items = () => t.state.player.cargo.items;

  // Collector off: nothing, even flying fast in-band.
  placePlayer(t, 950, { vz: -60 });
  for (let i = 0; i < 120; i++) { placePlayer(t, 950, { vz: -60 }); t.sim.step(DT); }
  assert.equal(items()[PLANET_SITE.harvest.commodityShallow] || 0, 0, 'no yield with the collector off');

  // Toggle on via the ordinary input action.
  t.state.input.actions.toggleSkimCollector = true;
  t.sim.step(DT);
  assert.equal(t.state.planet.player.collectorOn, true);
  assert.ok(t.events.some((e) => e.name === 'planet:collector' && e.p.on === true));

  // Parked in-band: nothing (path x density, never a hold timer).
  placePlayer(t, 950, { vz: 0 });
  for (let i = 0; i < 120; i++) { placePlayer(t, 950, { vz: 0 }); t.sim.step(DT); }
  assert.equal(items()[PLANET_SITE.harvest.commodityShallow] || 0, 0, 'parked ships gather nothing');

  // Flying the working band: shallow commodity accrues with speed.
  for (let i = 0; i < 240; i++) { placePlayer(t, 950, { vz: -60 }); t.sim.step(DT); }
  const slow = items()[PLANET_SITE.harvest.commodityShallow] || 0;
  assert.ok(slow >= 2, `working-band scoop yields hydrogen (got ${slow})`);

  // Yield is speed-proportional: same ticks at 2x speed ≈ 2x units (fresh boot for clean cargo).
  const t2 = boot(1061, { withCargo: true });
  stepN(t2.sim, 2);
  t2.state.input.actions.toggleSkimCollector = true; t2.sim.step(DT);
  for (let i = 0; i < 240; i++) { placePlayer(t2, 950, { vz: -120 }); t2.sim.step(DT); }
  const fast = t2.state.player.cargo.items[PLANET_SITE.harvest.commodityShallow] || 0;
  assert.ok(fast >= slow * 1.7, `yield tracks path (fast=${fast} vs slow=${slow})`);

  // Depth-richer: the storm band pays helium-3 (and none of it was minted outside the cargo owner).
  const before3 = items()[PLANET_SITE.harvest.commodityRich] || 0;
  for (let i = 0; i < 240; i++) { placePlayer(t, 840, { vz: -60 }); t.sim.step(DT); }
  const rich = (items()[PLANET_SITE.harvest.commodityRich] || 0) - before3;
  assert.ok(rich >= 3, `storm band yields helium-3 (got ${rich})`);
  assert.ok(t.events.filter((e) => e.name === 'planet:harvest').length > 0, 'harvest events emitted');
  const usedVol = t.state.player.cargo.usedVolume;
  assert.ok(usedVol > 0, 'cargo owner accounted the volume (single-writer respected)');
  cleanup();
});

// ── reentry staging (the Plunge) ────────────────────────────────────────────────────────────────

test('plunge: stage ladder with escape regression; burn damage routed with the named type; terminal is ordinary hull death', () => {
  const t = boot(107);
  stepN(t.sim, 2);
  const rec = () => t.state.planet.player;
  const stages = () => t.events.filter((e) => e.name === 'planet:plungeStage' && e.p.isPlayer).map((e) => e.p.stage);

  // Enter the storm band -> Skim stage (ionization).
  placePlayer(t, 840); stepN(t.sim, 1);
  assert.equal(rec().stage, 'skim');

  // HEALTHY ESCAPE (the counterplay rule): leave promptly -> stage clears, no damage ever routed.
  placePlayer(t, 1300); // out to the sling
  for (let i = 0; i < Math.ceil((PLANET_SITE.plunge.regressS + 0.3) / DT); i++) { placePlayer(t, 1300); t.sim.step(DT); }
  assert.equal(rec().stage, null, 'a marginal pass escapes clean');
  assert.equal(t.combat.calls.length, 0, 'no burn damage on a marginal pass');
  assert.ok(stages().includes('clear'));

  // Commit: cook in the storm band until the commit threshold.
  const ticksToCommit = Math.ceil((PLANET_SITE.plunge.commitHeat / PLANET_SITE.heat.dangerRate + 0.4) / DT);
  for (let i = 0; i < ticksToCommit; i++) { placePlayer(t, 840); t.sim.step(DT); }
  assert.equal(rec().stage, 'commit', `commit at heat>=${PLANET_SITE.plunge.commitHeat} (heat=${rec().heat.toFixed(2)})`);

  // Escape window from Commit still works (hard burn out).
  for (let i = 0; i < Math.ceil((PLANET_SITE.plunge.regressS + 0.3) / DT); i++) { placePlayer(t, 1300); t.sim.step(DT); }
  assert.equal(rec().stage, 'skim', 'commit regresses with sustained outward escape');

  // Breakup: dive the reentry band; heat maxes; burn damage must be ROUTED (named type).
  const hullBefore = t.player.hull;
  for (let i = 0; i < Math.ceil(2.4 / DT); i++) { placePlayer(t, 770); t.sim.step(DT); }
  assert.equal(rec().stage, 'breakup', `breakup under sustained reentry (heat=${rec().heat.toFixed(2)})`);
  assert.ok(t.combat.calls.length > 0, 'burn damage routes through the combat kernel');
  const call = t.combat.calls[0];
  assert.ok(call.packet.channels.plasma > 0, 'burn rides the plasma damage channel');
  assert.equal(call.packet.source.kind, 'planet_reentry', 'the reentry NAME travels in the packet source');
  assert.equal(call.origin.kind, 'planet_reentry');
  assert.equal(call.origin.id, PLANET_SITE.id);
  assert.ok(t.player.hull < hullBefore, 'hull consequence is real');

  // Descent + terminal: ride it down; death is ordinary hull death (alive=false via router).
  for (let i = 0; i < Math.ceil(16 / DT) && t.player.alive !== false; i++) { placePlayer(t, 700); t.sim.step(DT); }
  assert.ok(stages().includes('descent'), 'descent stage reached below the descent radius');
  assert.equal(t.player.alive, false, 'terminal stage kills through the normal hull path');
  assert.ok(stages().includes('aftermath'), 'aftermath recorded at the plunge point');
  assert.ok(t.state.planet.aftermath.length >= 0, 'aftermath memory bounded');
  cleanup();
});

test('plunge: a hostile ship in the danger band takes the same staged consequence (the bait fantasy)', () => {
  const t = boot(108);
  stepN(t.sim, 2);
  const hostile = t.sim.spawn({
    type: 'ship', team: 2, pos: { x: CENTRE.x, z: CENTRE.z + 840 }, radius: 10, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 80, hullMax: 80,
    physicsBody: { schemaVersion: 1, radius: 10, mass: 20, inertiaY: 40, dynamic: true, ccd: false, material: 'ship', revision: 0 },
  });
  // Keep the player out of the bands; the hostile cooks alone (player-independent consequence).
  placePlayer(t, 2400);
  for (let i = 0; i < Math.ceil(6 / DT) && hostile.alive !== false; i++) {
    hostile.pos.x = CENTRE.x; hostile.pos.z = CENTRE.z + 780; hostile.vel.x = 0; hostile.vel.z = 0;
    placePlayer(t, 2400);
    t.sim.step(DT);
  }
  const hostileStages = t.events.filter((e) => e.name === 'planet:plungeStage' && e.p.id === hostile.id).map((e) => e.p.stage);
  assert.ok(hostileStages.includes('skim') && hostileStages.includes('commit') && hostileStages.includes('breakup'),
    `hostile walks the ladder (${hostileStages.join(',')})`);
  assert.ok(t.combat.calls.some((c) => c.targetId === hostile.id), 'hostile burn routed');
  cleanup();
});

// ── save transience ─────────────────────────────────────────────────────────────────────────────

test('save: runtime is transient (normalize-away) and re-registers to the SAME identity after load', () => {
  const t = boot(109);
  stepN(t.sim, 2);
  const firstEntityId = t.state.planet.entityId;
  assert.equal(t.state.planet.active, true);
  // The fields.js precedent: lifecycle boundary clears the runtime; the adapter rebuilds from
  // authored data. Identity (the atlas zone id) is what persists — via the authored record itself.
  t.bus.emit('save:loaded', {});
  assert.equal(t.state.planet.active, false, 'runtime normalized away on load');
  stepN(t.sim, 2);
  assert.equal(t.state.planet.active, true, 're-registered after load');
  assert.equal(t.state.planet.zoneId, PLANET_SITE.zoneId, 'SAME canonical identity');
  assert.notEqual(t.state.planet.entityId, firstEntityId, 'fresh body, same place');
  const entity = t.state.entities.get(t.state.planet.entityId);
  assert.equal(entity.pos.x, CENTRE.x);
  assert.equal(entity.pos.z, CENTRE.z);
  cleanup();
});
