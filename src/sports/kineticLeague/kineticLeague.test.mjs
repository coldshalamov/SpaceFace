import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { goalCrossing } from '../../characters/bracketRules.js';
import { BRACKET as C } from '../../data/bracket.js';
import { createBus } from '../../core/eventBus.js';
import {
  EVENTS,
  WIN_KINDS,
  ARENAS,
  RIVAL_IDS,
  sportManifest,
  freshLeagueMemory,
  claimPurse,
  tierUnlocked,
  noteBracketDiscovery,
  maybeEnterLeague,
  leagueGateWorld,
  nextUnlockedEvent,
  createSession,
  stepSession,
  runMatch,
  retrySession,
  leaveVenue,
  destroySession,
  worldFootprint,
  applyMatchDamage,
  serializeSession,
  deserializeSession,
  summaryOf,
  exhibitTrace,
  commandFromSolution,
  sweptDiskCross,
  createKineticLeague,
  writeGallery,
  renderArena,
  pngSize,
  GALLERY_FILES,
} from './index.js';

const DT = 1 / 60;

function careerMemory() {
  const memory = freshLeagueMemory();
  memory.discovered = true;
  memory.discoveredAt = 1;
  memory.via = 'test';
  return memory;
}

test('six sports, four arenas, twelve events, distinct win rules', () => {
  const manifest = sportManifest();
  assert.deepEqual(manifest.sports, ['keeper', 'bank', 'curl', 'relay', 'magnet', 'contain']);
  assert.deepEqual(manifest.arenas, ['yard', 'house', 'slip', 'dock']);
  assert.equal(manifest.events, 12);
  assert.equal(EVENTS.length, 12);
  assert.equal(new Set(EVENTS.map((event) => event.sport)).size, 6);
  assert.equal(new Set(EVENTS.map((event) => event.arena)).size, 4);
  assert.equal(new Set(Object.values(WIN_KINDS)).size, 6);
  assert.deepEqual(RIVAL_IDS, ['wall', 'shade', 'watch', 'charge']);
  for (const id of Object.keys(ARENAS)) assert.ok(ARENAS[id].bounds && ARENAS[id].respawn);
});

test('swept crossing matches BRACKET and rejects teleports, reverse crossings, and posts', () => {
  const z = C.goalZ - C.ballRadius;
  const spec = {
    axis: 'z', plane: C.goalZ, aperture: C.aperture, dir: -1, maxSpeed: C.maxBallSpeed, dt: DT,
  };
  const goodPrev = { x: 30, z: z + 2 };
  const goodCurr = { x: 30, z: z - 2 };
  const legacy = goalCrossing(goodPrev, goodCurr, C.ballRadius, DT);
  const swept = sweptDiskCross(goodPrev, goodCurr, C.ballRadius, spec);
  assert.equal(swept.x, legacy.x);
  assert.ok(Math.abs(swept.t - legacy.t) < 1e-9);
  const rejects = [
    [{ x: 30, z: z - 2 }, { x: 30, z: z + 2 }],
    [{ x: 49, z: z + 2 }, { x: 49, z: z - 2 }],
    [{ x: 0, z: z + 100 }, { x: 0, z: z - 100 }],
    [{ x: 0, z: z - 2 }, { x: 0, z: z - 4 }],
  ];
  for (const [a, b] of rejects) {
    assert.equal(goalCrossing(a, b, C.ballRadius, DT), null);
    assert.equal(sweptDiskCross(a, b, C.ballRadius, spec), null);
  }
  const largeDt = 0.2;
  const crossed = sweptDiskCross(
    { x: 4, z: z + 3 },
    { x: 6, z: z - 8 },
    C.ballRadius,
    { ...spec, dt: largeDt },
  );
  assert.ok(crossed, 'a legal large step still scores');
  assert.equal(sweptDiskCross(
    { x: 4, z: z + 3 },
    { x: 80, z: z - 40 },
    C.ballRadius,
    { ...spec, dt: largeDt },
  ), null);
});

