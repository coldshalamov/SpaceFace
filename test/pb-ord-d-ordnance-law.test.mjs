// PB-ORD-D acceptance regression: drift-bomb drop law (SF-031), concussion without hidden
// damage (SF-032), the moving singularity's honest wake (SF-033), and ordnance cleanup that
// leaves the fight intact (SF-045). Asserts through events + routed ports only — never
// internal mirrors — per test/AGENTS.md.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { BOMB_DEFS, BOMB_DRIFT } from '../src/data/bombs.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { collectBombFieldLoopSpecs } from '../src/audio/bombAudio.js';
import { bombs } from '../src/systems/bombs.js';

const DT = 1 / 60;

function boot({ playerVel = { x: 0, z: 0 }, playerRot = 0, playerRadius = 6, cells = null } = {}) {
  const state = createGameState(47);
  state.mode = 'flight';
  state.simTime = 0;
  state.playerId = 1;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, mass: 32, radius: playerRadius, rot: playerRot,
    pos: { x: 0, z: 0 }, vel: { ...playerVel },
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  const routed = [];
  const impulses = [];
  const dropped = [];
  const armed = [];
  const detonated = [];
  const fieldEnded = [];
  const released = [];
  const denied = [];
  bus.on('bombs:dropped', (p) => dropped.push(p));
  bus.on('bombs:armed', (p) => armed.push(p));
  bus.on('bombs:detonated', (p) => detonated.push(p));
  bus.on('bombs:fieldEnded', (p) => fieldEnded.push(p));
  bus.on('bombs:released', (p) => released.push(p));
  bus.on('bombs:denied', (p) => denied.push(p));
  let nextId = 50;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, hull: 1, hullMax: 1, ...spec };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    routeCombatDamage(req) { routed.push(req); return { ok: true }; },
    combatPhysics: { applyImpulse(req) { impulses.push(req); return true; } },
  };
  const system = Object.create(bombs);
  system.init({ state, bus, helpers });
  const rt = state.bombs;
  if (cells) {
    rt.rack.cells = cells.map((id) => ({ id, count: BOMB_DEFS[id].magazine }));
    rt.rack.sockets = cells.length;
    rt.selectedId = cells[0];
  }
  return {
    state, bus, system, routed, impulses, dropped, armed, detonated, fieldEnded, released, denied,
    player, rt,
    spawnRaw: helpers.spawnEntity,
    spawnShip(id, x, z, { team = 1, mass = 32, radius = 0 } = {}) {
      const ship = { id, type: 'ship', alive: true, team, mass, radius, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0 };
      state.entities.set(id, ship);
      state.entityList.push(ship);
      return ship;
    },
    select(id) { rt.selectedId = id; },
    press(action) { state.input.actions = state.input.actions || {}; state.input.actions[action] = true; },
    tick(n = 1) { for (let i = 0; i < n; i++) { state.simTime += DT; state.tick += 1; system.update(DT, state); } },
    dropSelected(id) { rt.selectedId = id; state.input.actions = state.input.actions || {}; state.input.actions.dropBomb = true; this.tick(1); },
    liveBombs() { return state.entityList.filter((e) => e.alive && e.type === 'bomb'); },
  };
}

const LATCH_TICKS = Math.ceil(BOMB_DRIFT.releaseIntervalS / DT) + 1; // shared release latch
const STANDOFF = BOMB_DRIFT.dropStandoffWu;

// ---------------------------------------------------------------- SF-031 drop law

