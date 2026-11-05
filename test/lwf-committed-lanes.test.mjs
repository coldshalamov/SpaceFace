import test from 'node:test';
import assert from 'node:assert/strict';

import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../src/ai/doctrine.js';
import {
  CombatDoctrineId,
  CombatDoctrineRuntime,
  DOCTRINE_TELEGRAPH_TICKS,
  isPointOnAttackLine,
} from '../src/ai/combatDoctrine.js';
import { applyAIFiringIntent } from '../src/systems/aiFireIntent.js';

// LW-03: the two committed-approach doctrines (brawler_commit, interceptor_flyby) telegraph a
// firing lane, not a hull heading. At wind-up entry the run stamps a forecast fire bearing;
// every released shot refines only inside a bounded wedge of it, and the drawn attackLine is
// emitted from that stamp — the warning is the real shot.

function perception(contactsValue, selfOverrides = {}) {
  return {
    self: {
      ...selfOverrides,
      id: selfOverrides.id ?? 2,
      team: 1,
      pos: { x: selfOverrides.x ?? 0, z: selfOverrides.z ?? 0 },
      vel: { x: selfOverrides.vx ?? 0, z: selfOverrides.vz ?? 0 },
      rot: selfOverrides.rot ?? 0,
      combatDoctrineId: selfOverrides.combatDoctrineId || null,
      activity: {
        kind: ActivityKind.ATTACK_RUN, reason: 'lwf_fixture',
        anchor: { x: 0, z: 0 }, leashRadius: 2600, preferredRange: 180, startedTick: 0,
      },
      roe: RulesOfEngagement.WEAPONS_FREE,
    },
    contacts: contactsValue,
    events: [],
  };
}

function shipContact(id, values = {}) {
  return {
    id,
    kind: ContactKind.SHIP,
    alive: values.alive ?? true,
    valid: values.valid ?? true,
    visible: values.visible ?? true,
    ageTicks: values.ageTicks ?? 0,
    hostile: values.hostile ?? true,
    confidence: values.confidence ?? 1,
    threat: values.threat ?? 0.7,
    pos: { x: values.x ?? 400, z: values.z ?? 0 },
    vel: { x: values.vx ?? 0, z: values.vz ?? 0 },
    operationalMassBand: values.operationalMassBand || 'medium',
    mobilityBand: values.mobilityBand || 'medium',
    cargoBand: values.cargoBand || 'empty',
    tetherabilityBand: values.tetherabilityBand || 'good',
    tags: values.tags || [],
  };
}

function baseDirective() {
  return Object.freeze({
    tick: 0,
    squadId: 'lwf_fixture',
    memberId: 2,
    role: 'striker',
    tactic: 'standoff_focus',
    focusTargetId: 1,
    objective: Object.freeze({ kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'lwf_fixture' }),
    formation: Object.freeze({
      kind: 'wedge', slot: Object.freeze({ x: 0, z: 0 }), velocity: Object.freeze({ x: 0, z: 0 }),
      bound: 170, breakFormation: false, breakReason: null,
    }),
  });
}

const directive = baseDirective();
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

function assertCorridorHeading(snapshot, bearing) {
  assert(snapshot.attackLine, 'the committed run must draw a warning lane');
  assert(Math.abs(wrap(snapshot.attackLine.heading - bearing)) < 1e-9,
    `the drawn lane must be the committed bearing ${bearing}, got ${snapshot.attackLine.heading}`);
  assert(Math.abs(snapshot.attackLine.dir.x - Math.cos(bearing)) < 1e-9);
  assert(Math.abs(snapshot.attackLine.dir.z - Math.sin(bearing)) < 1e-9);
}

