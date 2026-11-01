// Execute the current w533 positive garden helper with real Cinder/Rook/material owners.
// Defaults are current-production paths. --aux-root flags belong only to explicit thin reviews.
// This focused composition is not the full native w533 test, physics or renderer acceptance.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const routeFile = path.join(root, 'scripts/test-cinder-route.mjs');
const routeBytes = fs.readFileSync(routeFile);
let route = routeBytes.toString('utf8');
const cut = route.indexOf("\ntest('Ceres story-handoff");
assert(cut > 0, 'reuse the actual current Cinder owner harness');
route = route.slice(0, cut)
  .replace("const root = fileURLToPath(new URL('../', import.meta.url));", `const root = ${JSON.stringify(root)};`)
  .replace('return {state,bus,events,helpers,owner,aft,booth,kill,stripHull,offer,accept,arrive,hull,sale};',
    'return {state,bus,events,helpers,owner,aft,booth,kill,stripHull,offer,accept,arrive,hull,sale,combat:fighter};');
route += '\nexport {harness,mc,method,fn,read,story,trans,ns,inventory};\n//# sourceURL=compost-current-cinder-harness.mjs';
const shared = await import('data:text/javascript;base64,' + Buffer.from(route).toString('base64'));
// Candidate-added route readers must use their actual production modules, not VM stubs.
const waspRoute = await import(pathToFileURL(path.join(root, 'src/missions/starterWaspRoute.js')));
const compostRoute = await import(pathToFileURL(path.join(root, 'src/missions/compostRoute.js')));
const nestRoute = await import(pathToFileURL(path.join(root, 'src/data/nestVisit.js')));
const buoyAftermath = await import(pathToFileURL(path.join(root, 'src/missions/starterBuoyAftermath.js')));
const starterRoute = await import(pathToFileURL(path.join(root, 'src/missions/starterWorkday.js')));
Object.assign(shared.mc, { nestWaypoint: nestRoute.nestWaypoint,
  firstBuoyReceiptFields: buoyAftermath.firstBuoyReceiptFields,
  firstWaspRouteFocus: waspRoute.firstWaspRouteFocus,
  compostRouteFocus: compostRoute.compostRouteFocus,
  starterBuoyRouteFocus: starterRoute.starterBuoyRouteFocus });
const fixturePath = path.join(root, 'test/w533-books-0-2.test.mjs');
const fixtureBytes = fs.readFileSync(fixturePath), fixture = fixtureBytes.toString('utf8').replace(/\r\n/g, '\n');
function named(name) {
  const start = fixture.indexOf(`function ${name}(`), end = fixture.indexOf('\n}', start);
  assert(start >= 0 && end > start, `read current w533 helper ${name}`);
  return fixture.slice(start, end + 2);
}
const R = shared.ns('src/data/understoryReceiver.js');
const G = shared.ns('src/systems/faction_understory.js');
const rules = shared.ns('src/characters/rookRules.js');
const rng = shared.ns('src/core/rng.js');
const functions = new Function('assert', 'UNDERSTORY_RECEIVER', 'rookPadPosition', 'materializeAlienEcology', 'ALIEN_SITES',
  ['completePatrol', 'deliverCinderHull', 'feedReceivingGarden'].map(named).join('\n')
    + '\nreturn {completePatrol,deliverCinderHull,feedReceivingGarden};')(
  assert, R.UNDERSTORY_RECEIVER, rules.rookPadPosition,
  () => { throw new Error('Unrelated Ceres ecology is outside this Cinder→Compost probe'); }, {});
// Actual read-only/cache and furnace-entry guards. No Ceres aftermath exists in this probe;
// if that changes, the guard's normal owner logic runs rather than a fabricated success value.
vm.runInContext(shared.fn(shared.read('src/world/livingWorldViews.js'), 'entityIndexVersion')
  + '\n' + shared.fn(shared.read('src/missions/furnaceWorksite.js'), 'furnaceDetail')
  + '\n' + shared.fn(shared.read('src/missions/furnaceWorksite.js'), 'authoredFurnaceWorksite')
  + '\n' + shared.fn(shared.read('src/missions/furnaceWorksiteRuntime.js'), 'materializeFurnaceAftermath'), shared.mc);
