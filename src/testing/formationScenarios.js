// Scenario library for the closed-loop formation rig (Controlled Chaos packet 03).
//
// Each scenario is data: a rig config, a run length, the SUSTAINED window to judge (after the
// scenario has had time to converge), and an optional event script. `runFormationScenario`
// returns the metrics from formationMetrics.js. Tests assert bounds on those numbers; the CLI
// (scripts/formation-lab.mjs) prints them. Same inputs -> same numbers (fixed seed, fixed dt).

import { circlePath, createFormationRig, linePath, slalomPath } from './formationRig.js';

const FAR_LEFT = { x: -520, z: 260 };
const FAR_RIGHT = { x: 540, z: -260 };

function heavy(mass) {
  // Same accel authority regardless of mass (the actuator scales force by mass), inertia in
  // proportion: a heavy hull is a bigger body with the same drive-to-mass ratio, not a stronger one.
  return { mass, inertia: 88 * mass / 32, radius: 12 + Math.max(0, (mass - 32) / 12) };
}

export const FORMATION_SCENARIOS = Object.freeze({
  stationary_arrival: {
    summary: 'Static leader, two followers arrive from ~580 WU and must SETTLE (not circle).',
    ticks: 2400,
    window: { fromTick: 1500, toTick: 2400 },
    config: () => ({
      formation: 'line',
      members: [{ x: 0, z: 0 }, { ...FAR_LEFT }, { ...FAR_RIGHT }],
    }),
  },
  stationary_wedge: {
    summary: 'Static leader, wedge of four.',
    ticks: 2400,
    window: { fromTick: 1500, toTick: 2400 },
    config: () => ({
      formation: 'wedge',
      members: [{ x: 0, z: 0 }, { x: -480, z: 300 }, { x: 500, z: 260 }, { x: 40, z: -520 }],
    }),
  },
  moving_leader: {
    summary: 'Leader cruises straight at 35 WU/s; followers must hold station, not saw-tooth.',
    ticks: 2700,
    window: { fromTick: 1800, toTick: 2700 },
    config: () => ({
      formation: 'line',
      members: [{ x: 0, z: 0 }, { x: -260, z: 160 }, { x: -240, z: -170 }],
      leaderPath: linePath({ x: 0, z: 0, vx: 35, vz: 0, startT: 1 }),
    }),
  },
  fast_leader: {
    summary: 'Leader cruises at 60 WU/s (above the follower hold/formation speed caps).',
    ticks: 2700,
    window: { fromTick: 1800, toTick: 2700 },
    config: () => ({
      formation: 'line',
      members: [{ x: 0, z: 0 }, { x: -260, z: 160 }, { x: -240, z: -170 }],
      leaderPath: linePath({ x: 0, z: 0, vx: 60, vz: 0, startT: 1 }),
    }),
  },
  turning_leader: {
    summary: 'Leader flies a 500 WU circle at 40 WU/s: the frame rotates, slots need omega x r.',
    ticks: 3000,
    window: { fromTick: 2000, toTick: 3000 },
    config: () => ({
      formation: 'line',
      members: [{ x: 500, z: 0, rot: Math.PI / 2 }, { x: 430, z: -90, rot: Math.PI / 2 }, { x: 560, z: -90, rot: Math.PI / 2 }],
      leaderPath: circlePath({ cx: 0, cz: 0, radius: 500, speed: 40 }),
    }),
  },
  accelerating_leader: {
    summary: 'Leader accelerates 10 -> 55 WU/s while sweeping through a 1.6 rad turn.',
    ticks: 3000,
    window: { fromTick: 2200, toTick: 3000 },
    config: () => ({
      formation: 'line',
      members: [{ x: 0, z: 0 }, { x: -120, z: 90 }, { x: -120, z: -90 }],
      leaderPath: slalomPath({ x: 0, z: 0, v0: 10, v1: 55, rampS: 10, turn: 1.6, turnS: 14, startT: 1 }),
    }),
  },
  light_followers: {
    summary: 'Stationary arrival with 12-mass followers.',
    ticks: 2400,
    window: { fromTick: 1500, toTick: 2400 },
    config: () => ({
      formation: 'line',
      members: [{ x: 0, z: 0 }, { ...FAR_LEFT, ...heavy(12) }, { ...FAR_RIGHT, ...heavy(12) }],
    }),
  },
  heavy_followers: {
    summary: 'Stationary arrival with 140-mass followers.',
    ticks: 2400,
    window: { fromTick: 1500, toTick: 2400 },
    config: () => ({
      formation: 'line',
      members: [{ x: 0, z: 0 }, { ...FAR_LEFT, ...heavy(140) }, { ...FAR_RIGHT, ...heavy(140) }],
    }),
  },
  leader_death: {
    summary: 'Settled wedge of four; the leader dies. Survivors re-form on the successor without a stampede.',
    ticks: 3000,
    window: { fromTick: 2300, toTick: 3000 },
    config: () => ({
      formation: 'wedge',
      members: [{ x: 0, z: 0 }, { x: -72, z: -52 }, { x: -72, z: 52 }, { x: -144, z: -104 }],
    }),
    script(rig) {
      rig.at(1200, () => rig.kill(rig.ids[0]));
    },
    // The successor's body is a different frame origin: those ticks are a deliberate membership event.
    ignoreTicks: [[1200, 1500]],
  },
  member_loss_and_recycled_id: {
    summary: 'Settled wedge of four; a follower dies and a replacement takes the recycled id.',
    ticks: 3000,
    window: { fromTick: 2300, toTick: 3000 },
    config: () => ({
      formation: 'wedge',
      members: [{ x: 0, z: 0 }, { x: -72, z: -52 }, { x: -72, z: 52 }, { x: -144, z: -104 }],
    }),
    script(rig) {
      rig.at(1200, () => rig.kill(rig.ids[1]));
      rig.at(1320, () => rig.join({ x: -420, z: 40 }));
    },
    ignoreTicks: [[1200, 1500]],
  },
  heavy_impulse: {
    summary: 'Settled line; follower #1 takes a 90 WU/s shove with 5 rad/s spin and must recover smoothly.',
    ticks: 3300,
    window: { fromTick: 2700, toTick: 3300 },
    config: () => ({
      formation: 'line',
      members: [{ x: 0, z: 0 }, { x: -72, z: 0 }, { x: -72, z: 72 }],
    }),
    script(rig) {
      rig.at(1500, () => rig.impulse(rig.ids[1], 0, 90, 5));
    },
  },
  tumble_recovery: {
    summary: 'Settled line; follower #1 is decontrolled for 1.5 s after a shove, then must re-acquire its slot.',
    ticks: 3300,
    window: { fromTick: 2700, toTick: 3300 },
    config: () => ({
      formation: 'line',
      members: [{ x: 0, z: 0 }, { x: -72, z: 0 }, { x: -72, z: 72 }],
    }),
    script(rig) {
      rig.at(1500, () => { rig.impulse(rig.ids[1], 0, 70, 4); rig.tumble(rig.ids[1], 90); });
    },
  },
  recipe_ingress: {
    summary: 'Engaged four-ship flight (squad frame, scissors) closing a static target: slot tracking while in frame.',
    ticks: 1500,
    window: { fromTick: 700, toTick: 1500 },
    config: () => ({
      formation: 'wedge',
      members: [
        { x: -900, z: 0, ai: { combatDoctrineId: 'interceptor_flyby', squadRecipe: 'interceptor_scissors', preferredRole: 'leader' } },
        { x: -960, z: -60, ai: { combatDoctrineId: 'interceptor_flyby', squadRecipe: 'interceptor_scissors' } },
        { x: -960, z: 60, ai: { combatDoctrineId: 'interceptor_flyby', squadRecipe: 'interceptor_scissors' } },
        { x: -1020, z: 0, ai: { combatDoctrineId: 'interceptor_flyby', squadRecipe: 'interceptor_scissors' } },
      ],
      target: { x: 600, z: 0 },
    }),
  },
});