// Fire-intent fixture: the same authorized-engagement harness the corridor tests use, driven
// with the doctrine's REAL snapshot so the committed corridor feeds the shipped fire path.
function fireFixture({ shooterVel = { x: 0, z: 0 }, rot = 0, weapons = [{ projSpeed: 320 }],
  targetPos = { x: 380, z: 0 }, doctrineId = CombatDoctrineId.BRAWLER_COMMIT } = {}) {
  const target = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { ...targetPos }, vel: { x: 0, z: 0 }, rot: 0, data: {},
  };
  const shooter = {
    id: 2, type: 'ship', alive: true, team: 1,
    pos: { x: 0, z: 0 }, vel: { ...shooterVel }, rot,
    data: {
      intent: { fire: false }, combat: {}, weapons,
      ai: {
        passive: false, lawful: false, forcePlayerTarget: true, hostileTeams: [0],
        motive: 'cargo_extortion', engagementTrigger: 'explicit_refusal',
        zoneId: 'zone_lwf_fixture', approachTelegraph: 'engine_flare',
        noFireResponseWindowS: 1, combatDoctrineId: doctrineId,
        activity: normalizeActivity({
          kind: ActivityKind.ATTACK_RUN, reason: 'lwf_fixture',
          anchor: { x: 0, z: 0 }, leashRadius: 2200, startedTick: 0,
        }),
        roe: RulesOfEngagement.WEAPONS_FREE,
      },
    },
  };
  const state = {
    tick: 0, simTime: 4, playerId: target.id, player: { heat: 0 },
    world: { currentSectorId: 'sector_lwf_fixture' },
    entities: new Map([[target.id, target], [shooter.id, shooter]]),
    entityList: [target, shooter], combat: { trace: { events: [] } },
  };
  const fire = (doctrine, tick) => { state.tick = tick; state.simTime = tick / 60; return applyAIFiringIntent({
    entityId: shooter.id,
    directive: {
      objective: {
        kind: ObjectiveKind.FOCUS, targetId: target.id,
        reason: `combat_doctrine:${doctrine.doctrineId}:${doctrine.phase}`,
      },
    },
    action: { actionId: 'action_burst' },
    combatDoctrine: doctrine,
  }, state); };
  return { target, shooter, state, fire };
}

// --- brawler_commit ---------------------------------------------------------

test('brawler_commit stamps a frozen firing corridor at wind-up and draws it as the cue', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 808 });
  const frame = (selfValues = {}) => perception(
    [shipContact(1, { x: 400, z: 0, mobilityBand: 'low', threat: 0.9 })],
    { vx: 90, rot: 0.9, ...selfValues },
  );
  let result = runtime.update({
    tick: 0, entityId: 'brawler', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: frame(), directive,
  });
  assert.equal(result.phase, 'engine_flare');
  assert.equal(result.telegraphStarted, true);
  const stamped = result.aimCommit;
  assert(stamped && Number.isFinite(stamped.bearing), 'wind-up entry publishes the committed corridor');
  assert(stamped.capRad > 0.3 && stamped.capRad <= 0.5,
    `brawler corridor is the wide collision-course band, got ${stamped.capRad}`);
  assert(Number.isInteger(stamped.untilTick) && stamped.untilTick > 0,
    'the commit carries a simTime expiry bound');
  assert(Math.abs(stamped.bearing) < 1e-9, 'a stationary on-line target stamps the direct bearing');
  // The honest cue: the lane is the commit, not the hull — the nose is still 0.9 rad off it.
  assertCorridorHeading(result, stamped.bearing);
  const onLane = { x: 240, z: 0 };
  const offLane = { x: 240, z: 240 * Math.tan(0.9) };
  assert.equal(isPointOnAttackLine(result.attackLine, onLane), true,
    'the warned lane covers where the volley is committed');
  assert.equal(isPointOnAttackLine(result.attackLine, offLane), false,
    'the hull-heading line the cue used to draw is no longer the warning');

  // A modest sidestep INSIDE the wedge does not retarget the stamp and does not abort.
  const drifted = () => perception(
    [shipContact(1, { x: 400, z: 100, vz: -20, mobilityBand: 'low', threat: 0.9 })],
    { vx: 90, rot: 0.9 },
  );
  result = runtime.update({
    tick: 10, entityId: 'brawler', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: drifted(), directive,
  });
  assert.equal(result.phase, 'engine_flare', 'an in-wedge dodge leaves the run committed');
  assert.equal(result.aimCommit.bearing, stamped.bearing, 'the corridor never re-solves mid-cue');
  assertCorridorHeading(result, stamped.bearing);

  // The bearing survives the wind-up -> fire boundary frozen.
  result = runtime.update({
    tick: 30, entityId: 'brawler', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: frame(), directive,
  });
  assert.equal(result.phase, 'commit');
  assert.equal(result.fireWindow, true);
  assert.equal(result.allowedActionId, 'action_burst');
  assert.equal(result.aimCommit.bearing, stamped.bearing, 'the fire phase flies the stamped lane');
  assert.equal(result.faceAngle, stamped.bearing, 'the nose rides the corridor through the run');
  assertCorridorHeading(result, stamped.bearing);
});

