// feel.gravity_well — the real-path replacement for the inline orbit model.
//
// THE REAL-PATH LAW (scenarios/README.md): the old inline case integrated its own inverse-square
// orbit (mu 48000, softening 25) that no production system runs. This module boots the live
// rapier-dynamic authority with the production `fields` owner, presses the player's real
// `deployWell` action at an aim point, and watches an unpiloted light hull coast past that point.
// Every number is the hull's own trajectory out of runtime.step(); the deflection is differenced
// against a control arm that is identical except that the action is never pressed.
//
// Setup (initial conditions only): player Hornet at the origin aiming +X at WELL_AIM; a Wasp with
// no flight/AI systems registered coasting +Z at ENTRY_SPEED on a line BYPASS_WU off the aim point.
// The result under test — capture, convergence, release — is never written.
import { FIELD_DEFS } from '../../../../src/data/fields.js';
import { readPhysicsTelemetry } from '../../../../src/core/physicsAuthority.js';
import { fields } from '../../../../src/systems/fields.js';
import { bootRealPath, OPEN_SPACE_BOUNDS } from '../realPath.mjs';

const WELL_AIM = Object.freeze({ x: 200, z: 0 });
const BYPASS_WU = 50;
const ENTRY_SPEED = 140;
const START_Z = -300;
const PRESS_TICK = 1;            // ticks after the first settle step
const WINDOW_TICKS = 660;        // 11 s: the 9 s well lifetime plus its release
const SAMPLE_STRIDE = 30;
const DEF = FIELD_DEFS.well;
const CONVERGENCE_WU_S = DEF.strength / DEF.damping;

const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const speedOf = (e) => Math.hypot(e.vel.x, e.vel.z);

async function runArm(seed, pressWell) {
  const host = await bootRealPath({
    seed,
    systems: [fields, 'collisionConsequences', 'physics'],
    bounds: OPEN_SPACE_BOUNDS,
    hulls: [{ hullId: 'ship_hornet', pos: { x: 0, z: 0 }, isPlayer: true }],
  });
  const { state, bus } = host;
  const events = [];
  for (const name of ['fields:deployed', 'fields:ended', 'fields:deployDenied']) {
    bus.on(name, (p) => events.push({ tick: state.tick | 0, type: name,
      data: { fieldId: p && p.fieldId, kind: p && p.kind, sourceId: p && p.sourceId, reason: p && p.reason } }));
  }
  const victim = host.spawnShip({ hullId: 'ship_wasp', pos: { x: WELL_AIM.x - BYPASS_WU, z: START_Z }, team: 1 });
  victim.vel.x = 0;
  victim.vel.z = ENTRY_SPEED;
  host.step(1);
  const bodied = readPhysicsTelemetry(victim) != null;
  host.player.rot = 0;
  state.input.aimWorld = { x: WELL_AIM.x, z: WELL_AIM.z };
  let pressedTick = null;
  const samples = [];
  let minDist = Infinity;
  let enteredTick = null;
  let exitedTick = null;
  host.step(WINDOW_TICKS, {
    before: ({ index, tick }) => {
      if (pressWell && index === PRESS_TICK) { state.input.actions.deployWell = true; pressedTick = tick; }
    },
    after: ({ tick, index }) => {
      const d = Math.hypot(victim.pos.x - WELL_AIM.x, victim.pos.z - WELL_AIM.z);
      if (d < minDist) minDist = d;
      if (d <= DEF.radius && enteredTick == null) enteredTick = tick;
      if (enteredTick != null && exitedTick == null && d > DEF.radius) exitedTick = tick;
      if (index % SAMPLE_STRIDE === 0) {
        samples.push({ tick, x: r1(victim.pos.x), z: r1(victim.pos.z), speed: r1(speedOf(victim)), dist: r1(d) });
      }
    },
  });
  const out = { bodied, pressedTick, events, samples, minDist, enteredTick, exitedTick,
    final: { x: victim.pos.x, z: victim.pos.z, speed: speedOf(victim) }, victimId: victim.id,
    playerId: host.player.id, proof: host.proof() };
  host.dispose();
  return out;
}

export async function measureGravityWell(seed) {
  const control = await runArm(seed, false);
  const well = await runArm(seed, true);
  const deployed = well.events.find((e) => e.type === 'fields:deployed') || null;
  const ended = well.events.find((e) => e.type === 'fields:ended') || null;
  // Deflection: how far the well arm's hull sits from where the same hull is without the well,
  // at every shared sample; the reading is the largest gap.
  let deflection = 0;
  for (let i = 0; i < Math.min(control.samples.length, well.samples.length); i++) {
    const a = control.samples[i]; const b = well.samples[i];
    deflection = Math.max(deflection, Math.hypot(a.x - b.x, a.z - b.z));
  }
  // Convergence: the hull's speed 1.5 s after it crossed the rim (kernel equilibrium is
  // strength/damping, independent of mass and of where in the radius the hull sits).
  const settleTick = well.enteredTick == null ? null : well.enteredTick + 90;
  const settled = settleTick == null ? null
    : well.samples.reduce((best, s) => (best == null || Math.abs(s.tick - settleTick) < Math.abs(best.tick - settleTick) ? s : best), null);
  const unmeasured = !control.bodied || !well.bodied;
  const checks = [
    ['body_simulated', !unmeasured],
    ['well_deployed_from_action', !!deployed && deployed.data.kind === 'well'],
    ['control_path_straight', control.minDist >= BYPASS_WU - 1],
    ['hull_entered_radius', well.enteredTick != null],
    ['hull_deflected', deflection >= 10],
  ];
  const firstViolated = (checks.find(([, ok]) => !ok) || [null])[0];
  const metrics = {
    input: { action: 'deployWell', tick: well.pressedTick, aimWorld: WELL_AIM, playerId: well.playerId },
    field: deployed ? { fieldId: deployed.data.fieldId, emitterId: deployed.data.sourceId, deployedTick: deployed.tick,
      endedTick: ended ? ended.tick : null, endedReason: ended ? ended.data.reason : null } : null,
    victimId: well.victimId,
    entrySpeed: ENTRY_SPEED,
    convergenceSpeed: r1(CONVERGENCE_WU_S),
    enteredRadiusTick: well.enteredTick,
    exitedRadiusTick: well.exitedTick,
    speedAfterCaptureS1_5: settled ? settled.speed : null,
    minDistance: r1(well.minDist),
    controlMinDistance: r1(control.minDist),
    lateralDeflection: r1(deflection),
    exitSpeed: r1(well.final.speed),
    controlExitSpeed: r1(control.final.speed),
    speedGained: r1(well.final.speed - ENTRY_SPEED),
    unmeasured,
    firstViolatedExpectation: firstViolated,
    barMet: firstViolated == null,
    realPath: { physicsBackend: well.proof && well.proof.physicsBackend, owner: 'src/systems/fields.js' },
  };
  const eventTrace = [
    ...well.events,
    ...well.samples.map((s) => ({ tick: s.tick, type: 'well_arm_sample', data: s })),
    ...control.samples.filter((_, i) => i % 4 === 0).map((s) => ({ tick: s.tick, type: 'control_arm_sample', data: s })),
  ];
  return { metrics, eventTrace };
}

export const scenario = {
  id: 'feel.gravity_well',
  label: 'B1 Gravitic Well Deflection & Capture (real fields owner, control-differenced; fling not claimed)',
  run: measureGravityWell,
};

export default scenario;
