// freight.cargo_spilled — the witnessed-incident cue. lane2's freight:cargoSpilled already
// carries the real pods, custody, cause and causer; before this leaf nothing on the presentation
// side consumed it, so a spill's only read was physical pods plus an optional bark.
//
// Audience split follows the adapters' existing floor: a player-inflicted spill surfaces the
// receipt + caption on top of the world lanes (beacon ring on the pod cloud, jettison thunk);
// a raider's distant spill stays world-scoped — pods and audio answer in space, the HUD stays quiet.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { getPresentationRecipe } from '../src/presentation/cueRecipes.js';

const CARRIER_ID = 50;
const POD_A = 60;
const POD_B = 61;

function makeWorld() {
  const state = {
    playerId: 1,
    tick: 100,
    simTime: 10,
    settings: { video: {}, accessibility: {} },
    entities: new Map([
      [1, { id: 1, pos: { x: 0, y: 0, z: 0 } }],
      [CARRIER_ID, { id: CARRIER_ID, type: 'ship', alive: true, pos: { x: 200, y: 0, z: 40 } }],
      [POD_A, { id: POD_A, type: 'pickup', alive: true, pos: { x: 214, y: 0, z: 45 } }],
      [POD_B, { id: POD_B, type: 'pickup', alive: true, pos: { x: 206, y: 0, z: 30 } }],
    ]),
  };
  const bus = createBus();
  const rec = { cue: [], suppressed: [], applied: [], ui: [], caption: [], audio: [], vfx: [], alert: [] };
  bus.on('presentation:cue', (p) => rec.cue.push(p));
  bus.on('presentation:cueSuppressed', (p) => rec.suppressed.push(p));
  bus.on('presentation:cueApplied', (p) => rec.applied.push(p));
  bus.on('presentation:uiCue', (p) => rec.ui.push(p));
  bus.on('presentation:caption', (p) => rec.caption.push(p));
  bus.on('presentation:audioCue', (p) => rec.audio.push(p));
  bus.on('presentation:vfxCue', (p) => rec.vfx.push(p));
  bus.on('alert', (p) => rec.alert.push(p));
  presentationOrchestrator.init({ state, bus });
  presentationAdapters.init({ state, bus });
  return { state, bus, rec };
}

function spill(over = {}) {
  return {
    encounterId: 'enc-spill',
    custodyId: 'custody-spill',
    carrierId: CARRIER_ID,
    attackerId: 1,
    podIds: [POD_A, POD_B],
    podCount: 2,
    qty: 7,
    cause: 'violence',
    commodityId: 'cmdty_refined_metals',
    t: 10,
    ...over,
  };
}

test('freight.cargo_spilled recipe exists with the pod-beacon lane and a silent-bark-aware voice', () => {
  const recipe = getPresentationRecipe('freight.cargo_spilled');
  assert.ok(recipe, 'the witnessed spill must resolve a presentation recipe');
  assert.equal(recipe.lanes.vfx, 'vfx.pod_beacon', 'the pod cloud gets the authored amber beacon ring');
  assert.equal(recipe.lanes.camera, 'camera.none', 'a spill must never kick the camera off the player\'s work');
  assert.equal(recipe.lanes.ui, 'ui.freight_spill');
  assert.equal(recipe.lanes.accessibility, 'accessibility.freight_spill');
  assert.ok(recipe.budgets.particles > 0, 'the ring needs a particle budget or it cannot draw');
});

test('a player-inflicted spill publishes the cue on the pod cloud with the full lane answer', () => {
  const { bus, rec } = makeWorld();
  bus.emit('freight:cargoSpilled', spill());
  bus.flush();

  assert.equal(rec.cue.length, 1, 'one spill emits one presentation cue');
  const cue = rec.cue[0];
  assert.equal(cue.id, 'freight.cargo_spilled');
  assert.equal(cue.sourceId, 1, 'the causer is the cue source');
  assert.equal(cue.targetId, CARRIER_ID, 'the carrier is who the incident happened to');
  assert.deepEqual(cue.position, { x: 214, y: 0, z: 45 }, 'the cue points at the first live pod, not the carrier');
  assert.equal(cue.playerRelevance, 0.88, 'the player caused it — participant relevance');
  assert.equal(cue.magnitude, 7, 'magnitude is the spilled freight quantity');
  assert.equal(cue.sourceEvent, 'freight:cargoSpilled');

  // World lanes always answer: amber ring on the pod cloud + the authored jettison voice.
  assert.equal(rec.vfx.at(-1).lane, 'vfx.pod_beacon');
  assert.equal(rec.vfx.at(-1).position.x, 214);
  assert.equal(rec.audio.at(-1).id, 'sfx_cargo_jettison', 'the spill answers with the authored cargo-ballistic voice');

  // Player-addressed lanes surface for the player who caused it: the incident receipt names it.
  assert.equal(rec.alert.at(-1).text, 'CARGO ADRIFT');
  assert.equal(rec.alert.at(-1).audioOwnedByPresentation, true, 'the cue owns the voice; the alert adds no generic chime');
  assert.equal(rec.caption.at(-1).text, 'Cargo adrift — loose pods are claimable.');
  assert.equal(rec.caption.at(-1).assertive, false, 'a consequence receipt is not an interrupt');

  presentationOrchestrator.dispose();
  presentationAdapters.dispose();
});

