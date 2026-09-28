/**
 * Cloak interplay (Wave M2 §4.2 — "cloak is a verb, not a flag"). Engaging cloak while already
 * tracked must measurably degrade what was tracking you:
 *   - an established sensor contact fades on a dead-reckoned ghost (visible:false, confidence
 *     bleeding) over a bounded window, then is lost — no teleporting out of memory;
 *   - a held missile lock bleeds out over a short hold and drops;
 *   - an in-flight homing round loses turn authority, then flies the chaff vocabulary
 *     (diverted + stale divertPos) instead of holding the real hull;
 *   - a scanner pulse burns the cloak open for a bounded reveal window (cloak:burned).
 * Player cloak (state.massline2.cloak) and NPC cloak (entity.data.cloak) obey the same rules;
 * everything runs on simTime with no ambient randomness, so a fixed seed replays identically.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { MASSLINE2_FLAGS, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { cloak, engageEntityCloak, cloakHidesEntityFrom } from '../src/systems/cloak.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { ai as legacyAi } from '../src/systems/ai.js';
import { weapons } from '../src/systems/weapons.js';

const DT = 1 / 60;

function makeWorld(seed = 47) {
  const bus = createBus();
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, mass: 18,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, flags: {},
    data: { weapons: [], combat: {} },
  };
  const hunter = {
    id: 2, type: 'ship', alive: true, team: 1, mass: 20,
    pos: { x: 800, z: 0 }, vel: { x: 0, z: 0 }, rot: Math.PI, radius: 8, flags: {},
    data: {
      ai: {},
      weapons: [{ defId: 'wpn_missile_rack_m' }],
      combat: { targetId: 1 },
    },
  };
  const npcTarget = {
    // Inside the hunter's 1600 wu sensor bubble (1200 away) but OUTSIDE a pulse fired on the
    // player at the origin (1442 away > the 1200 sweep) — the two burn events stay separable.
    id: 3, type: 'ship', alive: true, team: 1, mass: 20,
    pos: { x: 800, z: 1200 }, vel: { x: 0, z: -15 }, rot: -Math.PI / 2, radius: 8, flags: {},
    data: { ai: {}, weapons: [], combat: {} },
  };
  const entityList = [player, hunter, npcTarget];
  const state = {
    mode: 'flight',
    playerId: 1,
    tick: 0,
    simTime: 0,
    meta: { seed },
    rng: mulberry32(seed),
    player: { ownedShips: [{ fittings: ['mod_cloak_mk1'] }], activeShipIndex: 0, tether: null },
    input: { fire: false, actions: {} },
    combat: { beams: [], entities: {} },
    entities: new Map(entityList.map((e) => [e.id, e])),
    entityList,
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      version: 0,
      ships: entityList,
      weaponShips: [hunter],
      projectiles: [],
      vectorMines: [],
      collidables: entityList,
    },
    tacticalAiRuntime: { quietLatched: false },
    massline2: {},
  };
  const helpers = {
    getEntity: (id) => state.entities.get(id) || null,
    spawnEntity() { return null; },
    hash32,
    mulberry32,
  };
  const cloakSys = Object.create(cloak);
  cloakSys.init({ state, bus, helpers });
  const ports = Object.create(aiPorts);
  ports.init({ state, bus, helpers });
  const guns = Object.create(weapons);
  guns.init({ state, bus, helpers });
  return { state, bus, helpers, cloakSys, ports, guns, player, hunter, npcTarget };
}

function step(world) {
  world.state.simTime += DT;
  world.state.tick += 1;
  world.cloakSys.update(DT, world.state);
}

function engagePlayerCloak(world) {
  world.state.input.actions.cloakToggle = true;
  world.cloakSys.update(DT, world.state);
  world.state.input.actions.cloakToggle = false;
  assert.equal(world.state.massline2.cloak.active, true, 'fitted shroud + charge must engage');
}

function contactOf(frame, id) {
  return frame.contacts.find((c) => c.id === id) || null;
}

/** Tick the sensor frame for `observerId` while the target's cloak is up; returns the per-tick
 *  confidence list of the (ghost) contact. Stops sampling at `ticks` or when the frame drops it. */