// Actual sector-entry method; unrelated Ceres branches remain declared non-executed harness ports.
vm.runInContext(`this.sectorOps={${['spawnTargetsForSector', 'spawnTargetsForSectorChunked'].map(n => shared.method(shared.story, n)).join('\n')}};`, shared.mc);
vm.runInContext(shared.fn(shared.read('src/systems/missions.js'), 'missionIndexedEntities')
  + `\nthis.nearest={${shared.method(shared.read('src/systems/missions.js'), '_nearestStation')}};`, shared.mc);
const h = shared.harness();
Object.assign(h.owner, shared.mc.nearest);
h.state.rng = rng.mulberry32(4242); h.state.mode = 'flight';
h.missions = h.owner; Object.assign(h.missions, shared.mc.sectorOps);
h.rook = h.booth; h.aftermath = h.aft;
h.understory = Object.create(G.understoryGardens);
h.understory.init({ state: h.state, bus: h.bus, helpers: h.helpers, registry: h.owner.registry });
// Execute the shipping listener line verbatim, bound to its actual projected missions owner.
const missionSource = fs.readFileSync(path.join(root, 'src/systems/missions.js'), 'utf8');
const listener = missionSource.match(/bus\.on\('understory:playerGrowth',[^\n]+/);
assert(listener, 'current production listener must exist');
new Function('bus', listener[0]).call(h.missions, h.bus);
const cinder = h.accept();
functions.completePatrol(h, cinder);
functions.deliverCinderHull(h, cinder);
assert.deepEqual(JSON.parse(JSON.stringify(shared.trans.getBeatStepStatus(h.state, 2).completed)), ['cinder_board']);
const remaining = cinder.params.cinderMarkedWrecks.map(ref => h.aft._resolveBoundWreck(ref.markerId)).find(e => e?.alive !== false && e);
assert(remaining); const eatenMarker = remaining.data.markerId;
const creditsBefore = h.events.filter(([name]) => name === 'economy:grantCredits').length;
functions.feedReceivingGarden(h, cinder);
assert.deepEqual(JSON.parse(JSON.stringify(shared.trans.getBeatStepStatus(h.state, 2).completed)), ['cinder_board', 'compost']);
assert.equal(h.state.story.beatIndex, 2, 'Nest and Elroy are still owed');
assert.equal(h.offer(), null, 'Registry Writ cannot post before Nest');
assert.equal(h.events.filter(([name]) => name === 'economy:grantCredits').length, creditsBefore, 'no first-growth payment intent');
const eatenEvents = h.events.filter(([name, p]) => name === 'understory:gardenFed' && p.eatenId === remaining.id);
assert.equal(eatenEvents.length, 1, 'one physical hull consumed once');
assert.equal(h.events.filter(([name, p]) => name === 'aftermathWreck:retired' && p.markerId === eatenMarker && p.reason === 'understory_garden').length, 1);
const garden = R.receiverStatus(h.state).garden;
assert.equal(garden.data.compostFedMass, 16); assert.equal(garden.data.gardenBiomass, 61.6);
const snapshot = h.aft.serialize(); h.aft.deserialize(snapshot); h.bus.emit('save:loaded', {});
h.understory.update(1 / 60, h.state);
assert.equal(h.aft._markerById(eatenMarker), null, 'actual canonical serialize/restore cannot resurrect eaten hull');
assert.equal(h.events.filter(([name]) => name === 'economy:grantCredits').length, creditsBefore);
assert.equal(h.events.filter(([name, p]) => name === 'understory:gardenFed' && p.eatenId === remaining.id).length, 1);
console.log('PASS current w533 helpers:3 real Cinder deaths→actual canonical Rook sale→surviving16t hull→authored receiver→real stage2/player receipt→ordered Compost; no early money/Elroy or resurrection.');
console.log(JSON.stringify({ fixture: { path: fixturePath, sha256: createHash('sha256').update(fixtureBytes).digest('hex') },
  routeHarness: { path: routeFile, sha256: createHash('sha256').update(routeBytes).digest('hex') }, owners: Object.fromEntries(shared.inventory) }, null, 2));
console.log('Focused actual-owner composition only; not full native w533, full save-system, physics/tether, browser or GPU acceptance.');