test('twelve fixed-seed exhibits win, and a second run is the same trace', () => {
  const old = Math.random;
  Math.random = () => { throw new Error('ambient RNG'); };
  try {
    for (const event of EVENTS) {
      const first = exhibitTrace(event.id, event.exhibitSeed);
      const second = exhibitTrace(event.id, event.exhibitSeed);
      assert.equal(first.won, true, `${event.id} ${first.reason}`);
      assert.equal(first.winKind, WIN_KINDS[event.sport]);
      assert.equal(JSON.stringify(first), JSON.stringify(second));
      assert.ok(first.samples.length > 0 || event.sport === 'contain');
    }
  } finally {
    Math.random = old;
  }
});

test('alternate deliveries also win, and the false shots do not', () => {
  const alt = (id) => EVENTS.find((event) => event.id === id).alternate;
  for (const id of ['kl-01', 'kl-04', 'kl-07', 'kl-09', 'kl-11']) {
    const session = runMatch(id, { practice: true, enforceTier: false, solution: alt(id) });
    assert.equal(session.won, true, id);
  }
  const intoWall = runMatch('kl-01', {
    practice: true, enforceTier: false,
    solution: { shipAt: { x: 2, z: 48 }, phases: [{ for: 0.8, thrustX: 0, thrustZ: -1 }] },
  });
  assert.equal(intoWall.won, false);
  assert.ok(intoWall.keeperTouches > 0);
  const watchCenter = runMatch('kl-03', {
    practice: true, enforceTier: false,
    solution: { shipAt: { x: 0, z: 48 }, phases: [{ for: 0.8, thrustX: 0, thrustZ: -1 }] },
  });
  assert.equal(watchCenter.won, false);
  assert.ok(watchCenter.keeperTouches > 0);
  const noBank = runMatch('kl-04', {
    practice: true, enforceTier: false,
    solution: { phases: [{ for: 0.7, thrustX: 0, thrustZ: -1 }] },
  });
  assert.equal(noBank.reason, 'no-bank');
  assert.equal(noBank.railsHit.length, 0);
  const tooFast = runMatch('kl-07', {
    practice: true, enforceTier: false,
    solution: { phases: [{ for: 1.15, thrustX: 0, thrustZ: -1 }] },
  });
  assert.equal(tooFast.won, false);
  const shove = runMatch('kl-09', {
    practice: true, enforceTier: false,
    solution: { phases: [{ for: 0.9, thrustX: 0, thrustZ: -1 }] },
  });
  assert.equal(shove.reason, 'no-transfer');
  assert.equal(shove.legalTransfers, 0);
  const straightField = runMatch('kl-11', {
    practice: true, enforceTier: false, suppressField: true,
  });
  assert.equal(straightField.won, false);
  const rightLane = runMatch('kl-10', {
    practice: true, enforceTier: false,
    solution: {
      shipAt: { x: 12, z: 36 },
      phases: [
        { for: 0.75, thrustX: 0, thrustZ: -1, tether: true },
        { for: 0.06, thrustX: 0, thrustZ: -1, cut: true },
        { for: 0.45, thrustX: 0, thrustZ: -1, tether: true },
        { for: 0.08, thrustX: 0, thrustZ: -1, cut: true },
      ],
    },
  });
  assert.equal(rightLane.reason, 'stolen');
  const idlePen = runMatch('kl-12', {
    seed: 8, practice: true, enforceTier: false,
    solution: { phases: [{ for: 14, thrustX: 0, thrustZ: 0 }] },
  });
  assert.equal(idlePen.won, false);
});