function sampleFadeTimeline(world, observerId, targetId, ticks = 240) {
  const confidences = [];
  let lostAt = -1;
  for (let i = 1; i <= ticks; i++) {
    step(world);
    const frame = world.helpers.aiSensors.frameFor(observerId, world.state.tick);
    const c = contactOf(frame, targetId);
    if (c) {
      assert.equal(c.visible, false, `darkened contact read visible on fade tick ${i}`);
      confidences.push(c.confidence);
    } else if (lostAt < 0) {
      lostAt = i;
      break;
    }
  }
  return { confidences, lostAt };
}

function assertStrictlyFalling(series, label) {
  assert.ok(series.length > 1, `${label}: need samples to compare`);
  for (let i = 1; i < series.length; i++) {
    assert.ok(series[i] < series[i - 1], `${label}: confidence must fall each tick (${series[i - 1]} -> ${series[i]})`);
  }
}

function withCloakFlag(fn) {
  const snap = snapshotFeatureMaps();
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.cloak = true;
  try {
    fn();
  } finally {
    restoreFeatureMaps(snap);
  }
}

test('an established contact fades to lost on a dead-reckoned ghost over a bounded window', () => {
  withCloakFlag(() => {
    const world = makeWorld();
    const { state, player } = world;

    const frame0 = world.helpers.aiSensors.frameFor(2, state.tick);
    const seen = contactOf(frame0, player.id);
    assert.ok(seen && seen.visible !== false && seen.confidence > 0.3, 'hunter must hold the player as a live contact first');

    engagePlayerCloak(world);
    assert.equal(cloakHidesEntityFrom(state, world.hunter, player), true, 'hunter sits outside the live ring');

    const { confidences, lostAt } = sampleFadeTimeline(world, 2, player.id);
    assert.ok(confidences.length >= 60, `fade must read as a fade, not a pop — ${confidences.length} ghost ticks`);
    assert.ok(lostAt > 0 && lostAt <= Math.ceil(2.1 / DT) + 2, `contact must be lost inside the bounded window, lostAt=${lostAt}`);
    assertStrictlyFalling(confidences, 'player cloak fade');
    assert.ok(confidences[0] >= 0.3, 'the ghost starts near the last real confidence');

    // Once lost it stays lost while the cloak holds — the ship went dark, not teleporting.
    for (let i = 0; i < 60; i++) {
      step(world);
      const frame = world.helpers.aiSensors.frameFor(2, state.tick);
      assert.equal(contactOf(frame, player.id), null);
    }
  });
});

test('an NPC cloak plays by the same rules against an NPC observer', () => {
  withCloakFlag(() => {
    const world = makeWorld();
    const { state, hunter, npcTarget } = world;

    const frame0 = world.helpers.aiSensors.frameFor(hunter.id, state.tick);
    assert.ok(contactOf(frame0, npcTarget.id), 'hunter must see the NPC ship first');

    engageEntityCloak(npcTarget, 300);
    assert.equal(cloakHidesEntityFrom(state, hunter, npcTarget), true);

    const { confidences, lostAt } = sampleFadeTimeline(world, hunter.id, npcTarget.id);
    assert.ok(confidences.length >= 60, 'NPC cloak must fade the same bounded way');
    assert.ok(lostAt > 0, 'NPC contact must be lost, not held forever');
    assertStrictlyFalling(confidences, 'npc cloak fade');
  });
});

test('the legacy ai slot honors the same cloak acquisition gate (D100)', () => {
  withCloakFlag(() => {
    const world = makeWorld();
    const { state, player, hunter } = world;
    const sys = Object.create(legacyAi);
    sys.init({ state, bus: world.bus, helpers: world.helpers });
    hunter.data.ai.forcePlayerTarget = true;
    const arch = { sensor: 1400 };

    assert.equal(sys._selectTarget(hunter, hunter.data, state, player, arch), player,
      'an uncloaked hostile contact must still acquire');

    engagePlayerCloak(world);
    assert.equal(cloakHidesEntityFrom(state, hunter, player), true, 'hunter sits outside the ring');
    assert.equal(sys._selectTarget(hunter, hunter.data, state, player, arch), null,
      'a cloaked player must not enter legacy acquisition');
  });
});