test('SF-031: release inherits velocity exactly once — rest, reverse, and sideways slide', () => {
  // Resting hull facing +x: capsule leaves the tail, at rest.
  let t = boot({ playerVel: { x: 0, z: 0 }, playerRot: 0 });
  try {
    t.dropSelected('bomb_frag');
    const bomb = t.state.entities.get(t.dropped[0].bombId);
    assert.equal(bomb.vel.x, 0);
    assert.equal(bomb.vel.z, 0);
    assert.ok(Math.abs(bomb.pos.x + (6 + STANDOFF)) < 1e-9 && Math.abs(bomb.pos.z) < 1e-9,
      `resting drop lands behind the nose, got (${bomb.pos.x}, ${bomb.pos.z})`);
  } finally { t.bus.clear(); }

  // Reversing at speed: the socket follows the MOTION, not the facing — the capsule
  // trails the flight path and keeps exactly the ship's velocity (no doubled kickback).
  t = boot({ playerVel: { x: -60, z: 0 }, playerRot: 0 });
  try {
    t.dropSelected('bomb_frag');
    const drop = t.dropped[0];
    const bomb = t.state.entities.get(drop.bombId);
    assert.equal(drop.vel.x, -60);
    assert.equal(drop.vel.z, 0);
    assert.equal(bomb.vel.x, -60, 'bomb velocity equals owner velocity — inherited once, not summed');
    assert.ok(bomb.pos.x > 6, `releasing behind the motion puts the capsule +x of the hull, got ${bomb.pos.x}`);
  } finally { t.bus.clear(); }

  // Sideways slide (high-speed turn instant): nose +x, motion +z — the capsule trails
  // the motion vector, not the hull silhouette.
  t = boot({ playerVel: { x: 0, z: 60 }, playerRot: 0 });
  try {
    t.dropSelected('bomb_frag');
    const bomb = t.state.entities.get(t.dropped[0].bombId);
    assert.equal(bomb.vel.z, 60);
    assert.ok(Math.abs(bomb.pos.x) < 1e-9 && Math.abs(bomb.pos.z + (6 + STANDOFF)) < 1e-9,
      `sideways slide drops behind the motion vector, got (${bomb.pos.x}, ${bomb.pos.z})`);
  } finally { t.bus.clear(); }
});

test('SF-031: release standoff scales with hull radius, and the fuze cannot cook early', () => {
  // Small hull vs heavy hull: standoff = hull radius + authored clearance.
  for (const [radius, want] of [[4, 4 + STANDOFF], [14, 14 + STANDOFF]]) {
    const t = boot({ playerRadius: radius });
    try {
      t.dropSelected('bomb_frag');
      const bomb = t.state.entities.get(t.dropped[0].bombId);
      assert.ok(Math.abs(bomb.pos.x + want) < 1e-9, `radius ${radius} standoff ${want}, got ${-bomb.pos.x}`);
    } finally { t.bus.clear(); }
  }

  // A hostile parked on the release corridor cannot detonate the capsule before the
  // arming clock — proximity only goes live at armedAt.
  const t = boot();
  try {
    t.spawnShip(2, -13 - 20, 0); // 20 WU inside the resting release point
    t.press('dropBomb');
    t.tick(1);
    assert.equal(t.dropped.length, 1);
    t.tick(Math.floor(BOMB_DRIFT.armS / DT) - 2); // still inside the arming window
    assert.equal(t.detonated.length, 0, 'no self-detonation before arming');
    t.tick(4);
    assert.equal(t.armed.length, 1, 'the capsule arms on the sim clock');
    t.tick(Math.ceil(BOMB_DRIFT.warningS / DT) + 2);
    assert.equal(t.detonated.length, 1, 'once armed, the parked hostile trips the proximity fuze');
    assert.equal(t.detonated[0].trigger, 'proximity');
  } finally { t.bus.clear(); }
});

// ---------------------------------------------------------------- SF-032 concussion

test('SF-032: a concussion drum in empty space resolves quietly — receipt, no shove, no damage', () => {
  const t = boot({ cells: ['bomb_concussion'] });
  try {
    t.dropSelected('bomb_concussion');
    // The ship flies on; at burst time nothing is inside the 130 WU drum radius. (A resting
    // dropper IS inside their own shove — friendly-fire law, pinned by the frag suite.)
    t.player.pos.x = 900;
    t.tick(Math.ceil((BOMB_DEFS.bomb_concussion.fuzeS + BOMB_DRIFT.warningS) / DT) + 4);
    assert.equal(t.detonated.length, 1, 'empty-sky fuze still resolves on its clock');
    const det = t.detonated[0];
    assert.equal(det.payloadId, 'bomb_concussion');
    assert.equal(det.trigger, 'fuze');
    assert.deepEqual([...det.hits], [], 'nobody hit');
    assert.deepEqual([...det.shoves], [], 'nobody shoved');
    assert.equal(t.routed.length, 0, 'nothing routed through the damage owner');
    assert.equal(t.impulses.length, 0, 'no impulse against the void');
  } finally { t.bus.clear(); }
});