test('brawler_commit clamps the shipped fire path inside the corridor and a hard dodge cannot re-track it', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 909 });
  const frame = () => perception(
    [shipContact(1, { x: 400, z: 0, mobilityBand: 'low', threat: 0.9 })],
    { vx: 90 },
  );
  runtime.update({
    tick: 120, entityId: 'brawler', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: frame(), directive,
  });
  // The wind-up holds the corridor line without firing — the cue call anchors the real lead.
  const { target, shooter, fire } = fireFixture({ weapons: [{ projSpeed: 320, gimbalArc: 1.2 }] });
  const cue = runtime.update({
    tick: 135, entityId: 'brawler', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: frame(), directive,
  });
  assert.equal(cue.phase, 'engine_flare');
  fire(cue, 135);
  assert.equal(shooter.data.intent.fire, false, 'the telegraph never releases the volley');
  const anchor = shooter.data.combat.aimCommit.anchor;
  assert(Number.isFinite(anchor), 'the corridor anchored a real firing lead at cue time');

  const commit = runtime.update({
    tick: 150, entityId: 'brawler', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: frame(), directive,
  });
  assert.equal(commit.phase, 'commit');
  const cap = commit.aimCommit.capRad;

  // In-wedge refinement: a steady target still takes the real lead through the same fire path.
  target.pos = { x: 350, z: 30 };
  fire(commit, 150);
  assert.equal(shooter.data.intent.fire, true, 'the committed window releases through the ordinary gate');
  assert(Math.abs(wrap(shooter.data.intent.aimAngle - anchor)) <= cap + 1e-9,
    'aim refines only inside the corridor wedge');

  // A hard dodge carries the live solution outside the wedge: the released aim pins at the
  // corridor edge — it can never re-track the dodged target.
  target.pos = { x: 350, z: 260 };
  fire(commit, 150);
  const stale = Math.abs(wrap(shooter.data.intent.aimAngle - anchor));
  assert(stale > 0 && stale <= cap + 1e-9,
    `the dodged shot rides the corridor edge inside the bounded band, got ${stale}`);
  const trueLead = Math.atan2(260, 350);
  assert(Math.abs(wrap(shooter.data.intent.aimAngle - trueLead)) > 0.05,
    'the released line cannot reach the dodged target — the shot misses');
});

test('brawler_commit aborts the run into breakaway when the dodge beats the corridor', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 1113 });
  const frame = (contact) => perception(
    [shipContact(1, { mobilityBand: 'low', threat: 0.9, ...contact })],
    { vx: 90 },
  );
  let result = runtime.update({
    tick: 0, entityId: 'brawler', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: frame({ x: 400, z: 0 }), directive,
  });
  assert.equal(result.phase, 'engine_flare');
  // A hard sidestep during the wind-up — ~200 WU off the line and still running away — carries
  // the live fire solution out of the 0.40 wedge and beats the run.
  result = runtime.update({
    tick: 12, entityId: 'brawler', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: frame({ x: 390, z: 200, vz: 40 }), directive,
  });
  assert.equal(result.phase, 'breakaway', 'an escaped corridor waves the run off into egress');
  assert.equal(result.outcome, 'corridor_escaped');
  assert.equal(result.fireWindow, false, 'a dead lane fires nothing');
  assert.equal(result.aimCommit, null, 'the escaped run drops its corridor');
  assert.equal(result.attackLine, null, 'no warning lane is drawn for an aborted run');
});