test('a held missile lock on a darkening target bleeds out and drops on a bounded hold', () => {
  withCloakFlag(() => {
    const world = makeWorld();
    const { state, hunter } = world;

    // Build the lock the ordinary way first — uncloaked target, inside the cone.
    for (let i = 0; i < 120 && (hunter.data.combat.lockProgress || 0) < 1; i++) {
      step(world);
      world.guns.update(DT, state);
    }
    assert.equal(hunter.data.combat.lockTarget, 1);
    assert.ok(hunter.data.combat.lockProgress >= 1, 'lock must complete before the cloak test');

    engagePlayerCloak(world);
    let droppedAt = -1;
    let sawPartial = false;
    for (let i = 1; i <= 180; i++) {
      step(world);
      world.guns.update(DT, state);
      const p = hunter.data.combat.lockProgress || 0;
      if (p > 0 && p < 1) sawPartial = true;
      if (hunter.data.combat.lockTarget == null && droppedAt < 0) droppedAt = i;
    }
    assert.ok(sawPartial, 'the lock must BLEED (intermediate values), not snap to zero');
    assert.ok(droppedAt > 0 && droppedAt <= Math.ceil(1.0 / DT) + 2, `lock must drop inside the hold window, droppedAt=${droppedAt}`);
    assert.equal(hunter.data.combat.lockProgress, 0);
  });
});

test('an in-flight seeker loses the solution on a cloaked target — no snap-off, then the stale fix', () => {
  withCloakFlag(() => {
    // Control: uncloaked target, missile homes — distance strictly closes.
    const control = makeWorld();
    const missileA = {
      id: 20, type: 'projectile', alive: true,
      pos: { x: 900, z: -70 }, vel: { x: 0, z: 0 }, rot: 0, radius: 1,
      data: { kind: 'missile', targetId: 1, turnRate: 3.5, projSpeed: 300, projAccel: 0 },
    };
    {
      const d = Math.hypot(control.player.pos.x - missileA.pos.x, control.player.pos.z - missileA.pos.z);
      missileA.vel.x = ((control.player.pos.x - missileA.pos.x) / d) * 280;
      missileA.vel.z = ((control.player.pos.z - missileA.pos.z) / d) * 280;
    }
    control.state.entities.set(20, missileA);
    control.state.entityList.push(missileA);
    control.state.entityIndex.projectiles.push(missileA);
    const distA0 = Math.hypot(missileA.pos.x - control.player.pos.x, missileA.pos.z - control.player.pos.z);
    for (let i = 0; i < 150; i++) {
      step(control);
      control.guns.update(DT, control.state);
      missileA.pos.x += missileA.vel.x * DT;
      missileA.pos.z += missileA.vel.z * DT;
    }
    const distA1 = Math.hypot(missileA.pos.x - control.player.pos.x, missileA.pos.z - control.player.pos.z);
    assert.ok(distA1 < distA0 - 200, `uncloaked seeker must close (was ${distA0.toFixed(0)}, now ${distA1.toFixed(0)})`);
    assert.equal(missileA.data.diverted, undefined, 'uncloaked run must never touch the decoy vocabulary');

    // Cloaked run: identical missile, target goes dark under it.
    const world = makeWorld();
    const { state, player } = world;
    const missile = {
      id: 20, type: 'projectile', alive: true,
      pos: { x: 900, z: -70 }, vel: { x: 0, z: 0 }, rot: 0, radius: 1,
      data: { kind: 'missile', targetId: 1, turnRate: 3.5, projSpeed: 300, projAccel: 0 },
    };
    {
      const d = Math.hypot(player.pos.x - missile.pos.x, player.pos.z - missile.pos.z);
      missile.vel.x = ((player.pos.x - missile.pos.x) / d) * 280;
      missile.vel.z = ((player.pos.z - missile.pos.z) / d) * 280;
    }
    state.entities.set(20, missile);
    state.entityList.push(missile);
    state.entityIndex.projectiles.push(missile);

    player.vel.x = 40; // the emitter keeps drifting after it goes dark — the stale fix must NOT follow
    engagePlayerCloak(world);
    const turnSamples = [];
    let divertedAt = -1;
    for (let i = 1; i <= 240; i++) {
      step(world);
      world.guns.update(DT, state);
      missile.pos.x += missile.vel.x * DT;
      missile.pos.z += missile.vel.z * DT;
      player.pos.x += player.vel.x * DT;
      if (missile.data.diverted !== true) {
        turnSamples.push(missile.data.turnRate);
      } else if (divertedAt < 0) {
        divertedAt = i;
      }
    }
    assert.ok(divertedAt > 0, 'the seeker must eventually hand off to a stale fix');
    assert.ok(divertedAt >= Math.floor(1.0 / DT), `diversion must be gradual, divertedAt=${divertedAt} ticks`);
    assert.ok(turnSamples.length >= 2 && turnSamples[turnSamples.length - 1] < turnSamples[0],
      'turn authority must bleed before the hand-off');
    assert.ok(missile.data.divertPos && Number.isFinite(missile.data.divertPos.x), 'chaff vocabulary: diverted + divertPos');
    assert.ok(missile.data.turnRate < 3.5 * 0.5, 'residual turn authority must be a fraction of the authored seeker');

    // Deviation: the missile converges on the stale fix while the real hull sailed on.
    const distToFix = Math.hypot(missile.pos.x - missile.data.divertPos.x, missile.pos.z - missile.data.divertPos.z);
    const distToLive = Math.hypot(missile.pos.x - player.pos.x, missile.pos.z - player.pos.z);
    assert.ok(distToLive > distToFix, `missile must track the ghost, not the hull (fix ${distToFix.toFixed(0)} vs live ${distToLive.toFixed(0)})`);
    assert.ok(distToLive > 60, 'the live target must be meaningfully missed');
  });
});

