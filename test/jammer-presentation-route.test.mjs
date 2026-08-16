import assert from 'node:assert/strict';
import test from 'node:test';

import JAMMER_ENCOUNTER from '../src/data/encounters/350-specialist-jammer-wing.js';
import { solveIntercept } from '../src/core/flight/flightTelemetry.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import {
  JAMMER_MAX_SMEAR_WU,
  JAMMER_TRUTH_RADIUS_WU,
  collectActiveRadarJammers,
  writeRadarJammedContactPosition,
} from '../src/presentation/radarJamming.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { planEncounterShape } from '../src/systems/encounterDirector.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import {
  writeRadarContactDrawPosition,
  writeRadarLeadDrawPosition,
} from '../src/ui/radar.js';

function canvasStub() {
  const context = {
    createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    putImageData() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {}, fillText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {}, clip() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, measureText() { return { width: 10 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  return { width: 256, height: 256, getContext: () => context };
}

globalThis.document ||= { createElement: () => canvasStub() };
globalThis.__SF_VISUAL_FACTORY_THROW__ = true;

function entityFromSpec(id, spec) {
  return {
    id,
    alive: true,
    type: spec.type,
    team: spec.team,
    pos: { x: spec.pos.x, z: spec.pos.z },
    vel: { x: 0, z: 0 },
    data: structuredClone(spec.data),
  };
}

function truthProjection(contact, player, radarScale = 86 / 4000, center = 90) {
  return {
    x: center - (contact.pos.x - player.pos.x) * radarScale,
    y: center - (contact.pos.z - player.pos.z) * radarScale,
  };
}

test('ordinary encounter 350 realizes the live Jammer identity used by radar presentation', () => {
  const zone = zonesForSector('sector_pallas_drift')
    .find((candidate) => JAMMER_ENCOUNTER.zoneTypes.includes(candidate.type));
  assert.ok(zone, 'a production sector offers the authored broken-rock route');
  const planned = planEncounterShape(JAMMER_ENCOUNTER, zone, zone.sectorId, 0, 350, () => 0.25);
  const anchor = planned.ships.find((ship) => ship.compositionRole === 'identity_anchor');
  assert.equal(anchor?.archetype, 'jammer_specialist');

  const spec = makeEnemySpawnSpec(anchor.archetype, anchor.level, anchor.pos, {
    factionId: anchor.factionId,
  });
  assert.equal(spec.data.lootTableId, 'jammer_specialist');
  assert.equal(spec.data.specialistBehavior, undefined, 'the spawn carries no mutable jammer sim state');
});

test('live radar seam smears only presentation while sim, targeting, controls, and weapons stay byte-identical', () => {
  const player = {
    id: 'player', type: 'ship', team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 7, z: -3 },
    data: { input: { thrust: 0.7 }, weapons: [{ id: 'wpn_pulse_laser_s', _cooldown: 0 }] },
  };
  const jammer = entityFromSpec(
    'jammer-route-350',
    makeEnemySpawnSpec('jammer_specialist', 5, { x: 980, z: 140 }),
  );
  const escort = entityFromSpec(
    'escort-route-350',
    makeEnemySpawnSpec('reaver_pirate', 5, { x: 1080, z: 260 }),
  );
  const stateTruth = {
    playerTargetId: escort.id,
    player: structuredClone(player),
    jammer: structuredClone(jammer),
    escort: structuredClone(escort),
  };
  const before = JSON.stringify(stateTruth);
  const jammers = collectActiveRadarJammers([escort, jammer], []);
  const truth = truthProjection(escort, player);
  const first = writeRadarContactDrawPosition(
    {}, escort, player, jammers, 180, 86 / 4000, 90,
  );
  const sameFrame = writeRadarContactDrawPosition(
    {}, escort, player, jammers, 180, 86 / 4000, 90,
  );

  assert.equal(first.jammed, true);
  assert.deepEqual(first, sameFrame, 'stable ids plus sim tick make a replayable radar frame');
  assert.ok(Math.hypot(first.canvasX - truth.x, first.canvasY - truth.y) > 2.5,
    'ignoring the antenna hull at range visibly separates the return from truth');
  assert.ok(Math.hypot(first.offsetX, first.offsetZ) <= JAMMER_MAX_SMEAR_WU + 1e-9,
    'presentation error remains inside the authored hard bound');

  const physicalLead = solveIntercept(
    player.pos, player.vel, escort.pos, escort.vel, 360,
  );
  const physicalLeadBefore = structuredClone(physicalLead);
  const leadDisplay = writeRadarLeadDrawPosition(
    {}, physicalLead.aimPoint, first, player, 86 / 4000, 90, 86, 4000 * 4000,
  );
  const truthfulLead = truthProjection({ pos: physicalLead.aimPoint }, player);
  assert.equal(first.canvasX - truth.x, leadDisplay.canvasX - truthfulLead.x,
    'the selected marker and its live lead cue share exactly one radar-only X error');
  assert.equal(first.canvasY - truth.y, leadDisplay.canvasY - truthfulLead.y,
    'the selected marker and its live lead cue share exactly one radar-only Y error');
  assert.deepEqual(physicalLead, physicalLeadBefore, 'the physical solveIntercept result remains exact');
  assert.equal(JSON.stringify(stateTruth), before, 'the projection cannot mutate simulation-owned values');
  assert.deepEqual(player.pos, { x: 0, z: 0 });
  assert.deepEqual(player.data.input, { thrust: 0.7 });
  assert.deepEqual(player.data.weapons, [{ id: 'wpn_pulse_laser_s', _cooldown: 0 }]);
});

test('closing, killing, or removing the Jammer restores exact radar truth immediately', () => {
  const player = { id: 'player', type: 'ship', team: 0, pos: { x: 0, z: 0 } };
  const jammer = entityFromSpec(
    'jammer-route-350',
    makeEnemySpawnSpec('jammer_specialist', 5, { x: 900, z: 0 }),
  );
  const contact = entityFromSpec(
    'escort-route-350',
    makeEnemySpawnSpec('wasp_swarmer', 5, { x: 940, z: 30 }),
  );
  let jammers = collectActiveRadarJammers([jammer, contact], []);
  const ranged = writeRadarJammedContactPosition({}, contact, player, jammers, 120);
  assert.equal(ranged.jammed, true);

  player.pos.x = contact.pos.x - JAMMER_TRUTH_RADIUS_WU;
  player.pos.z = contact.pos.z;
  const close = writeRadarJammedContactPosition({}, contact, player, jammers, 120);
  assert.deepEqual(
    { x: close.x, z: close.z, jammed: close.jammed },
    { x: contact.pos.x, z: contact.pos.z, jammed: false },
    'the physical close-range counter produces exact contact truth',
  );

  player.pos.x = 0;
  jammer.alive = false;
  jammers = collectActiveRadarJammers([jammer, contact], jammers);
  const killed = writeRadarJammedContactPosition({}, contact, player, jammers, 121);
  assert.deepEqual({ x: killed.x, z: killed.z, jammed: killed.jammed },
    { x: contact.pos.x, z: contact.pos.z, jammed: false });

  jammer.alive = true;
  const removed = writeRadarJammedContactPosition({}, contact, player, [], 121);
  assert.deepEqual({ x: removed.x, z: removed.z, jammed: removed.jammed },
    { x: contact.pos.x, z: contact.pos.z, jammed: false });
});

test('reduced motion freezes the bounded smear without weakening its close-range counter', () => {
  const player = { id: 'player', type: 'ship', team: 0, pos: { x: 0, z: 0 } };
  const jammer = entityFromSpec('jammer', makeEnemySpawnSpec('jammer_specialist', 4, { x: 900, z: 100 }));
  const contact = entityFromSpec('wing', makeEnemySpawnSpec('reaver_pirate', 4, { x: 1050, z: 100 }));
  const jammers = [jammer];
  const a = writeRadarJammedContactPosition({}, contact, player, jammers, 1, true);
  const b = writeRadarJammedContactPosition({}, contact, player, jammers, 9000, true);
  assert.deepEqual(a, b, 'reduced motion holds one deterministic static return');
  assert.equal(a.jammed, true);

  const animatedA = writeRadarJammedContactPosition({}, contact, player, jammers, 18, false);
  const animatedB = writeRadarJammedContactPosition({}, contact, player, jammers, 36, false);
  assert.notDeepEqual(
    [animatedA.offsetX, animatedA.offsetZ],
    [animatedB.offsetX, animatedB.offsetZ],
    'ordinary presentation advances only from the simulation tick',
  );
});

test('the production Jammer hull carries a rooted hard-geometry world tell', () => {
  const jammer = entityFromSpec(
    'jammer-route-350',
    makeEnemySpawnSpec('jammer_specialist', 5, { x: 900, z: 100 }),
  );
  jammer.radius = 16;
  jammer.factionId = 'faction_reach';
  const canonicalFactory = installVisualOverrides(createVisualFactory(), {
    authoredShips: true,
    directAuthoredMount: true,
  });
  const visual = canonicalFactory.build(jammer);
  assert.equal(visual.userData.specialistPresentationId, 'jammer_specialist');
  assert.deepEqual(visual.userData.jammerWorldTell, {
    cue: 'antenna_fan_and_static_shimmer',
    geometry: 'rooted_five_boom_fan_with_hard_broken_world_combs',
    cameraFacing: false,
    animatedOpacity: false,
  });
  const fan = visual.getObjectByName('JammerAntennaFan');
  const comb = visual.getObjectByName('JammerStaticShimmerComb');
  assert.ok(fan, 'the antenna fan remains a distinct rooted assembly after static batching');
  assert.ok(comb?.isLineSegments, 'the shimmer is hard world-space line geometry');
  assert.ok(comb.geometry.getAttribute('position').count >= 32, 'the static comb has readable structure');
  let forbidden = 0;
  fan.traverse((child) => {
    if (child.isSprite || child.isPoints || child.material?.transparent) forbidden++;
  });
  assert.equal(forbidden, 0, 'the world tell has no billboard, point sprite, or soft transparent card');
  assert.equal(visual.userData.authoredAssetState, 'designed-procedural-settled');
  assert.equal(visual.visible, true, 'the canonical direct-mount route keeps the authored specialist visible');

  const ordinary = entityFromSpec(
    'ordinary-route',
    makeEnemySpawnSpec('reaver_pirate', 5, { x: 900, z: 100 }),
  );
  ordinary.radius = 12;
  const ordinaryVisual = createVisualFactory().build(ordinary);
  assert.equal(ordinaryVisual.getObjectByName('JammerAntennaFan'), undefined,
    'the loud tell belongs only to the authored specialist identity');
});
