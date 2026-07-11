import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createBus } from '../src/core/eventBus.js';
import { validatePresentationRecipes } from '../src/presentation/cueRecipes.js';
import {
  TRAVEL_CHOREOGRAPHY_PHASES,
  TRAVEL_PRESENTATION_CUE_IDS,
  arrivalHeading,
  cruiseDropCueId,
  jumpFailureTag,
  sectorPaletteTag,
  travelSequence,
  validateTravelChoreography,
} from '../src/presentation/travelChoreography.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const choreography = validateTravelChoreography();
assert(choreography.ok, choreography.issues.join('\n'));
assert.equal(TRAVEL_CHOREOGRAPHY_PHASES.length, 10);
assert.equal(TRAVEL_PRESENTATION_CUE_IDS.length, 18);
assert.equal(cruiseDropCueId('manual'), 'travel.cruise.cancelled');
assert.equal(cruiseDropCueId('masslock'), 'travel.cruise.interrupted');
assert.equal(jumpFailureTag('combat_lock'), 'interrupted_combat_lock');
assert.equal(jumpFailureTag('low_fuel'), 'rejected_low_fuel');
assert.equal(arrivalHeading({ entryPoint: { heading: Math.PI / 2 } }), Math.PI / 2);
assert.equal(travelSequence('sector_a', 'sector_b', 'gate'), 'sector_a>sector_b:gate');
const recipes = validatePresentationRecipes();
assert(recipes.ok, recipes.issues.join('\n'));

const corePalette = { fill: 0x4ad8ff };
const beltPalette = { fill: 0xffb13d };
assert.equal(sectorPaletteTag({ palette: corePalette }), 'palette_core');
assert.equal(sectorPaletteTag({ palette: beltPalette }), 'palette_belt');

const player = { id: 1, alive: true, type: 'ship', rot: 0, pos: { x: 0, y: 0, z: 0 } };
const gate = { id: 7, alive: true, type: 'station', radius: 64, pos: { x: 180, y: 0, z: 0 } };
const sectors = {
  sector_a: { id: 'sector_a', name: 'A', palette: corePalette },
  sector_b: { id: 'sector_b', name: 'B', palette: beltPalette },
  sector_c: { id: 'sector_c', name: 'C', palette: corePalette },
};
const state = {
  playerId: 1,
  tick: 100,
  simTime: 100 / 60,
  settings: { video: { motionReduce: false }, accessibility: { flashReduce: false, highContrast: false } },
  entities: new Map([[1, player], [7, gate]]),
  world: { currentSectorId: 'sector_a', sectors },
};
const bus = createBus();
const cues = [];
const applied = [];
const vfx = [];
const alerts = [];
const suppressed = [];
bus.on('presentation:cue', (payload) => cues.push(payload));
bus.on('presentation:cueApplied', (payload) => applied.push(payload));
bus.on('presentation:vfxCue', (payload) => vfx.push(payload));
bus.on('presentation:cueSuppressed', (payload) => suppressed.push(payload));
bus.on('alert', (payload) => alerts.push(payload));
presentationOrchestrator.init({ state, bus });
presentationAdapters.init({ state, bus });

const emit = (type, payload) => {
  state.tick++;
  state.simTime = state.tick / 60;
  bus.emit(type, payload);
  bus.flush();
};

emit('cruise:charging', { playerId: 1 });
emit('cruise:engaged', { playerId: 1 });
emit('cruise:dropped', { playerId: 1, reason: 'manual', was: 'cruising' });
emit('cruise:charging', { playerId: 1 });
emit('cruise:dropped', { playerId: 1, reason: 'masslock', was: 'charging' });
emit('gate:range', { gateId: 7, shipId: 1, inRange: true, gateTo: 'sector_b', name: 'B Gate' });
emit('gate:range', { gateId: 7, shipId: 1, inRange: false });

emit('jump:chargeAbort', { reason: 'low_fuel' });
emit('jump:chargeStart', { targetSectorId: 'sector_b', via: 'gate', chargeNeeded: 3 });
emit('jump:chargeTick', { progress: 0.5 });
emit('jump:chargeTick', { progress: 0.74 });
emit('jump:chargeTick', { progress: 0.92 });
assert.equal(cues.filter((cue) => cue.id === 'travel.jump.commit_window').length, 1,
  'commit-window anticipation must be one-shot per jump cycle');
emit('jump:start', { from: 'sector_a', to: 'sector_b', via: 'gate', fromPos: { x: 0, z: 0 } });
state.world.currentSectorId = 'sector_b';
const discoveryMembershipAtEmit = state.world.currentSectorId;
emit('sector:discovered', { sectorId: 'sector_b' });
emit('sector:enter', {
  sectorId: 'sector_b', sector: sectors.sector_b, firstVisit: true,
  entryPoint: { x: 1000, z: 200, heading: Math.PI / 2 }, continuous: false, noTeleport: false,
});
emit('interdiction:triggered', { sectorId: 'sector_b', ambushCount: 3, spawnPos: { x: 1050, z: 240 } });
emit('jump:arrive', { sectorId: 'sector_b', interdicted: true, ambushCount: 3, toPos: { x: 1000, z: 200 } });

