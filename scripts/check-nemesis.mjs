#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot, playStyle, steeringProbe } from './nemesis/harness.mjs';
import { createNemesisSystem } from '../src/systems/nemesis.js';
import { classifyPlayerKill, inferPlayerModel, prepareNemesisPlan, admitEvidence } from '../src/nemesis/learning.js';
import { LIMITS, freshNemesis, freshEpisode, normalizeNemesis, normalizePlan, clone } from '../src/nemesis/model.js';
import { nemesisFireAllowed, shapeNemesisManeuverRequest } from '../src/ai/nemesisTactics.js';
import { NEMESIS_RIVAL, NEMESIS_KITS } from '../src/data/nemesisRival.js';
import { buildNemesisSpawnSpecs } from '../src/nemesis/encounterHost.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const events = (t, name) => t.rows.filter((row) => row.event === name);
const bossOf = (t) => t.state.entities.get(t.state.nemesis.active.bossId);

test('first contact has a six-second warning, no learned counter, no RNG consumption', () => {
  const t = boot(); t.start();
  const warning = events(t, 'nemesis:announced')[0].payload;
  const started = events(t, 'nemesis:engaged')[0].payload;
  assert.ok(started.t >= warning.notBefore);
  assert.equal(t.state.nemesis.active.plan.primary, 'open'); assert.equal(t.rngCalls(), 0);
});
test('same seed and inputs reproduce the entire event transcript and serialized state', () => {
  const a = playStyle('fling'), b = playStyle('fling');
  assert.deepEqual(a.rows, b.rows); assert.deepEqual(a.engine.serialize(), b.engine.serialize());
});
test('tether and explosive pilots get genuinely different equipment and doctrine', () => {
  const a = playStyle('fling'), b = playStyle('explosive');
  assert.equal(a.state.nemesis.active.plan.primary, 'tether');
  assert.equal(b.state.nemesis.active.plan.primary, 'ordnance');
  assert.notEqual(bossOf(a).data.enemyTypeId, bossOf(b).data.enemyTypeId);
  assert.notEqual(bossOf(a).data.ai.combatDoctrineId, bossOf(b).data.ai.combatDoctrineId);
});
test('real normalized steering changes trajectory, not just a label', () => {
  const t = boot(); t.start();
  const base = steeringProbe(t, 'open'), cross = steeringProbe(t, 'tether'), close = steeringProbe(t, 'gunnery');
  assert.ok(Math.hypot(cross.end.x - base.end.x, cross.end.z - base.end.z) > 30);
  assert.ok(Math.hypot(cross.end.x - close.end.x, cross.end.z - close.end.z) > 10);
});
test('a battle plan stays byte-identical while new evidence arrives', () => {
  const t = boot(); t.start(); const locked = JSON.stringify(t.state.nemesis.active.plan);
  for (let i = 0; i < 60; i++) { t.kill(i % 2 ? 'gun' : 'fling', 8000 + i); t.tick(); }
  assert.equal(JSON.stringify(t.state.nemesis.active.plan), locked);
});
test('duplicate entity:killed and combat:kill count exactly once', () => {
  const t = boot(); t.start(); const p = { id: 987, killerId: 1, type: 'ship', killStyle: 'fling', witnessIds: [bossOf(t).id] };
  t.bus.emit('entity:killed', p); t.bus.emit('combat:kill', p);
  assert.equal(t.state.nemesis.active.episode.counts.tether, 2);
});
test('generic witnessed:true does not grant the nemesis omniscient intelligence', () => {
  const t = boot(); t.start(); t.kill('gun', 555, { witnessIds: [], witnessed: true });
  assert.equal(t.state.nemesis.active.episode.total, 0);
});
test('actual sensor contact can witness without an explicit witness list', () => {
  const t = boot({ sensors: true }); t.start();
  t.state.entities.set(555, { id: 555, hull: 100, alive: true, pos: { x: 100, z: 0 }, data: {} });
  t.kill('gun', 555, { witnessIds: [] }); assert.equal(t.state.nemesis.active.episode.counts.gunnery, 2);
});
test('hidden and invalid sensor contacts do not become evidence', () => {
  const t = boot({ sensors: true }); t.start();
  t.state.entities.set(555, { id: 555, hull: 100, alive: true, visible: false, pos: { x: 100, z: 0 }, data: {} });
  t.kill('gun', 555, { witnessIds: [] }); assert.equal(t.state.nemesis.active.episode.total, 0);
});
test('an unclassified kill remains unknown rather than being fabricated as gunnery', () => {
  assert.equal(classifyPlayerKill({ id: 2, killerId: 1 }, 1, [], 10), null);
});
test('player-attributed tumble plus collision becomes tether evidence, not an arbitrary rock kill', () => {
  const t = boot(); t.start();
  t.bus.emit('massline:tumbled', { victimId: 555, playerCaused: true });
  t.kill(undefined, 555, { cause: 'terrain_collision' });
  assert.equal(t.state.nemesis.active.episode.counts.tether, 2);
});
test('foreign/expired/future tumbles do not frame the player', () => {
  const p = { id: 2, killerId: 1, cause: 'terrain_collision' };
  assert.equal(classifyPlayerKill(p, 1, [{ id: 2, at: 0 }], 20).style, 'terrain');
  assert.equal(classifyPlayerKill(p, 1, [{ id: 2, at: 30 }], 20).style, 'terrain');
  const t = boot(); t.start(); t.bus.emit('massline:tumbled', { victimId: 555, ownerId: 99 });
  assert.equal(t.state.nemesis.tumbles.length, 0);
});
test('foreign kills, self kills and non-ship kills do not train the model', () => {
  const t = boot(); t.start(); t.kill('fling', 999, { killerId: 22 });
  t.kill('fling', 999, { type: 'asteroid' });
  assert.equal(t.state.nemesis.active.episode.total, 0);
  assert.equal(classifyPlayerKill({ id: 1, killerId: 1, killStyle: 'fling' }, 1, [], 0), null);
});
test('reported events weigh less and require an actual live local crew member', () => {
  const t = boot(); t.start(); const a = t.state.nemesis.active;
  t.observe('field', { source: 'crew_report', witnessId: 999 }); assert.equal(a.episode.total, 0);
  t.observe('field', { source: 'crew_report', witnessId: a.crewIds[1] }); assert.equal(a.episode.counts.field, 1);
});
test('rapid fire cannot overwhelm the fixed observation budget', () => {
  const t = boot(); t.start(); for (let i = 0; i < 10000; i++) t.observe('gunnery');
  assert.equal(t.state.nemesis.active.episode.counts.gunnery, 2);
  assert.ok(t.state.nemesis.seen.length <= LIMITS.dedupe);
});
test('per-style, per-episode, dedupe and tumble histories are bounded under a flood', () => {
  const t = boot(); t.start(); const styles = ['fling', 'gun', 'rock', 'explosive', 'field', 'kite'];
  for (let i = 0; i < 3000; i++) { t.kill(styles[i % styles.length], 9000 + i);
    t.bus.emit('massline:tumbled', { victimId: 50000 + i, playerCaused: true }); }
  const m = t.state.nemesis;
  assert.equal(m.active.episode.total, LIMITS.evidencePerEpisode);
  assert.ok(Object.values(m.active.episode.counts).every((v) => v <= LIMITS.evidencePerStyle));
  assert.equal(m.seen.length, LIMITS.dedupe); assert.equal(m.tumbles.length, LIMITS.recentTumbles);
  assert.ok(JSON.stringify(t.engine.serialize()).length < 18000);
});
test('no midflight wall-clock or random dependency exists in shipped nemesis simulation files', () => {
  for (const name of ['systems/nemesis.js', 'nemesis/model.js', 'nemesis/learning.js',
    'nemesis/encounterHost.js', 'ai/nemesisTactics.js']) {
    const source = fs.readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\b(Date\.now|performance\.now|Math\.random|requestAnimationFrame|document\.|window\.|THREE\.)/);
  }
});
test('sparse or mixed evidence does not invent confident specialization', () => {
  const m = freshNemesis(); const e = freshEpisode('one', 0); e.counts.tether = 2; e.total = 2;
  m.episodes.push(e); assert.equal(prepareNemesisPlan(m).primary, 'open');
  e.counts.ordnance = 2; e.counts.gunnery = 2; e.total = 6;
  assert.equal(prepareNemesisPlan(m).primary, 'open');
});
test('recent contradictory encounters eventually revise a historically strong hypothesis', () => {
  const m = freshNemesis();
  for (let i = 0; i < 4; i++) { const e = freshEpisode(`e${i}`, 0); e.counts.tether = 12; e.total = 12; m.episodes.push(e); }
  m.lastPrimary = prepareNemesisPlan(m).primary; assert.equal(m.lastPrimary, 'tether');
  for (let i = 0; i < 5; i++) { const e = freshEpisode(`r${i}`, 0); e.counts.ordnance = 12; e.total = 12;
    m.episodes.push(e); if (m.episodes.length > LIMITS.episodes) m.episodes.shift(); }
  assert.equal(prepareNemesisPlan(m).primary, 'ordnance');
});
test('a deceptive style change exposes a wrong prediction and is acknowledged in dialogue', () => {
  const t = boot(); t.start(); for (let i = 0; i < 6; i++) t.kill('fling', 1000 + i); t.escape();
  t.start(); assert.equal(t.state.nemesis.active.plan.primary, 'tether');
  for (let i = 0; i < 6; i++) t.kill('gun', 2000 + i); t.escape();
  assert.ok(events(t, 'nemesis:encounterEnded').at(-1).payload.contradicted);
  assert.ok(events(t, 'nemesis:voice').some((r) => r.payload.situation === 'contradicted'));
});
test('hardware budget is capped and levels derive from chapter, not imported HP values', () => {
  const plan = normalizePlan({ primary: 'tether', secondary: 'ordnance', chapter: 999,
    level: 1000, escortCount: 90, hullMultiplier: 1000 });
  assert.equal(plan.level, 8); assert.equal(plan.escortCount, 2); assert.equal(plan.counterBudget, 2);
  assert.equal(plan.hullMultiplier, undefined);
});
test('no repeat deployment while an acknowledgement is pending', () => {
  const t = boot({ withHost: false }); t.until(() => events(t, 'nemesis:encounterRequested').length === 1);
  t.advance(10); assert.equal(events(t, 'nemesis:encounterRequested').length, 1);
});
test('a host timeout retries with a fresh token, not a duplicate live crew', () => {
  const t = boot({ withHost: false }); t.advance(240);
  const requests = events(t, 'nemesis:encounterRequested').map((r) => r.payload.requestId);
  assert.ok(requests.length >= 2); assert.equal(new Set(requests).size, requests.length);
});
test('missing/negative pacing, insufficient budget and blocked placement fail closed', () => {
  for (const options of [{ approve: false }, { approve: null }, { budgetCap: 1 }, { blockPlacement: true }]) {
    const t = boot(options); t.advance(200); assert.equal(t.state.nemesis.active, null);
    assert.equal(t.state.entities.size, 1); assert.equal(t.allocations.size, 0);
    assert.ok(events(t, 'nemesis:encounterRejected').length);
  }
});
test('partial spawn failure rolls back every created hull and the budget', () => {
  const t = boot({ failSpawnAt: 2 }); t.advance(195);
  assert.equal(t.state.entities.size, 1); assert.equal(t.allocations.size, 0);
  assert.equal(t.state.nemesis.active, null);
});
test('below-recovery hull blocks deployment and does not shorten the warning', () => {
  const t = boot(); t.player.hull = 35; t.advance(200);
  assert.equal(t.state.nemesis.active, null); assert.equal(t.state.entities.size, 1);
});
test('docking and paused modes do not advance learning or encounter scheduling', () => {
  const t = boot(); t.state.mode = 'dock'; t.advance(400); assert.equal(t.state.nemesis.pending, null);
  t.state.mode = 'flight'; t.start(); t.state.mode = 'paused'; t.observe('field');
  assert.equal(t.state.nemesis.active.episode.total, 0);
});
test('an escaped captain physically leaves, while the shared budget fully releases', () => {
  const t = boot(); t.start(); t.escape(); t.tick();
  assert.equal(t.state.nemesis.active, null); assert.equal(t.state.entities.size, 1);
  assert.equal(t.allocations.size, 0); assert.equal(t.state.nemesis.completed, 1);
  assert.ok(t.state.nemesis.grudge > 0);
});
test('forged early escape receipts cannot teleport a captain out of combat', () => {
  const t = boot(); t.start(); const a = t.state.nemesis.active;
  t.bus.emit('nemesis:escaped', { encounterId: a.id, bossId: a.bossId }); assert.equal(t.state.nemesis.active, a);
  bossOf(t).hull = 20; t.advance(9);
  t.bus.emit('nemesis:escaped', { encounterId: a.id, bossId: a.bossId }); assert.equal(t.state.nemesis.active, a);
});
test('Orra can be killed permanently on the first meeting: no plot armor or resurrection', () => {
  const t = boot(); t.start(); const id = bossOf(t).id;
  t.kill('gun', id); t.kill('gun', id); t.advance(900);
  assert.equal(t.state.nemesis.ending, 'destroyed'); assert.equal(events(t, 'nemesis:resolved').length, 1);
  assert.equal(events(t, 'nemesis:engaged').length, 1);
});
test('third-party death is terminal but is not miscredited to the player', () => {
  const t = boot(); t.start(); t.kill('gun', bossOf(t).id, { killerId: 999 });
  assert.equal(t.state.nemesis.ending, 'lost'); assert.equal(t.state.nemesis.episodes[0].total, 0);
});
test('finale phases are preplanned, health-driven and monotone across healing', () => {
  const t = playStyle('fling'); const a = t.state.nemesis.active;
  assert.equal(a.plan.chapter, 3); const locked = JSON.stringify(a.plan);
  bossOf(t).hull = 60; t.advance(1); assert.equal(a.act, 1);
  bossOf(t).hull = 90; t.advance(1); assert.equal(a.act, 1);
  bossOf(t).hull = 30; t.advance(1); assert.equal(a.act, 2);
  assert.equal(a.retreatAt, null); assert.equal(JSON.stringify(a.plan), locked);
});
test('surrender cannot be accepted early, but a final wounded living captain can be spared once', () => {
  const t = playStyle('gun'); const a = t.state.nemesis.active;
  t.bus.emit('nemesis:spare', { encounterId: a.id }); assert.equal(t.state.nemesis.ending, null);
  bossOf(t).hull = 15; t.advance(1); assert.ok(a.surrenderedAt != null);
  assert.equal(nemesisFireAllowed(bossOf(t), t.state), false);
  t.bus.emit('nemesis:spare', { encounterId: a.id }); t.bus.emit('nemesis:spare', { encounterId: a.id }); t.tick();
  assert.equal(t.state.nemesis.ending, 'spared'); assert.equal(events(t, 'nemesis:resolved').length, 1);
  assert.equal(t.state.entities.size, 1); assert.equal(t.allocations.size, 0);
});
test('late surrender cannot resurrect a destroyed captain', () => {
  const t = playStyle('gun'); const a = t.state.nemesis.active; bossOf(t).hull = 15; t.advance(1);
  t.kill('gun', a.bossId); t.bus.emit('nemesis:spare', { encounterId: a.id });
  assert.equal(t.state.nemesis.ending, 'destroyed');
});
test('fire gate respects arrival, phase telegraphs, retreat and whole-wing surrender', () => {
  const t = boot(); t.start(); const boss = bossOf(t), a = t.state.nemesis.active;
  assert.equal(nemesisFireAllowed(boss, t.state), false); t.advance(3);
  assert.equal(nemesisFireAllowed(boss, t.state), true);
  a.retreatAt = t.state.simTime; assert.equal(nemesisFireAllowed(boss, t.state), false);
  assert.equal(nemesisFireAllowed(t.player, t.state), true);
});
test('steering preserves frozen inputs, normalized flags and actuator bounds', () => {
  const t = boot(); t.start(); t.state.nemesis.active.plan.primary = 'tether';
  const boss = bossOf(t), req = { entityId: boss.id, kind: 'intercept', torqueYaw: 0, targetHeading: 0,
    forceLocal: Object.freeze({ forward: 1, right: 0 }), brake: false, trajectory: Object.freeze([]) };
  Object.defineProperty(req, '__spacefaceNormalizedThrusterRequest', { value: true }); Object.freeze(req);
  const result = shapeNemesisManeuverRequest(req, t.state, { contacts: [{ id: 1, pos: t.player.pos,
    visible: true, alive: true, confidence: 1 }] });
  assert.notEqual(result, req); assert.equal(result.__spacefaceNormalizedThrusterRequest, true);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.values(result.forceLocal).every((v) => Math.abs(v) <= 1));
  assert.ok(Math.abs(result.torqueYaw) <= 1); assert.equal(req.forceLocal.forward, 1);
});
test('avoidance and missing/hidden sensor contacts outrank counter steering', () => {
  const t = boot(); t.start(); t.state.nemesis.active.plan.primary = 'tether';
  const req = { entityId: bossOf(t).id, kind: 'intercept', forceLocal: { forward: 1, right: 0 } };
  assert.equal(shapeNemesisManeuverRequest(req, t.state, null), req);
  const brake = { ...req, brake: true };
  assert.equal(shapeNemesisManeuverRequest(brake, t.state, { contacts: [{ id: 1, pos: t.player.pos, visible: true }] }), brake);
});
test('save round-trip mid-encounter preserves plan, evidence and duplicate protection', () => {
  const t = boot(); t.start(); t.kill('gun', 444); const snapshot = t.engine.serialize();
  t.engine.deserialize(JSON.parse(JSON.stringify(snapshot))); t.bus.emit('save:loaded', {});
  t.kill('gun', 444); assert.equal(t.state.nemesis.active.episode.counts.gunnery, 2);
  assert.deepEqual(t.state.nemesis.active.plan, snapshot.active.plan);
});
test('load during a pending deployment invalidates its token instead of spawning twice', () => {
  const t = boot({ withHost: false }); t.until(() => events(t, 'nemesis:encounterRequested').length === 1);
  const token = t.state.nemesis.pending.id; t.engine.deserialize(t.engine.serialize()); t.bus.emit('save:loaded', {});
  assert.equal(t.state.nemesis.pending, null);
  t.bus.emit('nemesis:encounterStarted', { requestId: token, bossId: 123, crewIds: [] });
  assert.equal(t.state.nemesis.active, null);
});
test('missing/reused entities on load interrupt rather than inventing a victory or encounter', () => {
  const t = boot(); t.start(); const a = t.state.nemesis.active;
  t.state.entities.set(a.bossId, { id: a.bossId, hull: 100, alive: true, data: {} });
  t.bus.emit('save:loaded', {}); assert.equal(t.state.nemesis.active, null);
  assert.equal(t.state.nemesis.completed, 0); assert.equal(t.state.nemesis.ending, null);
});
test('serialized snapshots are detached, and malformed saves are bounded/whitelisted', () => {
  const t = boot(); t.start(); const copy = t.engine.serialize(); copy.active.plan.level = 999;
  assert.notEqual(t.state.nemesis.active.plan.level, 999);
  const input = { schemaVersion: 1, grudge: Infinity, episodes: Array(1000).fill({ id: 'x', counts: {
    tether: 999, gunnery: 999, terrain: 999 }, total: 999 }), seen: Array(2000).fill('duplicate'),
    active: { id: 'x', bossId: 2, plan: { primary: '__proto__', chapter: 500 },
      crewIds: Array(100).fill(2), episode: { id: 'x' } } };
  const m = normalizeNemesis(input);
  assert.equal(m.episodes.length, LIMITS.episodes); assert.equal(m.active.plan.primary, 'open');
  assert.equal(m.seen.length, 1); assert.ok(m.active.crewIds.length <= LIMITS.maxCrew);
  assert.ok(Number.isFinite(m.grudge));
});
test('unsupported future saves are rejected without overwriting the existing campaign', () => {
  const t = boot(); t.start(); const before = t.engine.serialize();
  assert.throws(() => t.engine.deserialize({ schemaVersion: 999 }), RangeError);
  assert.deepEqual(t.engine.serialize(), before);
});
test('new game clears every campaign-owned cache; destroy/reinit does not duplicate listeners', () => {
  const t = boot(); t.start(); t.kill('gun', 222); const count = t.bus.count();
  t.engine.init(t.ctx); assert.equal(t.bus.count(), count);
  t.engine.newGame(); assert.equal(t.state.nemesis.seen.length, 0);
  assert.equal(t.state.nemesis.active, null); assert.equal(t.state.nemesis.episodes.length, 0);
});
test('Object.create system forks do not share live runtime fields', () => {
  const definition = createNemesisSystem(); const a = boot({ engineDefinition: definition });
  const b = boot({ engineDefinition: definition }); a.start(); a.kill('gun', 222);
  assert.equal(b.state.nemesis.active, null); a.engine.destroy(); b.start();
  assert.ok(b.state.nemesis.active);
});
test('the tactical patch covers both fresh decisions and skipped-decision fire revalidation', () => {
  const source = fs.readFileSync(new URL('../src/systems/tacticalAI.js', import.meta.url), 'utf8');
  assert.equal((source.match(/applyNemesisFireGate\(entity, state\);/g) || []).length, 2);
  assert.match(source, /shapeNemesisManeuverRequest\(request, state, frame\)/);
});
test('shared ace ledger explicitly excludes the nemesis from generic return spawning', () => {
  const source = fs.readFileSync(new URL('../src/systems/aceMemory.js', import.meta.url), 'utf8');
  assert.ok((source.match(/lifecycleOwner === 'nemesis'/g) || []).length >= 5);
  const roster = fs.readFileSync(new URL('../src/data/namedAces.js', import.meta.url), 'utf8');
  assert.match(roster, /CAPTAIN_ALIASES, NEMESIS_RIVAL/);
});