test('SF-032: concussion pays the same impulse to light and heavy hulls and routes no damage', () => {
  const t = boot({ cells: ['bomb_concussion'] });
  try {
    // Light fighter and heavy hull equidistant from the resting release point.
    t.spawnShip(2, -13 + 40, 0, { mass: 12 });
    t.spawnShip(3, -13 - 40, 0, { mass: 240 });
    t.dropSelected('bomb_concussion');
    t.tick(60); // arm + warning + resolve
    assert.equal(t.detonated.length, 1);
    assert.equal(t.routed.length, 0, 'the shove payload never routes damage — collisions may hurt later, the drum does not');
    const light = t.impulses.find((i) => i.entityId === 2);
    const heavy = t.impulses.find((i) => i.entityId === 3);
    assert.ok(light && heavy, 'both hulls shoved through the physics authority');
    // The drum pays momentum, not acceleration: equal falloff → equal impulse; mass only
    // enters Δv downstream in the solver.
    assert.ok(Math.abs(Math.hypot(light.impulse.x, light.impulse.z) - Math.hypot(heavy.impulse.x, heavy.impulse.z)) < 1e-6,
      'equal-distance hulls receive equal impulse regardless of mass');
    assert.ok(light.impulse.x > 0 && heavy.impulse.x < 0, 'each shove points away from the drum');
  } finally { t.bus.clear(); }
});

// ------------------------------------------------------- SF-033 moving-singularity wake

test('SF-033: the pull tracks the drifting slug, the crossed wake is quiet, the radius is honest', () => {
  const t = boot({ playerVel: { x: 60, z: 0 }, cells: ['bomb_singularity'] });
  try {
    // Wake probe: 45 WU off the drop axis — inside any future field radius of the slug's
    // early path positions, never inside the 40 WU proximity fuze, and left behind by
    // detonation. A real wake hazard would touch it; the honest field never does.
    const wake = t.spawnShip(2, 30, 45);
    t.dropSelected('bomb_singularity');
    t.tick(Math.ceil((BOMB_DEFS.bomb_singularity.fuzeS + BOMB_DRIFT.warningS) / DT) + 4);
    const det = t.detonated.find((d) => d.trigger === 'fuze');
    assert.ok(det, 'the lonely slug bursts on its fuze');
    const bombId = det.bombId;
    const bomb = t.state.entities.get(bombId);
    assert.equal(bomb.data.phase, 'field');
    // The slug rode its inherited velocity ~200 WU downrange before rupturing.
    const burstX = bomb.pos.x;
    assert.ok(burstX > 150, `field center rides the drifting slug, burst at x=${burstX.toFixed(1)}`);

    // The wake probe sat off-axis through the whole run: no pull, no crush, nothing.
    t.tick(1);
    assert.ok(!t.impulses.some((i) => i.entityId === wake.id), 'the crossed wake is force-free');
    assert.ok(!t.routed.some((r) => r.targetId === wake.id), 'the crossed wake takes no damage');

    // Inside the moving radius: pull points at the slug's CURRENT position each tick.
    const near = t.spawnShip(3, bomb.pos.x + 80, 0, { mass: 32 });
    const outside = t.spawnShip(4, bomb.pos.x + 80 + BOMB_DEFS.bomb_singularity.radius + 60, 0, { mass: 32 });
    t.tick(1);
    const pullCmd = consumePhysicsCommand(near);
    assert.ok(pullCmd && pullCmd.impulses.length >= 1, 'inside hull feels the live pull');
    const pull = pullCmd.impulses[0];
    const dx = bomb.pos.x - near.pos.x, dz = bomb.pos.z - near.pos.z;
    const nrm = Math.hypot(dx, dz);
    assert.ok(Math.abs(pull.x - dx / nrm * Math.hypot(pull.x, pull.z)) < 1e-6
      && Math.abs(pull.z - dz / nrm * Math.hypot(pull.x, pull.z)) < 1e-6,
      'pull direction tracks the slug current position, not the burst origin');
    assert.ok(!t.impulses.some((i) => i.entityId === outside.id)
      && !(consumePhysicsCommand(outside)?.impulses.length),
      'the radius is honest — nothing reaches beyond it');

    // The field keeps drifting: a tick later the source has moved and the pull follows.
    const x1 = bomb.pos.x;
    t.tick(30);
    assert.ok(bomb.pos.x > x1 + 2, `field center keeps drifting (${x1.toFixed(1)} -> ${bomb.pos.x.toFixed(1)})`);

    // Wake probe remains untouched through the field's whole life.
    t.tick(Math.ceil(BOMB_DEFS.bomb_singularity.field.durationS / DT) + 4);
    assert.ok(!t.impulses.some((i) => i.entityId === wake.id), 'wake never pays force');
    assert.ok(t.fieldEnded.some((f) => f.bombId === bombId && f.trigger === 'collapse'),
      'the moving well still ends in its collapse');
  } finally { t.bus.clear(); }
});