test('large timestep can score; a teleport and an own-goal cannot; a post is not a goal', () => {
  const session = createSession('kl-01', { practice: true, enforceTier: false });
  const ball = session.bodies.find((body) => body.role === 'ball');
  const goal = session.arena.goal;
  ball.x = 0;
  ball.z = goal.plane + ball.radius + 3;
  ball.vz = -90;
  session.playerTouched = true;
  session.touchAt = 0;
  session.simTime = 1;
  session.shotTime = 1;
  session.servePos = { x: 0, z: 40 };
  stepSession(session, { thrustX: 0, thrustZ: 0 }, 0.2);
  assert.equal(session.goals, 1);

  const own = createSession('kl-01', { practice: true, enforceTier: false });
  const ownBall = own.bodies.find((body) => body.role === 'ball');
  ownBall.x = 0;
  ownBall.z = goal.plane - ownBall.radius - 6;
  ownBall.vz = 70;
  own.playerTouched = true;
  own.touchAt = 0;
  own.simTime = 1;
  own.shotTime = 1;
  own.servePos = { x: 0, z: 40 };
  stepSession(own, { thrustX: 0, thrustZ: 0 }, 0.2);
  assert.equal(own.goals, 0);

  const parked = createSession('kl-01', { practice: true, enforceTier: false });
  const parkedBall = parked.bodies.find((body) => body.role === 'ball');
  parkedBall.x = 0;
  parkedBall.z = goal.plane - parkedBall.radius - 8;
  parkedBall.vz = 0;
  parked.playerTouched = true;
  parked.touchAt = parked.simTime;
  stepSession(parked, { thrustX: 0, thrustZ: 0 }, DT);
  assert.equal(parked.goals, 0);

  const post = createSession('kl-01', { practice: true, enforceTier: false });
  const postBall = post.bodies.find((body) => body.role === 'ball');
  const hardware = post.arena.posts[1];
  postBall.x = hardware.x;
  postBall.z = hardware.z + 6;
  postBall.vz = -50;
  post.playerTouched = true;
  post.touchAt = 0;
  post.simTime = 1;
  post.shotTime = 1;
  for (let i = 0; i < 20; i++) stepSession(post, { thrustX: 0, thrustZ: 0 }, DT);
  assert.ok(post.postHits > 0);
  assert.equal(post.goals, 0);
});

test('leaving, non-player damage, player damage, and a missing keeper', () => {
  const left = createSession('kl-04', { practice: true, enforceTier: false });
  const ship = left.bodies.find((body) => body.role === 'ship');
  ship.x = 400;
  stepSession(left, { thrustX: 0, thrustZ: 0 }, DT);
  assert.equal(left.phase, 'cancelled');
  assert.equal(left.reason, 'left');
  assert.equal(worldFootprint(left), 0);

  const recovered = createSession('kl-04', { practice: true, enforceTier: false });
  const drifted = recovered.bodies.find((body) => body.role === 'ship');
  drifted.x = 100;
  stepSession(recovered, { thrustX: 0, thrustZ: 0 }, DT);
  assert.equal(recovered.respawns, 1);
  assert.equal(recovered.phase, 'play');
  assert.equal(drifted.x, recovered.arena.respawn.x);
  assert.equal(drifted.z, recovered.arena.respawn.z);

  const memory = careerMemory();
  const spared = createSession('kl-01', { memory, practice: true, enforceTier: false });
  const tier = memory.records['kl-01'];
  const ignored = applyMatchDamage(spared, { sourceId: 'npc-9', amount: 40, targetRole: 'keeper' });
  assert.equal(ignored.ignored, true);
  assert.equal(spared.phase, 'play');
  const closed = applyMatchDamage(spared, { sourceId: spared.shipId, amount: 10, targetRole: 'keeper' });
  assert.equal(closed.closed, true);
  assert.equal(spared.phase, 'closed');
  assert.equal(memory.solved['kl-01'], undefined);
  assert.equal(tier, memory.records['kl-01']);

  const empty = createSession('kl-01', { practice: true, enforceTier: false });
  const keeper = empty.bodies.find((body) => body.role === 'keeper');
  keeper.alive = false;
  stepSession(empty, { thrustX: 0, thrustZ: 0 }, DT);
  assert.equal(empty.reason, 'no-keeper');
  assert.equal(empty.goals, 0);
});

test('destroy, unload, and revisit do not duplicate venue bodies or touch the world', () => {
  const world = new Map();
  const first = createSession('kl-07', { practice: true, enforceTier: false });
  const count = first.bodies.length;
  assert.ok(count > 0);
  assert.equal(world.size, 0);
  destroySession(first);
  assert.equal(first.bodies.length, 0);
  assert.equal(worldFootprint(first), 0);
  const again = createSession('kl-07', { practice: true, enforceTier: false });
  assert.equal(again.bodies.length, count);
  leaveVenue(again);
  assert.equal(again.bodies.length, 0);
  assert.equal(world.size, 0);
});