test('a scanner pulse burns the cloak open for a bounded window — player and NPC alike', () => {
  withCloakFlag(() => {
    const world = makeWorld();
    const { state, bus, hunter, npcTarget, player } = world;
    const burned = [];
    bus.on('cloak:burned', (p) => burned.push(p));

    engagePlayerCloak(world);
    engageEntityCloak(npcTarget, 300);
    // One fade tick so both contacts are dark before the pulse — a target the observer never
    // sighted while uncloaked is simply absent (no ghost appears out of thin air).
    step(world);
    const dark = world.helpers.aiSensors.frameFor(hunter.id, state.tick);
    const darkNpc = contactOf(dark, npcTarget.id);
    assert.ok(!darkNpc || darkNpc.visible === false, 'NPC target must be dark before the pulse');

    // Scanner (foreign lane) emits scan:pulse { pos } — cloak.js listens and burns every cloak
    // inside the sweep open for CLOAK_SCAN_REVEAL_S.
    bus.emit('scan:pulse', { pos: { x: player.pos.x, z: player.pos.z } });
    assert.equal(burned.length, 1, 'the pulse must emit cloak:burned for the cloaked player in range');
    assert.equal(burned[0].entityId, player.id);
    assert.ok(burned[0].until > state.simTime, 'burn must carry a bounded reveal deadline');

    const revealed = world.helpers.aiSensors.frameFor(hunter.id, state.tick);
    const playerContact = contactOf(revealed, player.id);
    assert.ok(playerContact && playerContact.visible !== false,
      'during the burn the player reads as an ordinary visible contact');
    assert.equal(cloakHidesEntityFrom(state, hunter, player), false, 'the shared gate must open while burned');

    // Symmetric burn: a pulse on the cloaked NPC reveals it to the hunter through the same gate.
    bus.emit('scan:pulse', { pos: { x: npcTarget.pos.x, z: npcTarget.pos.z } });
    const npcBurn = burned.find((p) => p.entityId === npcTarget.id);
    assert.ok(npcBurn, 'the pulse must emit cloak:burned for a cloaked NPC in range too');
    const revealedNpc = contactOf(world.helpers.aiSensors.frameFor(hunter.id, state.tick), npcTarget.id);
    assert.ok(revealedNpc && revealedNpc.visible !== false, 'a burned NPC cloak reveals an ordinary contact');
    assert.equal(cloakHidesEntityFrom(state, hunter, npcTarget), false);

    // After the window closes the cloak is dark again — a pulse is a flash, not a strip. The
    // burned ring blooms (raw-radius readers like the patrol seam must see the light) and eases
    // back on the same dynamic as thrust noise, so the gate closes within a bounded horizon —
    // then the contact fades exactly like a fresh cloak.
    let darkAgainAt = -1;
    for (let i = 1; i <= 360; i++) {
      step(world);
      const f = world.helpers.aiSensors.frameFor(hunter.id, state.tick);
      const c = contactOf(f, player.id);
      if (c && c.visible !== false) continue; // still inside the burn window / bloomed ring
      darkAgainAt = i;
      break;
    }
    assert.ok(darkAgainAt > 0, 'the burn must end — the contact must go dark again within ~6 s');
    const { lostAt } = sampleFadeTimeline(world, hunter.id, player.id, 240);
    assert.ok(lostAt > 0, 'after the burn the re-darkened contact must fade out to lost');
  });
});