test('a raider-caused spill keeps the HUD quiet while the world lanes still answer in space', () => {
  const { bus, rec } = makeWorld();
  // Encounter-script spills name the raider by record id, not entity — the cue stays distance-tiered.
  bus.emit('freight:cargoSpilled', spill({ attackerId: undefined, raiderId: 'rec-raider-1', cause: 'carrier_destroyed' }));
  bus.flush();

  assert.equal(rec.cue.length, 1);
  const cue = rec.cue[0];
  assert.equal(cue.sourceId, null, 'a world-record raider id is not an entity — the cue is distance-tiered');
  assert.ok(cue.playerRelevance < 0.8, `a witnessed raid spill is not a player receipt (${cue.playerRelevance})`);
  assert.equal(rec.alert.length, 0, 'no banner for a distant raider spill');
  assert.equal(rec.caption.length, 0, 'no caption for a distant raider spill');
  assert.ok(rec.vfx.length > 0, 'the pod cloud still pings in the world');
  assert.ok(rec.audio.length > 0, 'the thunk still answers in space');

  presentationOrchestrator.dispose();
  presentationAdapters.dispose();
});

test('dedupe merges a re-emit of the same lot inside the window; a distinct incident re-pings', () => {
  const { state, bus, rec } = makeWorld();
  bus.emit('freight:cargoSpilled', spill());
  state.tick += 10;
  bus.emit('freight:cargoSpilled', spill());
  bus.flush();
  assert.equal(rec.cue.length, 1, 'the same custody lot re-emitted inside the window is one incident');
  assert.equal(rec.suppressed.at(-1).reason, 'dedupe_window');

  state.tick += 10;
  bus.emit('freight:cargoSpilled', spill({ custodyId: 'custody-second', podIds: [POD_B] }));
  bus.flush();
  assert.equal(rec.cue.length, 2, 'a genuinely separate spill is a second incident');

  presentationOrchestrator.dispose();
  presentationAdapters.dispose();
});

test('the cue follows live pods: dead pods fall back to the carrier, and an unlocatable spill stays silent', () => {
  const { state, bus, rec } = makeWorld();
  state.entities.get(POD_A).alive = false;
  state.entities.get(POD_B).alive = false;
  bus.emit('freight:cargoSpilled', spill());
  bus.flush();
  assert.equal(rec.cue.length, 1);
  assert.deepEqual(rec.cue[0].position, { x: 200, y: 0, z: 40 }, 'dead pods fall back to the carrier position');

  state.tick += 120;
  const before = rec.cue.length;
  bus.emit('freight:cargoSpilled', spill({ custodyId: 'custody-nowhere', carrierId: 999, podIds: [999] }));
  bus.flush();
  assert.equal(rec.cue.length, before, 'a spill with no located body cannot be presented at any lane');

  presentationOrchestrator.dispose();
  presentationAdapters.dispose();
});

test('repeated init/dispose leaves no stale subscriber: a post-dispose spill emits nothing', () => {
  const { bus, rec } = makeWorld();
  presentationOrchestrator.dispose();
  presentationAdapters.dispose();
  bus.emit('freight:cargoSpilled', spill());
  bus.flush();
  assert.equal(rec.cue.length, 0, 'a disposed orchestrator leaves no listener behind');

  const second = makeWorld();
  second.bus.emit('freight:cargoSpilled', spill());
  second.bus.flush();
  assert.equal(second.rec.cue.length, 1, 'a fresh init subscribes cleanly');
  presentationOrchestrator.dispose();
  presentationAdapters.dispose();
});