test('a mid-commit dodge cannot re-aim the volley and does not break the mass-committed pass', () => {
  // Once the run is flying the corridor keeps the shots honest — a dodged target is missed,
  // not re-tracked — while the charge still plays out its authored overshoot. A late dodge is
  // dangerous: it stays near the lane and takes the clamped-edge shot.
  const runtime = new CombatDoctrineRuntime({ seed: 1319 });
  const frame = (contact, selfValues = {}) => perception(
    [shipContact(1, { mobilityBand: 'low', threat: 0.9, ...contact })],
    { vx: 90, ...selfValues },
  );
  runtime.update({
    tick: 0, entityId: 'brawler', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: frame({ x: 400, z: 0 }), directive,
  });
  const stamped = runtime.update({
    tick: 30, entityId: 'brawler', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: frame({ x: 380, z: 0 }), directive,
  });
  assert.equal(stamped.phase, 'commit');
  const bearing = stamped.aimCommit.bearing;
  // A hard dodge deep into the run: the run keeps flying its fixed point, still flying the
  // stamped lane — the corridor does not follow the dodged target and does not abort the pass.
  const dodged = runtime.update({
    tick: 60, entityId: 'brawler', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: frame({ x: 380, z: 220, vx: 40, vz: -60 }, { vx: 140 }), directive,
  });
  assert.equal(dodged.phase, 'commit', 'a mid-run dodge cannot wave off a committed charge');
  assert.equal(dodged.aimCommit.bearing, bearing, 'the corridor stays on the stamped lane');
  assert.equal(dodged.faceAngle, bearing, 'the nose still rides the corridor');
  assertCorridorHeading(dodged, bearing);
});

test('brawler_commit cancels the run when the target is lost mid-commit — no ghost shots', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 1217 });
  const frame = (contact) => perception(
    [shipContact(1, { mobilityBand: 'low', threat: 0.9, ...contact })],
    { vx: 90 },
  );
  runtime.update({
    tick: 120, entityId: 'brawler', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: frame({ x: 400, z: 0 }), directive,
  });
  const commit = runtime.update({
    tick: 150, entityId: 'brawler', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: frame({ x: 380, z: 0 }), directive,
  });
  assert.equal(commit.phase, 'commit');
  // The target leaves sensor coverage mid-run: the doctrine cannot keep a track it cannot see.
  const lost = runtime.update({
    tick: 160, entityId: 'brawler', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: frame({ x: 2000, z: 0, visible: false }), directive,
  });
  assert.equal(lost.targetId, null, 'a lost contact cannot keep the committed run alive');
  assert.equal(lost.aimCommit, null, 'target loss drops the corridor');
  assert.equal(lost.fireWindow, false);
  const { shooter, fire } = fireFixture({});
  fire(lost, 160);
  assert.equal(shooter.data.intent.fire, false, 'no shot is emitted after the run cancels');
});

// --- interceptor_flyby ------------------------------------------------------

test('interceptor_flyby stamps a narrower frozen corridor and draws it as the cue', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 1409 });
  const frame = (selfValues = {}) => perception(
    [shipContact(1, { x: 400, z: 0, mobilityBand: 'high', threat: 0.9 })],
    { vx: 60, rot: -0.7, ...selfValues },
  );
  let result = runtime.update({
    tick: 0, entityId: 'wasp', doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: frame(), directive,
  });
  assert.equal(result.phase, 'engine_flare');
  assert.equal(result.telegraphStarted, true);
  const stamped = result.aimCommit;
  assert(stamped && Number.isFinite(stamped.bearing), 'wind-up entry publishes the committed corridor');
  assert(stamped.capRad >= 0.15 && stamped.capRad <= 0.25,
    `interceptor corridor is the tight flyby band, got ${stamped.capRad}`);
  assert(Math.abs(stamped.bearing) < 1e-9);
  assertCorridorHeading(result, stamped.bearing);

  // A held-course target never aborts the wind-up — the corridor only dies to a real escape.
  for (let tick = 1; tick < DOCTRINE_TELEGRAPH_TICKS; tick += 7) {
    result = runtime.update({
      tick, entityId: 'wasp', doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
      perception: frame({ rot: -0.7 + tick * 0.03 }), directive,
    });
    assert.equal(result.phase, 'engine_flare', `held course keeps the run committed at tick ${tick}`);
    assert.equal(result.aimCommit.bearing, stamped.bearing);
  }

  result = runtime.update({
    tick: 30, entityId: 'wasp', doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: frame(), directive,
  });
  assert.equal(result.phase, 'strike');
  assert.equal(result.fireWindow, true);
  assert.equal(result.aimCommit.bearing, stamped.bearing, 'the strike flies the stamped lane');
  assertCorridorHeading(result, stamped.bearing);
});

