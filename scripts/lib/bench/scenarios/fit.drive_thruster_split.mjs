// PQ-176.01 — "drive and thruster split", measured in the hands.
//
// One hull, one gun, two ways to spend the propulsion budget. The drive owns forward thrust and the
// speed the governor lets you hold; the manoeuvring bay owns turn torque, strafe and brake. If the
// split is real, the two builds are different SHIPS in player units — top speed, the time to turn a
// velocity all the way round, and the radius that turn takes — and both are still viable.
//
// The two builds are the launchable Crucible kits `hornet_fast_clumsy` (Bolt) and
// `hornet_nimble_slow` (Hinge), read straight out of the kit catalog so this can never measure a
// fit the player cannot pick. Crucible viability is proved by the Crucible's own bench
// (`scripts/check-crucible-swarm-bars.mjs --cell --loadout=<kit>`); what this scenario owns is the
// handling difference the split is supposed to create.

import { COMBAT_LAB_STARTER_PACKAGES } from '../../../../src/data/combatLabSetups.js';
import { wrapAngle } from '../../../../src/core/rng.js';
import { buildSlotList, getDerivedStats, outfitBudgetForFittings } from '../../../../src/systems/ships.js';
import { SHIPS } from '../../../../src/data/ships.js';
import { bootRealPath, writeRealPathInput } from '../realPath.mjs';

const HULL_ID = 'ship_hornet';
const BUILDS = Object.freeze([
  { key: 'bolt', kitId: 'hornet_fast_clumsy' },
  { key: 'hinge', kitId: 'hornet_nimble_slow' },
]);

const SETTLE_TICKS = 90;
const CRUISE_TICKS = 900;
const REVERSAL_TICKS = 1800;
const TURN_TICKS = 1800;
const REVERSAL_TARGET_RAD = Math.PI * 0.88;
const QUARTER = Math.PI / 2;
// The split has to be felt, not just published: two builds of one hull that differ by less than
// this in either direction are one ship with two price tags.
const SPLIT_BAR_PCT = 25;

export const scenario = {
  id: 'fit.drive_thruster_split',
  label: 'PQ-176.01 Drive and thruster split — fast-clumsy and nimble-slow are two ships',
  async run(seed) {
    const eventTrace = [];
    const builds = {};
    for (const build of BUILDS) {
      builds[build.key] = await measureBuild(seed, build, eventTrace);
    }
    const bolt = builds.bolt;
    const hinge = builds.hinge;

    const topSpeedGapPct = pctGap(bolt.cruiseSpeed, hinge.cruiseSpeed);
    const reversalGapPct = pctBetter(bolt.velocity180TimeS, hinge.velocity180TimeS);
    const radiusGapPct = pctBetter(bolt.turnRadiusWu, hinge.turnRadiusWu);

    const bars = [
      {
        bar: 'PQ-176.01',
        label: 'the drive half — Bolt holds a higher speed than Hinge',
        value: topSpeedGapPct,
        unit: '% faster at cruise',
        met: Number.isFinite(topSpeedGapPct) && topSpeedGapPct >= SPLIT_BAR_PCT,
        note: `Bolt cruises at ${bolt.cruiseSpeed} WU/s, Hinge at ${hinge.cruiseSpeed} WU/s.`,
      },
      {
        bar: 'PQ-176.01',
        label: 'the thruster half — Hinge turns a velocity around faster than Bolt',
        value: reversalGapPct,
        unit: '% quicker to reverse',
        met: Number.isFinite(reversalGapPct) && reversalGapPct >= SPLIT_BAR_PCT,
        note: `Bolt takes ${bolt.velocity180TimeS} s to reverse, Hinge ${hinge.velocity180TimeS} s.`,
      },
      {
        bar: 'PQ-176.01',
        label: 'the thruster half — Hinge holds a tighter arc than Bolt',
        value: radiusGapPct,
        unit: '% tighter turn radius',
        met: Number.isFinite(radiusGapPct) && radiusGapPct >= SPLIT_BAR_PCT,
        note: `Bolt turns in ${bolt.turnRadiusWu} WU at cruise, Hinge in ${hinge.turnRadiusWu} WU.`,
      },
      {
        bar: 'PQ-176.01',
        label: 'both builds are legal, launchable kits of the same hull',
        value: (bolt.budgetFits ? 1 : 0) + (hinge.budgetFits ? 1 : 0),
        unit: 'of 2 kits inside the nested budgets',
        met: bolt.budgetFits === true && hinge.budgetFits === true && bolt.hullId === hinge.hullId,
      },
    ];

    return {
      eventTrace,
      metrics: { seed, hullId: HULL_ID, builds, topSpeedGapPct, reversalGapPct, radiusGapPct, splitBarPct: SPLIT_BAR_PCT, bars },
    };
  },
};

/** The kit catalog is the source of truth for what the player can launch. */
function fittingsForKit(kitId) {
  const kit = COMBAT_LAB_STARTER_PACKAGES.find((row) => row.id === kitId);
  if (!kit) throw new Error(`fit.drive_thruster_split: unknown Crucible kit "${kitId}"`);
  const shipDef = SHIPS.find((row) => row.id === kit.hullId);
  const slots = buildSlotList(shipDef);
  const fittings = new Array(slots.length).fill(null);
  for (const entry of kit.loadout) fittings[entry.slotIndex] = entry.defId;
  return { kit, shipDef, fittings };
}