test('firing breaks a cloak by the same rule for the player and an NPC', () => {
  withCloakFlag(() => {
    const world = makeWorld();
    const { bus, player, npcTarget } = world;

    engagePlayerCloak(world);
    engageEntityCloak(npcTarget, 300);
    assert.equal(world.state.massline2.cloak.active, true);
    assert.equal(npcTarget.data.cloak.active, true);

    bus.emit('combat:fire', { ownerId: npcTarget.id });
    assert.equal(npcTarget.data.cloak.active, false, 'an NPC firing breaks its cloak like the player');
    assert.equal(world.state.massline2.cloak.active, true, 'the NPC shot must not touch the player cloak');

    bus.emit('combat:fire', { ownerId: player.id });
    assert.equal(world.state.massline2.cloak.active, false, 'player fire still breaks the player cloak');
  });
});

test('same seed, same decay timeline — the fade is deterministic', () => {
  withCloakFlag(() => {
    const run = () => {
      const world = makeWorld(47);
      const frame0 = world.helpers.aiSensors.frameFor(2, world.state.tick);
      assert.ok(contactOf(frame0, 1));
      engagePlayerCloak(world);
      const { confidences, lostAt } = sampleFadeTimeline(world, 2, 1);
      return { confidences, lostAt };
    };
    const a = run();
    const b = run();
    assert.equal(a.lostAt, b.lostAt);
    assert.deepEqual(a.confidences, b.confidences, 'identical seeds must replay the identical fade');
  });
});

test('an uncloaked ship is untouched by the whole interplay', () => {
  withCloakFlag(() => {
    const world = makeWorld();
    const { state, hunter, player } = world;

    // Contacts: three seconds of frames, the player stays a live visible contact throughout.
    for (let i = 0; i < 180; i++) {
      step(world);
      const frame = world.helpers.aiSensors.frameFor(hunter.id, state.tick);
      const c = contactOf(frame, player.id);
      assert.ok(c && c.visible !== false, `tick ${i}: uncloaked contact must never ghost`);
    }

    // Lock: builds and holds with no bleed.
    hunter.data.combat.targetId = 1;
    for (let i = 0; i < 120; i++) {
      step(world);
      world.guns.update(DT, state);
    }
    assert.equal(hunter.data.combat.lockTarget, 1);
    assert.ok(hunter.data.combat.lockProgress >= 1, 'an uncloaked target must hold a full lock');

    // The fade ledger seeds the player's fix every tick (it must, so a future cloak has a ghost
    // to fade from) — but for a ship that never went dark it never marks anything lost.
    const tracks = state.massline2.cloakTracks instanceof Map
      ? state.massline2.cloakTracks.get(hunter.id)
      : null;
    const track = tracks ? tracks.get(player.id) : null;
    assert.ok(track == null || track.lost !== true, 'an uncloaked track must never be marked lost');
  });
});