test('interceptor_flyby clamps the shipped fire path inside its tighter corridor', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 1513 });
  const frame = () => perception(
    [shipContact(1, { x: 400, z: 0, mobilityBand: 'high', threat: 0.9 })],
    { vx: 60 },
  );
  runtime.update({
    tick: 120, entityId: 'wasp', doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: frame(), directive,
  });
  const { target, shooter, fire } = fireFixture({ doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY });
  const cue = runtime.update({
    tick: 130, entityId: 'wasp', doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: frame(), directive,
  });
  assert.equal(cue.phase, 'engine_flare');
  fire(cue, 130);
  assert.equal(shooter.data.intent.fire, false, 'the flyby telegraph never releases the volley');
  const anchor = shooter.data.combat.aimCommit.anchor;
  assert(Number.isFinite(anchor));

  const strike = runtime.update({
    tick: 150, entityId: 'wasp', doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: frame(), directive,
  });
  assert.equal(strike.phase, 'strike');
  const cap = strike.aimCommit.capRad;

  target.pos = { x: 350, z: 30 };
  fire(strike, 150);
  assert.equal(shooter.data.intent.fire, true);
  assert(Math.abs(wrap(shooter.data.intent.aimAngle - anchor)) <= cap + 1e-9);

  // A dodge outside the tighter wedge: the flyby's solution pins at the edge and misses.
  target.pos = { x: 350, z: 140 };
  fire(strike, 150);
  const stale = Math.abs(wrap(shooter.data.intent.aimAngle - anchor));
  assert(stale > 0 && stale <= cap + 1e-9,
    `the flyby's dodged shot rides the tight corridor edge, got ${stale}`);
});

test('interceptor_flyby aborts into extend when the dodge beats the corridor mid-cue', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 1619 });
  const frame = (contact) => perception(
    [shipContact(1, { mobilityBand: 'high', threat: 0.9, ...contact })],
    { vx: 60 },
  );
  runtime.update({
    tick: 0, entityId: 'wasp', doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: frame({ x: 400, z: 0 }), directive,
  });
  // ~100 WU of sidestep inside the wind-up, still running away: the narrow wedge cannot reach
  // the re-solved fire bearing.
  const result = runtime.update({
    tick: 10, entityId: 'wasp', doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: frame({ x: 390, z: 100, vz: 80 }), directive,
  });
  assert.equal(result.phase, 'extend', 'an escaped corridor ends the run in the authored egress');
  assert.equal(result.outcome, 'corridor_escaped');
  assert.equal(result.fireWindow, false);
  assert.equal(result.aimCommit, null);
});

test('a heavy-mass interceptor flies the brawler profile corridor (wider band, commit phase)', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 1723 });
  const frame = () => perception(
    [shipContact(1, { x: 400, z: 0, mobilityBand: 'low', threat: 0.9 })],
    { vx: 80, operationalMassBand: 'heavy' },
  );
  let result = runtime.update({
    tick: 0, entityId: 'heavy', doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: frame(), directive,
  });
  assert.equal(result.flightProfile, 'brawler_commit');
  assert.equal(result.phase, 'engine_flare');
  assert(result.aimCommit && result.aimCommit.capRad > 0.3,
    'a heavy interceptor gets the brawler-wide corridor, not the flyby band');
  const stamped = result.aimCommit.bearing;
  result = runtime.update({
    tick: 30, entityId: 'heavy', doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: frame(), directive,
  });
  assert.equal(result.phase, 'commit', 'the brawler profile fires from the commit phase');
  assert.equal(result.aimCommit.bearing, stamped, 'the heavy profile keeps the stamped lane');
});

// --- Non-regression -----------------------------------------------------------