emit('cruise:charging', { playerId: 1 });
player.pos.x = 1180;
player.pos.z = 280;
player.rot = Math.PI / 4;
state.world.currentSectorId = 'sector_c';
emit('world:membership', {
  sectorId: 'sector_c', previousSectorId: 'sector_b', reason: 'free_flight', noTeleport: true,
});
emit('sector:enter', {
  sectorId: 'sector_c', sector: sectors.sector_c, firstVisit: false,
  entryPoint: { x: 1200, z: 300, heading: 0 }, continuous: true, noTeleport: true,
});

emit('jump:chargeStart', { targetSectorId: 'sector_a', via: 'drive', chargeNeeded: 4 });
emit('jump:start', { from: 'sector_c', to: 'sector_a', via: 'drive', fromPos: { x: 1200, z: 300 } });
state.world.currentSectorId = 'sector_a';
emit('sector:enter', {
  sectorId: 'sector_a', sector: sectors.sector_a, firstVisit: false,
  entryPoint: { x: 0, z: 0, heading: Math.PI }, continuous: false, noTeleport: false,
});
emit('jump:arrive', { sectorId: 'sector_a', interdicted: false, ambushCount: 0, toPos: { x: 0, z: 0 } });

for (const id of TRAVEL_PRESENTATION_CUE_IDS) {
  assert(cues.some((cue) => cue.id === id), `missing travel presentation cue: ${id}`);
}
const approach = cues.find((cue) => cue.id === 'travel.gate.approach');
assert.equal(approach.sourceId, 1);
assert.equal(approach.targetId, 7);
const commit = cues.find((cue) => cue.id === 'travel.jump.committed');
assert.equal(commit.sourceId, 1);
assert.equal(commit.targetId, 'sector_b');
assert(commit.tags.includes('no_return'));
const oriented = cues.find((cue) => cue.id === 'travel.arrival.oriented' && cue.targetId === 'sector_b');
assert(Math.abs(oriented.direction.x) < 1e-9 && Math.abs(oriented.direction.y) < 1e-9
  && Math.abs(oriented.direction.z - 1) < 1e-9, 'arrival orientation must face the authored entry heading');
assert(oriented.tags.includes('oriented'));
const identity = cues.find((cue) => cue.id === 'travel.arrival.sector_identity' && cue.targetId === 'sector_b');
assert(identity.tags.includes('palette_belt'));
const mapped = cues.find((cue) => cue.id === 'travel.discovery.mapped');
assert.equal(mapped.sourceId, 1);
assert.equal(mapped.targetId, 'sector_b');
assert.equal(discoveryMembershipAtEmit, mapped.targetId,
  'discovery fixture must mirror live order: membership is current before sector:discovered emits');
assert(cues.some((cue) => cue.id === 'travel.recovery.resumed' && cue.tags.includes('low_fuel')));
assert(cues.some((cue) => cue.id === 'travel.aftermath.contested'));
assert(cues.some((cue) => cue.id === 'travel.aftermath.clear'));
assert(cues.some((cue) => cue.id === 'travel.corridor.continuity' && cue.targetId === 'sector_c'));
const corridorArrival = cues.find((cue) => cue.id === 'travel.arrival.oriented' && cue.targetId === 'sector_c');
assert.equal(corridorArrival.position.x, 1180, 'continuous arrival must use the live player pose, not a hypothetical jump entry');
assert.equal(corridorArrival.position.z, 280, 'continuous arrival must preserve the live no-teleport position');

const duplicateTravelVfx = vfx.filter((event) => event.id && event.id.startsWith('travel.'));
assert.equal(duplicateTravelVfx.length, 0, 'direct travel VFX ownership must not emit presentation:vfxCue');
const duplicateTravelAlerts = alerts.filter((event) => event.cueId && event.cueId.startsWith('travel.'));
assert.equal(duplicateTravelAlerts.length, 0, 'travel receipts must not duplicate existing alerts/postcards');
assert(applied.some((record) => record.id === 'travel.jump.committed' && record.outputs.vfx.reconciled === true));

state.tick = 10000;
state.simTime = state.tick / 60;
bus.emit('gate:range', { gateId: 7, shipId: 1, inRange: true, gateTo: 'sector_b' });
bus.flush();
const gateBeforeNewRun = cues.filter((cue) => cue.id === 'travel.gate.approach').length;
state.tick = 0;
state.simTime = 0;
bus.emit('game:new', {});
bus.flush();
emit('gate:range', { gateId: 7, shipId: 1, inRange: true, gateTo: 'sector_b' });
assert.equal(cues.filter((cue) => cue.id === 'travel.gate.approach').length, gateBeforeNewRun + 1,
  'new-game reset must clear prior-run dedupe stamps before tick zero');