export async function runFormationScenario(id, overrides = {}) {
  const def = FORMATION_SCENARIOS[id];
  if (!def) throw new Error(`unknown formation scenario: ${id}`);
  const built = def.config();
  const config = { ...built, ...(overrides.config || {}) };
  if (overrides.members) config.members = overrides.members(config.members);
  const rig = await createFormationRig(config);
  try {
    if (def.script) def.script(rig);
    if (overrides.script) overrides.script(rig);
    rig.run(overrides.ticks ?? def.ticks);
    const window = overrides.window || def.window;
    const summary = rig.summarize({
      ...window,
      settleRadius: overrides.settleRadius ?? 40,
      ignoreTicks: overrides.ignoreTicks || def.ignoreTicks || [],
    });
    return { id, summary, rig };
  } catch (error) {
    rig.dispose();
    throw error;
  }
}

/** Compact one-line-per-member digest for tables and test failure messages. */
export function digestSummary(summary) {
  const rows = [];
  for (const [id, m] of Object.entries(summary.members)) {
    if (!m.samples) { rows.push(`#${id} (no samples)`); continue; }
    rows.push(`#${id} pe p50/p95/max=${m.posErr.p50}/${m.posErr.p95}/${m.posErr.max}`
      + ` ve p95=${m.velErr.p95} yaw rev/s=${m.yaw.reversalsPerSec} rms=${m.yaw.rms}`
      + ` sat=${m.saturatedFraction} kind=${m.kindChanges} jumps=${m.slotJumps} reexit=${m.reexits}`);
  }
  const g = summary.geometry;
  rows.push(`geometry minClearance=${g.minClearance} contactEpisodes=${g.contactEpisodes}`);
  return rows.join('\n');
}
