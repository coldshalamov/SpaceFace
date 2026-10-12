import test from 'node:test';
import assert from 'node:assert/strict';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { orbitalGallery } from '../src/gallery/orbital/system.js';
import { createKineticLeague } from '../src/sports/kineticLeague/system.js';
import { fields } from '../src/systems/fields.js';
import { normalizeLedger } from '../src/gallery/orbital/score.js';
import { chooseClearVenueCenter } from '../src/gallery/orbital/venue.js';

async function host(rot = 0) {
  const run = await bootRealPath({ seed: 4242,
    systems: [orbitalGallery, createKineticLeague(), fields, 'flightV3', 'actions', 'physics'],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: 0, z: 0 }, rot, isPlayer: true }] });
  run.state.mode = 'flight';
  return run;
}

test('Gallery preserves live raw input, uses a relative clock and removes only its own bodies', async () => {
  const run = await host();
  try {
    const gallery = run.runtime.getSystem('orbitalGallery');
    run.step(300);
    const tick = run.state.tick;
    const result = gallery.start('og-a1-straight-cue');
    assert.equal(result.ok, true, result.reason);
    const live = run.state.orbitalGallery;
    assert.equal(live.source, 'live');
    assert.equal('kernel' in live, false, 'native combat port remains outside mirrored GameState');
    assert.equal(live.tape, undefined, 'winning exhibit trace never enters the live route');
    const raw = { moveX: 0.25, moveZ: 0, turnIntent: 0.1, actions: { massline: { cut: false } } };
    Object.assign(run.state.input, raw);
    run.step(1);
    assert.equal(run.state.input.moveX, 0.25);
    assert.strictEqual(run.state.input.actions, raw.actions);
    assert.equal(live.playStartTick, tick);
    assert.equal(gallery.status().phase, 'live', 'late campaign entry does not immediately time out');
    const cue = run.state.entities.get(live.roles.cue);
    run.assertBodies([run.player, cue], 'live-gallery');
    assert.equal(run.proof().physicsBackend, 'rapier-dynamic');
    const foreign = run.runtime.spawn({ type: 'payload', pos: { x: 300, z: 300 }, radius: 2,
      mass: 4, hull: 100, collides: true });
    gallery.leave();
    assert.equal(run.state.entities.has(cue.id), false);
    assert.equal(run.state.entities.has(foreign.id), true);
    assert.equal(run.state.entities.has(run.player.id), true);
  } finally { run.dispose(); }
});

test('League enter and retry create real unsolved matches, never an auto-play exhibit', async () => {
  const run = await host();
  try {
    const league = run.runtime.getSystem('kineticLeague');
    const first = league.enterMatch('kl-01');
    assert.equal(first.ok, true, first.reason);
    assert.equal(first.phase, 'play');
    assert.equal(first.tick, 0);
    assert.equal(first.goals, 0);
    assert.equal(first.authoritative, true);
    assert.equal(run.state.physicsVenuePublic.kind, 'league');
    assert(run.state.physicsVenuePublic.events.every(event => !('solution' in event)));
    assert.doesNotThrow(() => JSON.stringify(run.state.physicsVenuePublic));
    const ball = league._venue.entity('ball');
    run.step(3);
    run.assertBodies([run.player, ball], 'live-league');
    const oldOwned = [...league._venue.owned].map(id => run.state.entities.get(id));
    const retried = league.retry();
    assert.equal(retried.phase, 'play');
    assert.equal(retried.tick, 0);
    assert.equal(retried.goals, 0);
    for (const entity of oldOwned) assert.notEqual(run.state.entities.get(entity.id), entity, `old body ${entity.id}`);
    assert.notEqual(league._venue.entity('ball'), ball);
    const input = run.state.input;
    Object.assign(input, { moveX: 0.1, moveZ: -1, turnIntent: 0,
      actions: { massline: { phase: 'preview', latch: true, cut: false }, tetherFire: false } });
    const massline = input.actions.massline;
    run.step(1);
    assert.equal(input.moveZ, -1);
    assert.strictEqual(input.actions.massline, massline);
    league.leave();
    assert.equal(league.footprint(), 0);
  } finally { run.dispose(); }
});

test('League rail collider, career save and genuine active-session resume use production bodies', async () => {
  const run = await host();
  try {
    const league = run.runtime.getSystem('kineticLeague');
    const session = league.beginMatch('kl-04');
    assert.equal(session.ok, true, session.reason);
    const rail = league._venue.entity('rail-w');
    run.step(2);
    run.assertBodies([rail, league._venue.entity('ball')], 'bank-court');
    const proxy = rail.physicsBody.collisionProxyManifest;
    assert.equal(proxy.primitives[0].kind, 'obb');
    assert(Math.abs(proxy.primitives[0].hz * rail.radius - 1) < 1e-6,
      'normalized rail proxy resolves to one WU half-thickness, not a court-wide collider');
    const saved = league.serialize();
    const json = JSON.parse(JSON.stringify(saved));
    assert.equal(json.session.authoritative, true);
    league.deserialize(json);
    assert.equal(league.footprint(), 0);
    run.step(1);
    assert(league.footprint() > 0);
    assert.equal(league.session.event.id, 'kl-04');
    assert.equal(league.session.authoritative, true);
    assert.equal(league.state.kineticLeague.records['kl-04'].attempts, 1,
      'resume does not mint another attempt or purse');
    league.leave();
    assert.equal(league.state.kineticLeague.scrip, 0);
  } finally { run.dispose(); }
  assert.equal(normalizeLedger({ schema: 'bad', best: { fake: { won: true, total: 100 } } }).best.fake, undefined);
});