emit('jump:chargeStart', { targetSectorId: 'sector_b', via: 'gate', chargeNeeded: 3 });
emit('save:loaded', {});
const orientedBeforeBareEnter = cues.filter((cue) => cue.id === 'travel.arrival.oriented').length;
emit('sector:enter', {
  sectorId: 'sector_b', sector: sectors.sector_b, firstVisit: false,
  entryPoint: { x: 1000, z: 200, heading: 0 }, continuous: false, noTeleport: false,
});
assert.equal(cues.filter((cue) => cue.id === 'travel.arrival.oriented').length, orientedBeforeBareEnter,
  'save load must clear a mid-jump cycle before a bare sector enter');

const worldSource = readFileSync(resolve(ROOT, 'src/systems/world.js'), 'utf8');
const vfxSource = readFileSync(resolve(ROOT, 'src/render/vfx.js'), 'utf8');
assert(worldSource.includes("this.bus.emit('world:membership'") && worldSource.includes('continuous, noTeleport'),
  'travel presentation must consume the committed M2 continuous-world receipt');
assert(worldSource.includes("this.bus.emit('jump:chargeTick'") && worldSource.includes("this.bus.emit('jump:start'")
  && worldSource.includes("this.bus.emit('jump:arrive'"), 'jump choreography must consume the live world state machine');
assert(vfxSource.includes("add('presentation:cue', (p) => this._onDirectTravelPresentationCue(p))"));
assert(vfxSource.includes('_onDirectTravelPresentationCue(p)'));
assert(vfxSource.includes('_spawnTravelVectorWake(pos'));
assert(!vfxSource.includes('_warpStreak'), 'generic radial warp tunnel must be retired');
assert(!vfxSource.includes('tunnel-rush feel'), 'generic tunnel language/effect must be absent');
const travelHandler = vfxSource.slice(
  vfxSource.indexOf('  _onDirectTravelPresentationCue(p) {'),
  vfxSource.indexOf('  _travelPalette(tags) {'),
);
assert(!travelHandler.includes('SPR_FLASH'), 'travel direct presentation must use spatial rings/wakes, not a generic flash');
assert(vfxSource.includes("secondary: '#54ffb0'"), 'anomaly identity must retain the authored violet/green sector pair');
assert(travelHandler.includes('if (reduced && !critical)'), 'reduced motion must collapse non-critical travel cues to one quiet ring');
assert(travelHandler.includes('1.18'), 'commit/continuity visuals must bridge the live 1.2 second JUMPING hold');
const cruiseHandler = vfxSource.slice(
  vfxSource.indexOf('  _onCruiseCharging(p) {'),
  vfxSource.indexOf('  _onChargeDetonated(p) {'),
);
assert(!cruiseHandler.includes('SPR_FLASH') && !cruiseHandler.includes('Math.random'),
  'cruise must share the directional pooled travel grammar without a radial flash/starburst');
for (const driftHue of ['#ffd080', '#ff8840', '#ffb040', '#a6e8ff', '#d8f8ff']) {
  assert(!cruiseHandler.includes(driftHue), `cruise travel must not use non-constitution hue ${driftHue}`);
}
assert(vfxSource.includes('new THREE.Points(geo, mat)') && vfxSource.includes('_spawnParticle('),
  'travel effects must reuse the existing pooled particle/sprite infrastructure');

for (const rel of ['src/presentation/travelChoreography.js', 'src/systems/presentationOrchestrator.js']) {
  const source = readFileSync(resolve(ROOT, rel), 'utf8');
  for (const forbidden of ['document.', 'window.', 'THREE.', 'Date.now', 'Math.random']) {
    assert(!source.includes(forbidden), `${rel} must remain headless and deterministic: ${forbidden}`);
  }
}

presentationAdapters.dispose();
presentationOrchestrator.dispose();
console.log(JSON.stringify({
  schema: 'spaceface.professionalTravelPresentation.v1',
  ok: true,
  phases: TRAVEL_CHOREOGRAPHY_PHASES,
  cueKinds: TRAVEL_PRESENTATION_CUE_IDS.length,
  cueCount: cues.filter((cue) => cue.id.startsWith('travel.')).length,
  commitReceipts: cues.filter((cue) => cue.id === 'travel.jump.committed').length,
  duplicateVfxEvents: duplicateTravelVfx.length,
  duplicateAlerts: duplicateTravelAlerts.length,
  suppressed: suppressed.filter((entry) => entry.id && entry.id.startsWith('travel.')).length,
}, null, 2));