test('actual tumbleStates attackerId field carries player provenance', () => {
  const t = boot(); t.start();
  t.bus.emit('massline:tumbled', { victimId: 912, attackerId: 1, cause: 'self-throw', source: 'massline' });
  t.kill(undefined, 912, { cause: 'terrain_collision' });
  assert.equal(t.state.nemesis.active.episode.counts.tether, 2);
});
test('a recently observed victim remains attributable when death removes it from sensors', () => {
  const t = boot({ sensors: true }); t.start();
  t.state.entities.set(912, { id: 912, hull: 100, alive: true, pos: { x: 200, z: 0 }, data: {} });
  t.advance(0.3); t.state.entities.delete(912);
  t.kill('gun', 912, { witnessIds: [] });
  assert.equal(t.state.nemesis.active.episode.counts.gunnery, 2);
});
test('a stale sighting or current explicit occlusion does not witness a kill', () => {
  const t = boot({ sensors: true }); t.start();
  const victim = { id: 912, hull: 100, alive: true, pos: { x: 200, z: 0 }, data: {} };
  t.state.entities.set(912, victim); t.advance(0.3); victim.visible = false;
  t.kill('gun', 912, { witnessIds: [] }); assert.equal(t.state.nemesis.active.episode.total, 0);
  victim.visible = true; t.advance(0.3); t.state.entities.delete(912); t.advance(1);
  t.kill('gun', 912, { witnessIds: [] }); assert.equal(t.state.nemesis.active.episode.total, 0);
});
test('standing still far from Orra is not fabricated as player kiting', () => {
  const t = boot({ sensors: true }); t.start(); t.advance(22);
  assert.equal(t.state.nemesis.active.episode.counts.kite, 0);
});
test('repeated visible outward movement produces bounded kiting evidence', () => {
  const t = boot({ sensors: true }); t.start(); const boss = bossOf(t);
  const d = Math.hypot(t.player.pos.x - boss.pos.x, t.player.pos.z - boss.pos.z);
  t.player.vel = { x: (t.player.pos.x - boss.pos.x) / d * 100, z: (t.player.pos.z - boss.pos.z) / d * 100 };
  t.advance(22); assert.ok(t.state.nemesis.active.episode.counts.kite > 0);
  assert.ok(t.state.nemesis.active.farSamples <= 3);
  assert.ok(t.state.nemesis.active.witnesses.length <= LIMITS.witnesses);
});
test('empty sector hopping and player defeat do not advance the finale', () => {
  const t = boot(); for (let i = 0; i < 4; i++) { t.start(); t.leave(); }
  assert.equal(t.state.nemesis.progress, 0); t.start();
  t.bus.emit('entity:killed', { id: 1, killerId: bossOf(t).id, type: 'ship' });
  assert.equal(t.state.nemesis.progress, 0);
  assert.equal(t.state.nemesis.nextContactAt, t.state.simTime + LIMITS.returnMaxS);
});
test('an event listener cannot rewrite the locked fit via a deployment payload', () => {
  const t = boot(); t.bus.on('nemesis:encounterRequested', (p) => {
    // Inserted after the host listener; overwrite queued copy to emulate an earlier listener.
    t.host._queued.plan.primary = 'gunnery'; p.plan.primary = 'gunnery';
  });
  t.start(); assert.equal(t.state.nemesis.active.plan.primary, 'open');
  assert.equal(bossOf(t).data.enemyTypeId, NEMESIS_KITS.open.bossArchetype);
});
test('a spawn hook that kills the newly created hull cannot leak a reservation or body', () => {
  const t = boot(); t.bus.on('entity:spawned', ({ entity }) => { entity.alive = false; });
  t.until(() => events(t, 'nemesis:encounterRejected').length > 0);
  assert.equal(t.state.entities.size, 1); assert.equal(t.allocations.size, 0);
  assert.equal(t.state.nemesisDeployment.reservation, null);
});
test('large obstacle surfaces are checked, not just centers inside a tiny radius', () => {
  const t = boot(); t.helpers.queryRadius = (pos) => [{ id: 999, radius: 600, pos: { x: pos.x + 400, z: pos.z } }];
  t.until(() => events(t, 'nemesis:encounterRejected').length > 0);
  assert.equal(t.state.nemesis.active, null); assert.equal(t.state.entities.size, 1);
});
test('retirement waits safely for a missing lifecycle helper rather than losing cleanup work', () => {
  const t = boot(); t.start(); const remove = t.helpers.removeEntity;
  t.helpers.removeEntity = undefined; t.leave();
  assert.ok(t.state.nemesisDeployment.retirement.length > 0);
  t.helpers.removeEntity = remove; t.tick(); assert.equal(t.allocations.size, 0);
  assert.equal(t.state.entities.size, 1);
});
test('active-save restore reproduces uninterrupted retirement timing and complete receipts', () => {
  const a = boot({ sensors: true }), b = boot({ sensors: true });
  for (const t of [a, b]) { t.start(); t.kill('gun', 444); bossOf(t).hull = 28; t.advance(10.13); }
  b.engine.deserialize(b.engine.serialize()); b.host.deserialize(b.host.serialize()); b.bus.emit('save:loaded', {});
  for (const t of [a, b]) { bossOf(t).pos = { x: 1900, z: 0 }; t.advance(8); }
  assert.deepEqual(a.rows, b.rows); assert.deepEqual(a.engine.serialize(), b.engine.serialize());
  assert.deepEqual(a.host.serialize(), b.host.serialize());
});
test('outcome dialogue retains its causal encounter ID after the active record closes', () => {
  const t = boot(); const a = t.start(); t.escape();
  const voice = events(t, 'nemesis:voice').find((row) => row.payload.situation === 'rival_escaped');
  assert.equal(voice.payload.encounterId, a.id);
});

let failures = 0;
const results = [];
for (const { name, fn } of tests) {
  try { fn(); console.log(`PASS ${name}`); results.push({ name, ok: true }); }
  catch (error) { failures++; console.error(`FAIL ${name}\n${error.stack}`); results.push({ name, ok: false, error: error.message }); }
}
console.log(`\nNemesis acceptance: ${tests.length - failures}/${tests.length} passed; ${failures} failed.`);
if (process.argv.includes('--json')) {
  const index = process.argv.indexOf('--json');
  fs.writeFileSync(process.argv[index + 1], JSON.stringify({ evidenceClass: 'focused-explicit',
    fullProductionManifest: false, tests: results, passed: tests.length - failures, failed: failures }, null, 2));
}
process.exitCode = failures ? 1 : 0;