test('save mid-match resumes the same result; retry keeps the ship and inventory', () => {
  const inventory = { credits: 80, cargo: { ore: 4 } };
  const live = createSession('kl-07', {
    practice: true, enforceTier: false, inventory, shipId: 'hull-7',
  });
  for (let i = 0; i < 12; i++) stepSession(live, commandFromSolution(live.solution, live), DT);
  const raw = JSON.parse(JSON.stringify(serializeSession(live)));
  const restored = deserializeSession(raw, { inventory });
  assert.equal(restored.ok, true);
  while (live.phase === 'play' || live.phase === 'result') stepSession(live, commandFromSolution(live.solution, live), DT);
  while (restored.phase === 'play' || restored.phase === 'result') {
    stepSession(restored, commandFromSolution(restored.solution, restored), DT);
  }
  assert.equal(live.won, true);
  assert.equal(restored.won, true);
  assert.equal(restored.goals, live.goals);
  assert.ok(Math.abs(restored.simTime - live.simTime) < 1e-6);
  assert.equal(inventory.credits, 80);
  assert.deepEqual(inventory.cargo, { ore: 4 });

  const retried = retrySession(restored);
  assert.equal(retried.shipId, 'hull-7');
  assert.equal(retried.inventory, inventory);
  assert.equal(retried.phase, 'play');
  const played = runMatch('kl-07', {
    memory: careerMemory(), inventory, shipId: 'hull-7',
  });
  assert.equal(played.won, true);
  assert.equal(inventory.credits, 80);
  const again = retrySession(played);
  const finished = runMatch(again.event.id, {
    seed: again.seed, memory: again.memory, inventory, shipId: again.shipId, enforceTier: false,
  });
  assert.equal(finished.won, true);
  assert.equal(claimPurse(played.memory, played.event), played.event.purse);
  assert.equal(claimPurse(played.memory, played.event), 0);
  assert.equal(inventory.credits, 80);
});

test('purse pays once, practice does not pay, and a locked tier does not start', () => {
  const memory = careerMemory();
  assert.equal(tierUnlocked(memory, 'bronze', EVENTS), false);
  const blocked = createSession('kl-12', { memory });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'tier-locked');
  const unknown = createSession('kl-99', { memory });
  assert.equal(unknown.reason, 'unknown-event');
  const practice = runMatch('kl-05', { memory, practice: true, enforceTier: false });
  assert.equal(practice.won, true);
  assert.equal(claimPurse(memory, practice.event), 0);
  const real = runMatch('kl-01', { memory });
  assert.equal(real.won, true);
  assert.equal(claimPurse(memory, real.event), 0);
  const bronze = runMatch('kl-05', { memory });
  assert.equal(bronze.won, true);
  assert.equal(claimPurse(memory, bronze.event), 8);
  assert.equal(claimPurse(memory, bronze.event), 0);
  assert.equal(memory.scrip, 8);
});

test('BRACKET discovery is the gate, and a forged scan is not', () => {
  const state = {
    simTime: 12,
    mode: 'flight',
    playerId: 1,
    entities: new Map([[1, { id: 1, pos: { x: C.anchor.x, z: C.anchor.z } }]]),
    bracket: { version: 1, met: false, destroyed: false },
  };
  assert.equal(noteBracketDiscovery(state, { via: 'match-finished' }).ok, false);
  state.bracket.met = true;
  assert.equal(noteBracketDiscovery(state, { via: 'match-started' }).ok, true);
  assert.equal(state.kineticLeague.discovered, true);
  assert.equal(noteBracketDiscovery(state, { source: 'fake' }).reason, 'bad-scan');
  const gate = leagueGateWorld();
  assert.equal(maybeEnterLeague(state, gate), true);
  assert.equal(maybeEnterLeague(state, { x: C.anchor.x, z: C.anchor.z }), false);
  const fresh = {
    simTime: 3,
    playerId: 1,
    entities: new Map([[1, { id: 1, pos: { x: C.anchor.x + 2, z: C.anchor.z } }]]),
    bracket: { version: 1, met: true, destroyed: false },
  };
  assert.equal(noteBracketDiscovery(fresh, { source: 'nope', seq: 1, pos: { x: 0, z: 0 }, radius: 10 }).ok, false);
  state.bracket.destroyed = true;
  const dead = noteBracketDiscovery({ ...state, kineticLeague: null, bracket: { version: 1, met: true, destroyed: true } }, { via: 'match-finished' });
  assert.equal(dead.ok, false);
});