async function measureBuild(seed, build, eventTrace) {
  const { kit, fittings } = fittingsForKit(build.kitId);
  const budget = outfitBudgetForFittings(kit.hullId, fittings);
  const derived = getDerivedStats(kit.hullId, fittings, null);

  const cruise = await flyCruise(seed, kit.hullId, fittings);
  const reversal = await flyReversal(seed, kit.hullId, fittings);
  const turn = await flyTurn(seed, kit.hullId, fittings);

  eventTrace.push({
    tick: null, type: `${build.key}:measured`,
    cruiseSpeed: cruise, velocity180TimeS: reversal, turnRadiusWu: turn,
  });

  const profile = derived.propulsion || {};
  return {
    kitId: kit.id,
    label: kit.label,
    hullId: kit.hullId,
    massT: round(derived.operationalMass, 1),
    driveId: fittings.find((id) => id && id.startsWith('mod_engine_')) || 'hull default',
    thrusterId: profile.thrusterId || null,
    publishedForwardAccel: round(profile.mainAccel ?? profile.maxAccel, 2),
    publishedYawAccel: round(profile.yawAccel, 2),
    publishedMaxYawRate: round(profile.maxYawRate, 3),
    publishedTopSpeed: round(profile.combatSpeed ?? profile.maxSpeed, 1),
    cruiseSpeed: round(cruise, 1),
    velocity180TimeS: round(reversal, 3),
    turnRadiusWu: round(turn, 1),
    budgetFits: budget ? budget.fits === true : false,
  };
}

async function boot(seed, hullId, fittings) {
  return bootRealPath({
    seed,
    systems: ['actions', 'flightV3', 'physics'],
    hulls: [{ hullId, pos: { x: 0, z: 0 }, rot: 0, isPlayer: true, factionId: 'faction_free', fittings: fittings.slice() }],
  });
}

async function flyCruise(seed, hullId, fittings) {
  const host = await boot(seed, hullId, fittings);
  try {
    host.step(SETTLE_TICKS, { before: ({ state }) => { writeRealPathInput(state, {}); } });
    host.step(CRUISE_TICKS, { before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); } });
    return planarSpeed(host.player);
  } finally { host.dispose(); }
}

async function flyReversal(seed, hullId, fittings) {
  const host = await boot(seed, hullId, fittings);
  try {
    const player = host.player;
    host.step(SETTLE_TICKS, { before: ({ state }) => { writeRealPathInput(state, {}); } });
    host.step(CRUISE_TICKS, { before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); } });
    const startHeading = Math.atan2(player.vel.z, player.vel.x);
    const startRot = player.rot || 0;
    let startSimTime = null;
    let measured = null;
    host.step(REVERSAL_TICKS, {
      before: ({ state, host: h }) => {
        const err = wrapAngle((startRot + Math.PI) - (h.player.rot || 0));
        const aligned = Math.abs(err) < 0.06;
        writeRealPathInput(state, { moveZ: aligned ? 1 : 0, turnIntent: aligned ? 0 : clamp(err / 0.32) });
        if (startSimTime == null) startSimTime = state.simTime;
      },
      after: ({ state, host: h }) => {
        if (planarSpeed(h.player) < 2.2) return;
        const heading = Math.atan2(h.player.vel.z, h.player.vel.x);
        if (Math.abs(wrapAngle(heading - startHeading)) >= REVERSAL_TARGET_RAD) {
          measured = state.simTime - startSimTime;
          return false;
        }
      },
    });
    return measured;
  } finally { host.dispose(); }
}

async function flyTurn(seed, hullId, fittings) {
  const host = await boot(seed, hullId, fittings);
  try {
    const player = host.player;
    host.step(SETTLE_TICKS, { before: ({ state }) => { writeRealPathInput(state, {}); } });
    host.step(CRUISE_TICKS, { before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); } });
    let prevHeading = null;
    let swept = 0;
    let speedSum = 0;
    let speedN = 0;
    let startSimTime = null;
    let endSimTime = null;
    let reached = false;
    host.step(TURN_TICKS, {
      before: ({ state }) => { writeRealPathInput(state, { moveZ: 1, turnIntent: 1 }); },
      after: ({ state }) => {
        const heading = Math.atan2(player.vel.z, player.vel.x);
        const speed = planarSpeed(player);
        speedSum += speed;
        speedN += 1;
        endSimTime = state.simTime;
        if (prevHeading == null) { prevHeading = heading; startSimTime = state.simTime; return; }
        swept += wrapAngle(heading - prevHeading);
        prevHeading = heading;
        if (Math.abs(swept) >= QUARTER) { reached = true; return false; }
      },
    });
    if (!reached) return null;
    const sweepS = endSimTime - startSimTime;
    const rate = sweepS > 0 ? Math.abs(swept / sweepS) : 0;
    const meanSpeed = speedN ? speedSum / speedN : 0;
    return rate > 0 ? meanSpeed / rate : null;
  } finally { host.dispose(); }
}

/** How much MORE the first value is than the second, as a percentage of the second. */
function pctGap(bigger, smaller) {
  const a = Number(bigger);
  const b = Number(smaller);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null;
  return round(((a - b) / b) * 100, 1);
}

/** How much of the worse figure the better one saves — the reading for a time or a radius. */
function pctBetter(worse, better) {
  const w = Number(worse);
  const b = Number(better);
  if (!Number.isFinite(w) || !Number.isFinite(b) || w <= 0) return null;
  return round(((w - b) / w) * 100, 1);
}

function clamp(value) { return Math.max(-1, Math.min(1, value)); }
function planarSpeed(entity) {
  const vel = entity && entity.vel;
  return Math.hypot((vel && vel.x) || 0, (vel && vel.z) || 0);
}
function round(value, digits) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