// ---------------------------------------------------------------- SF-045 cleanup

test('SF-045: dense-fight release retires every payload, ends live fields, and leaves the fight standing', () => {
  const t = boot({ cells: ['bomb_singularity', 'bomb_frag', 'bomb_concussion'] });
  try {
    // The fight: a hostile hull sharing the sky but outside every trigger radius, so all
    // fuzes govern — a dense salvo still in flight when the sector turns over.
    const victim = t.spawnShip(2, 220, 100);

    // Wave one: three payloads live at once — the slug ruptures into its moving field
    // (~4.7s fuze) while the frag (6s) and drum (5s) are still armed drifters.
    t.dropSelected('bomb_singularity');
    t.tick(LATCH_TICKS);
    t.dropSelected('bomb_frag');
    t.tick(LATCH_TICKS);
    t.dropSelected('bomb_concussion');
    t.tick(265); // -> ~tick 310: slug field live (~293), frag/concussion still drifting
    const slug = t.state.entityList.find((e) => e.type === 'bomb' && e.data?.bombId === 'bomb_singularity');
    assert.equal(slug.data.phase, 'field', 'singularity is mid-field when the sector turns over');
    assert.equal(t.liveBombs().length, 3, 'three payloads live in the dense fight');

    t.bus.emit('sector:exit', {});
    assert.equal(t.released.length, 1);
    assert.equal(t.released[0].count, 3, 'every live payload released in one sweep');
    assert.equal(t.liveBombs().length, 0, 'no transient ordnance survives the transition');
    assert.ok(t.fieldEnded.some((f) => f.payloadId === 'bomb_singularity'),
      'the live field ends with a receipt, not a leak');
    assert.deepEqual(collectBombFieldLoopSpecs(t.state), [],
      'no field loop survives its bomb — the fight keeps its own sounds only');
    assert.equal(victim.alive, true, 'release never touches the fight itself');

    // The system is not wedged: wave two refits at the dock and drops cleanly on the
    // other side of the turnover — all three armed drifters retire mid-flight.
    t.rt.rack.cells = ['bomb_goo', 'bomb_emp', 'bomb_thermite'].map((id) => ({ id, count: BOMB_DEFS[id].magazine }));
    t.rt.rack.sockets = 3;
    for (const id of ['bomb_goo', 'bomb_emp', 'bomb_thermite']) { t.dropSelected(id); t.tick(LATCH_TICKS); }
    assert.equal(t.liveBombs().length, 3, 'wave two drops cleanly after releaseAll');
    t.bus.emit('sector:exit', {});
    assert.equal(t.released.length, 2);
    assert.equal(t.released[1].count, 3, 'wave two retires mid-drift in one sweep');
    assert.equal(t.liveBombs().length, 0);

    // Pooled-id reuse: recycling a retired slug's entity id as a fresh drift capsule must
    // not resurrect its field or its loop.
    const deadSlugId = slug.id;
    t.spawnRaw({
      id: deadSlugId, type: 'bomb', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
      radius: 1.4, mass: 2, collides: true, team: 0, ownerId: 1,
      data: { kind: 'bomb', bombId: 'bomb_frag', ownerId: 1, phase: 'drift', armed: false, armedAt: 9, detonateAt: 999, spawnedAt: 9, triggered: false, retired: false },
    });
    t.tick(2);
    assert.ok(!collectBombFieldLoopSpecs(t.state).some((s) => s.bombId === deadSlugId),
      'a recycled id inherits no field loop from its previous occupant');

    // Wave three drains the catalogue: every payload has now run a full lifecycle
    // under repeated dense-fight transitions, and the counts return to baseline.
    t.rt.rack.cells = ['bomb_scrambler', 'bomb_anchor'].map((id) => ({ id, count: BOMB_DEFS[id].magazine }));
    const before = t.released.length;
    t.dropSelected('bomb_scrambler');
    t.tick(LATCH_TICKS);
    t.dropSelected('bomb_anchor');
    t.tick(LATCH_TICKS);
    assert.equal(t.liveBombs().length, 3, 'recycled capsule plus wave three are live');
    t.bus.emit('sector:exit', {});
    assert.equal(t.released.length, before + 1);
    assert.equal(t.liveBombs().length, 0, 'transient counts return to baseline');
    assert.equal(victim.alive, true, 'the fight outlives three ordnance turnovers');
  } finally { t.bus.clear(); }
});