test('a player-driven Gallery delivery earns its score from real movement and preserves the wallet', async () => {
  const run = await host();
  try {
    const gallery = run.runtime.getSystem('orbitalGallery');
    const credits = run.state.player.credits;
    let finished;
    run.bus.on('orbital-gallery:finished', payload => { finished = payload; });
    assert.equal(gallery.start('og-a1-straight-cue').ok, true);
    run.state.input.moveZ = 1;
    run.step(40);
    run.state.input.moveZ = 0;
    run.state.input.brake = true;
    run.step(260);
    const result = run.state.orbitalGallery.result;
    assert.equal(result?.won, true, JSON.stringify({ ...gallery.status(),
      pilot: run.player.pos, cue: run.state.entities.get(run.state.orbitalGallery.roles.cue)?.pos }));
    assert(result.score.total > 0);
    assert.equal(run.state.player.credits, credits);
    assert.equal(gallery.serialize().attempts['og-a1-straight-cue'], 1);
    assert.equal(finished.ledger.best['og-a1-straight-cue'].total, result.score.total,
      'finished receipt carries the earned durable record directly');
  } finally { run.dispose(); }
});

test('a player-driven League goal is judged from the real ball crossing, not a tape', async () => {
  const run = await host(-Math.PI / 2);
  try {
    const league = run.runtime.getSystem('kineticLeague');
    const session = league.beginMatch('kl-01');
    const ball = league._venue.entity('ball');
    const hits = [];
    run.bus.on('physics:impact', p => hits.push([league._venue?.key(p.aId), league._venue?.key(p.bId)]));
    run.step(80); // Read the keeper's real commitment to its post before delivering.
    run.state.input.moveZ = 1;
    run.step(45);
    run.state.input.moveZ = 0;
    run.state.input.brake = true;
    run.step(150);
    assert(session.goals >= 1, JSON.stringify({ phase: session.phase, goals: session.goals, ball: ball.pos, velocity: ball.vel,
      keeper: league._venue.entity('keeper')?.pos, hits: hits.slice(-10),
      pilot: run.player.pos, contacts: session.playerTouched, log: session.log }));
    assert.equal(run.state.kineticLeague.scrip, 0, 'an unfinished event pays no purse');
    const saved = league.serialize();
    const nextBall = session.bodies.find(body => body.role === 'ball' && body.alive);
    assert(nextBall?.id.startsWith('ball-'));
    league.deserialize(JSON.parse(JSON.stringify(saved)));
    run.step(1);
    assert.equal(league.session.bodies.find(body => body.id === nextBall.id)?.alive, true);
    assert(league._venue.entity(nextBall.id)?.alive, 'later serves resume as genuine bodies');
  } finally { run.dispose(); }
});

test('court placement leaves room for native bodies, dressing and environmental fields', () => {
  const player = { pos: { x: 0, z: 0 }, radius: 12, alive: true };
  const station = { pos: { x: 0, z: 0 }, radius: 200, collides: true, alive: true };
  const state = { entities: new Map([[1, player], [2, station]]), entityList: [player, station],
    world: { bounds: { center: { x: 0, z: 0 }, radius: 3000 }, asteroidField: { rocks: [] }, dressing: { rows: [] } } };
  const center = chooseClearVenueCenter(state, player, [{ x: 0, z: 50, radius: 8 }], [], [],
    [{ center: { x: 0, z: 0 }, radius: 180 }]);
  assert(center);
  assert(Math.hypot(center.x, center.z) > 200 + 180 + 30);
  assert.deepEqual(player.pos, { x: 0, z: 0 }, 'selection cannot move the pilot outside the world port');
});

test('the live relay observes the real Massline action_cut event without treating brake as a cut', async () => {
  const run = await host(-Math.PI / 2);
  try {
    const league = run.runtime.getSystem('kineticLeague');
    const session = league.beginMatch('kl-09');
    run.step(2);
    const payload = league._venue.entity('payload');
    const attachments = league._venue.kernel.attachments;
    const attached = attachments.create({ defId: 'tether_standard', ownerId: run.player.id,
      targetId: payload.id, restLength: 18,
      sourceWorld: { ...run.player.pos, y: 0 }, targetWorld: { ...payload.pos, y: 0 } });
    assert.equal(attached.ok, true, attached.reason);
    assert.equal(session.playerTouched, true);
    run.state.input.brake = true;
    run.step(20);
    assert.equal(attached.attachment.state, 'active', 'braking keeps the actual rope');
    assert.equal(attachments.cut(attached.attachment.id, run.player.id, 'action_cut').ok, true);
    assert.equal(league._contacts[0]?.kind, 'tether-cut');
    run.step(1);
    assert.equal(session.legalTransfers, 0, 'a real cut outside a handoff zone earns no transfer');
  } finally { run.dispose(); }
});