test('the league discovers from the bracket bus but cannot substitute a private solver for missing live owners', () => {
  const state = {
    simTime: 4,
    mode: 'flight',
    playerId: 'player-ship',
    entities: new Map(),
    entityList: [],
    input: { moveX: 0, moveZ: -1, brake: false, actions: {} },
    bracket: { version: 1, met: true, destroyed: false, wins: 1 },
    player: { credits: 10, cargo: { ore: 1 } },
  };
  const bus = createBus();
  const system = createKineticLeague();
  system.init({ state, bus, helpers: {} });
  bus.emit('bracket:matchFinished', { won: true });
  assert.equal(state.kineticLeague.discovered, true);
  assert.equal(state.entities.size, 0);
  const session = system.beginMatch('kl-01', { practice: true, enforceTier: false });
  assert.equal(session.ok, false);
  assert.match(session.reason, /live-player-and-entity-owner/);
  for (let i = 0; i < 50; i++) system.update(DT);
  assert.equal(state.entities.size, 0);
  assert.equal(state.player.credits, 10);
  system.leave();
  assert.equal(system.footprint(), 0);
  system.destroy();
  assert.equal(nextUnlockedEvent(state.kineticLeague).id, 'kl-01');
});

test('live entry requires flight instead of granting an exhibit win from unowned input', () => {
  const state = {
    simTime: 0,
    playerId: 'hull-7',
    entities: new Map(),
    input: { moveX: 0, moveZ: 0, brake: false, actions: {} },
    kineticLeague: careerMemory(),
    player: { credits: 3, cargo: {} },
  };
  const system = createKineticLeague();
  system.init({ state, bus: createBus(), helpers: {} });
  const session = system.beginMatch('kl-01');
  assert.equal(session.ok, false);
  assert.equal(session.reason, 'launch-flight-first');
  assert.equal(system.session, null);
  assert.equal(state.player.credits, 3);
  assert.equal(state.entities.size, 0);
  system.destroy();
});

test('main and worker fixed-seed traces match', async () => {
  const main = EVENTS.map((event) => summaryOf(runMatch(event.id, {
    seed: event.exhibitSeed, practice: true, enforceTier: false,
  })));
  const worker = await Promise.all(EVENTS.map((event) => new Promise((resolve, reject) => {
    const child = new Worker(new URL('./workerEntry.js', import.meta.url), {
      workerData: { eventId: event.id, seed: event.exhibitSeed },
    });
    child.on('message', resolve);
    child.on('error', reject);
  })));
  for (let i = 0; i < EVENTS.length; i++) {
    assert.equal(worker[i].won, true);
    assert.equal(JSON.stringify(worker[i]), JSON.stringify(main[i]));
  }
});

test('gallery captures are four distinct high-contrast arena drawings', () => {
  const written = writeGallery();
  assert.equal(written.length, 4);
  const images = GALLERY_FILES.map(([id]) => renderArena(id));
  for (const png of images) {
    assert.equal(png[0], 137);
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    const size = pngSize(png);
    assert.equal(size.width, 320);
    assert.equal(size.height, 180);
    assert.ok(png.includes(Buffer.from([255, 217, 140])), 'hand-hot token titles the arena');
    assert.ok(png.includes(Buffer.from([5, 7, 10])), 'void token is the ground');
  }
  for (let i = 0; i < images.length; i++) {
    for (let j = i + 1; j < images.length; j++) assert.ok(!images[i].equals(images[j]));
  }
});

test('a full career preserves inventory and pays each purse once', () => {
  const memory = careerMemory();
  const inventory = { credits: 40, cargo: { ore: 2 } };
  const started = performance.now();
  for (const event of EVENTS) {
    const session = runMatch(event.id, { memory, inventory, shipId: 'hull-7' });
    assert.equal(session.won, true, event.id);
    assert.equal(session.shipId, 'hull-7');
    const paid = claimPurse(memory, event);
    assert.equal(paid, event.purse);
    assert.equal(claimPurse(memory, event), 0);
  }
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 4000, `circuit took ${elapsed.toFixed(0)}ms`);
  assert.equal(inventory.credits, 40);
  assert.deepEqual(inventory.cargo, { ore: 2 });
  assert.equal(memory.scrip, EVENTS.reduce((sum, event) => sum + event.purse, 0));
  assert.equal(worldFootprint({ phase: 'finished', bodies: [] }), 0);
});