test('save:restoring clears the fade ledger — a recycled id cannot inherit a stale ghost', () => {
  withCloakFlag(() => {
    const world = makeWorld();
    const { state, bus, hunter, npcTarget } = world;

    // Hunter holds the NPC ship as a live contact — that seeds a fix row under its id.
    const frame0 = world.helpers.aiSensors.frameFor(hunter.id, state.tick);
    assert.ok(contactOf(frame0, npcTarget.id), 'hunter must hold the contact before restore');
    const ledger = state.massline2.cloakTracks;
    assert.ok(ledger instanceof Map, 'the ledger must exist once a ship is seen');
    assert.equal(ledger.get(hunter.id) && ledger.get(hunter.id).has(npcTarget.id), true,
      'a live ship contact must seed its fix row');

    // The despawn hook drops a row when its entity leaves — the same recycling hazard,
    // handled per-removal rather than per-load.
    bus.emit('entity:destroyed', { id: npcTarget.id, type: 'ship' });
    assert.equal(ledger.get(hunter.id) && ledger.get(hunter.id).has(npcTarget.id), false,
      'entity:destroyed must drop the departed target row');

    // Re-seed, then restore: the whole ledger clears — id space is about to be reseated.
    world.helpers.aiSensors.frameFor(hunter.id, state.tick);
    assert.equal(ledger.get(hunter.id) && ledger.get(hunter.id).has(npcTarget.id), true,
      'the fix must re-seed before restore');
    bus.emit('save:restoring', { slot: 0, source: 'test' });
    assert.equal(ledger.size, 0, 'save:restoring must clear every observer table');

    // Recycled id: a different ship takes the departed contact's slot while cloaked. A stale
    // row would emit a ghost at the old fix; cleared, it is simply absent (never seen dark).
    state.entities.delete(npcTarget.id);
    state.entityList.splice(state.entityList.indexOf(npcTarget), 1);
    const recycled = {
      id: npcTarget.id, type: 'ship', alive: true, team: 1, mass: 20,
      pos: { x: 800, z: 1100 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, flags: {},
      data: { ai: {}, weapons: [], combat: {} },
    };
    state.entities.set(recycled.id, recycled);
    state.entityList.push(recycled); // ships/collidables share this array in the fixture
    engageEntityCloak(recycled, 300, state.simTime);
    step(world);
    const frame = world.helpers.aiSensors.frameFor(hunter.id, state.tick);
    assert.equal(contactOf(frame, recycled.id), null,
      'a recycled id with no live sighting must emit no ghost');
  });
});

test('a sleeping NPC holding a lock on a darkened target still bleeds it — quiet latch must not freeze locks', () => {
  withCloakFlag(() => {
    const world = makeWorld();
    const { state, bus, hunter } = world;
    const lockEvents = [];
    bus.on('combat:lockChanged', (p) => lockEvents.push(p));

    // Build the lock the ordinary way first — uncloaked player, hunter inside the cone.
    for (let i = 0; i < 120 && (hunter.data.combat.lockProgress || 0) < 1; i++) {
      step(world);
      world.guns.update(DT, state);
    }
    assert.equal(hunter.data.combat.lockTarget, 1);
    assert.ok(hunter.data.combat.lockProgress >= 1, 'lock must complete before the cloak test');
    assert.ok(lockEvents.some((p) => p.locked === true), 'the incoming-lock warning must arm');

    // Quiet-latch preconditions: the hunter sleeps, tactical AI reports quiet, the index is
    // ready with empty typed lanes. Pre-fix the latch armed anyway — a live lock was never
    // counted — and the bleed froze with the warning lit.
    hunter.physicsSleeping = true;
    state.tacticalAiRuntime.quietLatched = true;

    engagePlayerCloak(world);
    let droppedAt = -1;
    let latchedDuringBleed = false;
    for (let i = 1; i <= 180; i++) {
      step(world);
      world.guns.update(DT, state);
      if (hunter.data.combat.lockTarget != null && world.guns._weaponsQuiet) latchedDuringBleed = true;
      if (hunter.data.combat.lockTarget == null && droppedAt < 0) droppedAt = i;
    }
    assert.equal(latchedDuringBleed, false, 'a mid-bleed lock must refuse the quiet latch');
    assert.ok(droppedAt > 0 && droppedAt <= Math.ceil(1.0 / DT) + 2,
      `the darkened lock must bleed out inside the hold window, droppedAt=${droppedAt}`);
    assert.ok(lockEvents.some((p) => p.locked === false),
      'the incoming-lock warning must clear when the bleed ends');
  });
});

test('re-engaging inside a scan burn keeps the reveal — cloak-flicker cannot dodge the window', () => {
  withCloakFlag(() => {
    const world = makeWorld();
    const { state, bus, hunter, player, npcTarget } = world;

    engagePlayerCloak(world);
    bus.emit('scan:pulse', { pos: { x: player.pos.x, z: player.pos.z } });
    const rt = state.massline2.cloak;
    const until = rt.revealUntil;
    assert.ok(Number.isFinite(until) && until > state.simTime, 'the pulse must open a burn window');

    // Toggle flicker inside the window: off, then straight back on.
    state.input.actions.cloakToggle = true;
    world.cloakSys.update(DT, state);
    state.input.actions.cloakToggle = false;
    assert.equal(rt.active, false, 'the toggle must drop the cloak');
    state.input.actions.cloakToggle = true;
    world.cloakSys.update(DT, state);
    state.input.actions.cloakToggle = false;
    assert.equal(rt.active, true, 'the toggle must re-engage');
    assert.equal(rt.revealUntil, until, 'the burn stamp must survive the re-engage');
    assert.equal(cloakHidesEntityFrom(state, hunter, player), false,
      'the ship stays revealed for the rest of the window');

    // Producer-side parity: an NPC re-engaged inside its burn keeps it too.
    engageEntityCloak(npcTarget, 300, state.simTime);
    bus.emit('scan:pulse', { pos: { x: npcTarget.pos.x, z: npcTarget.pos.z } });
    const npcUntil = npcTarget.data.cloak.revealUntil;
    assert.ok(Number.isFinite(npcUntil) && npcUntil > state.simTime, 'the NPC burn must stamp');
    engageEntityCloak(npcTarget, 300, state.simTime);
    assert.equal(npcTarget.data.cloak.revealUntil, npcUntil,
      'a producer re-engage inside the window must carry the burn');

    // After expiry the cloak is dark again — the stamp is a window, not a pardon.
    while (state.simTime <= until) step(world);
    step(world);
    assert.equal(cloakHidesEntityFrom(state, hunter, player), true,
      'an expired burn must not leak a reveal');
  });
});

test('non-ship contacts never seed fade-ledger rows', () => {
  withCloakFlag(() => {
    const world = makeWorld();
    const { state, hunter, player } = world;
    const rock = {
      id: 40, type: 'asteroid', alive: true, mass: 900,
      pos: { x: 900, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 30, flags: {},
      data: {},
    };
    state.entities.set(rock.id, rock);
    state.entityList.push(rock); // ships/collidables share this array in the fixture

    const frame = world.helpers.aiSensors.frameFor(hunter.id, state.tick);
    assert.ok(contactOf(frame, rock.id), 'the rock must read as a hazard contact');
    const tracks = state.massline2.cloakTracks instanceof Map
      ? state.massline2.cloakTracks.get(hunter.id)
      : null;
    assert.ok(tracks && tracks.has(rock.id) === false,
      'a contact that can never cloak must not eat a ledger row');
    assert.ok(tracks && tracks.has(player.id), 'ship contacts still seed the ledger');
  });
});