test('doctrines without a corridor commit keep resolving aim freely each tick', () => {
  // swarm_pack shares the engine_flare -> strike phase names but is NOT a corridor doctrine.
  const runtime = new CombatDoctrineRuntime({ seed: 1827 });
  const frame = (contact) => perception(
    [shipContact(1, { mobilityBand: 'high', threat: 0.8, ...contact })],
    { vx: 50, rot: 0.3 },
  );
  let result = runtime.update({
    tick: 120, entityId: 'swarmer', doctrineId: CombatDoctrineId.SWARM_PACK,
    perception: frame({ x: 300, z: 0 }), directive,
  });
  assert.equal(result.phase, 'engine_flare');
  assert.equal(result.aimCommit, null, 'swarm cues never publish a firing corridor');
  assert.equal(result.attackLine.heading, 0.3, 'the swarm lane still follows the live hull heading');
  result = runtime.update({
    tick: 150, entityId: 'swarmer', doctrineId: CombatDoctrineId.SWARM_PACK,
    perception: frame({ x: 220, z: 0 }), directive,
  });
  assert.equal(result.phase, 'strike');
  assert.equal(result.aimCommit, null);
  assert.equal(result.attackLine.heading, 0.3);

  // The shared fire path is untouched for non-committed roles: the aim re-solves freely.
  const { target, shooter, fire } = fireFixture({
    rot: 0, targetPos: { x: 350, z: 0 }, doctrineId: CombatDoctrineId.SWARM_PACK,
  });
  fire({ doctrineId: CombatDoctrineId.SWARM_PACK, phase: 'strike', phaseStartedTick: 150, cycle: 0, fireWindow: true }, 150);
  assert.equal(shooter.data.intent.fire, true);
  const freeLead = Math.atan2(target.pos.z - shooter.pos.z, target.pos.x - shooter.pos.x);
  assert(Math.abs(wrap(shooter.data.intent.aimAngle - freeLead)) < 1e-9,
    'a non-committed doctrine tracks the live lead with no corridor clamp');
  // A mid-run dodge IS re-tracked — that is the pre-commit behavior other doctrines keep.
  target.pos = { x: 320, z: 160 };
  fire({ doctrineId: CombatDoctrineId.SWARM_PACK, phase: 'strike', phaseStartedTick: 150, cycle: 0, fireWindow: true }, 150);
  const retracked = Math.atan2(160, 320);
  assert(Math.abs(wrap(shooter.data.intent.aimAngle - retracked)) < 1e-9,
    'non-committed roles still retarget freely');
});

test('the ranged corridor is untouched by the run-corridor extension', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 1931 });
  const frame = () => perception(
    [shipContact(1, { x: 620, mobilityBand: 'low', threat: 0.95 })],
    { rot: 0.5 },
  );
  runtime.update({
    tick: 0, entityId: 'sniper', doctrineId: CombatDoctrineId.RANGED_DISENGAGER,
    perception: frame(), directive,
  });
  const cue = runtime.update({
    tick: 45, entityId: 'sniper', doctrineId: CombatDoctrineId.RANGED_DISENGAGER,
    perception: frame(), directive,
  });
  assert.equal(cue.phase, 'charge_cue');
  assert(cue.aimCommit && Math.abs(cue.aimCommit.capRad - 0.1) < 1e-9,
    'the ranged corridor keeps its authored 0.1 rad correction band');
  assert.equal(cue.attackLine.heading, 0.5,
    'the ranged cue keeps its own drawn-line contract (scope boundary of this change)');
});

test('run corridors are deterministic across identical seed and sensor frames', () => {
  const run = () => {
    const runtime = new CombatDoctrineRuntime({ seed: 2027 });
    const trace = [];
    for (let tick = 0; tick <= 60; tick += 5) {
      trace.push(runtime.update({
        tick, entityId: 'brawler', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
        perception: perception([shipContact(1, { x: 400, z: tick < 40 ? 0 : 30, mobilityBand: 'low', threat: 0.9 })], { vx: 90 }),
        directive,
      }));
    }
    return trace.map((row) => ({ phase: row.phase, bearing: row.aimCommit && row.aimCommit.bearing,
      line: row.attackLine && row.attackLine.heading }));
  };
  assert.deepEqual(run(), run(), 'same seed and frames produce identical corridor traces');
});
