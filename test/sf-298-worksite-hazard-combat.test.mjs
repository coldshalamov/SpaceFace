// SF-298 — a worksite hazard becomes a combat opportunity.
//
// The packet's machine is the landed PQ-027 kill-machine set: real environmental force
// volumes registered into the one field kernel (team: null — the machine checks no IFF),
// a physical anvil body, and a warning → surge → calm schedule. The death is the slam law
// against the anvil, never a scripted aura. Prior rows pin the attacker kill and the calm
// window; this file pins what those don't:
//
//   1. The CARELESS collateral move is real physics — a civilian worker hull shoved into the
//      same surge dies by the same law that kills the attacker. Collateral is not a flag.
//   2. Attribution is live on the diagnostics seam — while the player is inside at surge the
//      judgment names the attacker ids, the worker/cargo collateral (kept, not despawned),
//      and player exposure, so consequences stay attributable.
//   3. The avoidable window is the same schedule — the identical worker shove during calm
//      leaves the hull alive: the machine's civilian operation keeps running between bites.

import assert from 'node:assert/strict';
import test from 'node:test';

import { FIELD_FLAGS } from '../src/data/fields.js';
import { KILL_MACHINE_SECTOR_ID, KILL_MACHINES } from '../src/data/environmentalMachinery.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';
import { fields } from '../src/systems/fields.js';
import { combat } from '../src/systems/combat.js';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';

const LONG = { timeout: 180_000 };
const LIGHT_HULL_ID = 'ship_wasp';
const PLAYER_HULL_ID = 'ship_kestrel';
const MACHINE = KILL_MACHINES[0]; // excavator_jaws — sheet field squeezes onto the anvil line

const SURGE_T = MACHINE.phaseOffsetS + MACHINE.cycle.warningS + 0.35;
const CALM_T = MACHINE.phaseOffsetS + MACHINE.cycle.warningS + MACHINE.cycle.surgeS + 0.35;

function insidePose(machine, acrossOffset = 0, along = 12) {
  const across = machine.anvil.radius + 14 + 16 + acrossOffset;
  return {
    pos: {
      x: machine.globalPos.x + machine.perp.x * across + machine.dir.x * along,
      z: machine.globalPos.z + machine.perp.z * across + machine.dir.z * along,
    },
    rot: Math.atan2(-machine.perp.z, -machine.perp.x),
  };
}

const speedOf = (e) => Math.hypot(Number(e && e.vel && e.vel.x) || 0, Number(e && e.vel && e.vel.z) || 0);
const hullOf = (e) => Math.max(0, Number(e && e.hull) || 0);

async function bootMachine({ simTime, cast }) {
  const previousFields = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const host = await bootRealPath({
    seed: 2980,
    systems: [
      'actions',
      'flightV3',
      environmentalMachinery,
      fields,
      'physics',
      'collisionConsequences',
      combat,
      terrainAnchors,
    ],
    hulls: [{
      hullId: PLAYER_HULL_ID,
      // Inside the sheet volume (along in [0,108), lat < halfWidth 76) but ~80 wu up-lane
      // from the squeeze line — exposed to the same law, no spawn overlap with the victims.
      pos: insidePose(MACHINE, -30, 95).pos,
      rot: 0,
      isPlayer: true,
      factionId: 'faction_free',
    }],
  });
  host.state.world = host.state.world || {};
  host.state.world.currentSectorId = KILL_MACHINE_SECTOR_ID;
  host.state.simTime = simTime;
  const spawned = {};
  for (const [key, spec] of Object.entries(cast)) {
    const entity = host.spawnShip({
      hullId: LIGHT_HULL_ID,
      pos: spec.pos,
      rot: spec.rot ?? 0,
      team: spec.team,
      factionId: spec.factionId,
    });
    entity.data = entity.data || {};
    if (spec.role) entity.data.role = spec.role;
    if (spec.trafficRole) entity.data.trafficRole = spec.trafficRole;
    if (spec.hostile) entity.data.hostile = true;
    spawned[key] = entity;
  }
  return { host, spawned, restore: () => { host.dispose(); FIELD_FLAGS.enabled = previousFields; } };
}

function machineDiagnostics(host) {
  // createSimulation binds a per-runtime instance — the module singleton is never init'd.
  const sys = host.runtime.getSystem('environmentalMachinery');
  const diag = sys && typeof sys.diagnostics === 'function' ? sys.diagnostics(host.state) : null;
  return diag && Array.isArray(diag.machines)
    ? diag.machines.find((m) => m.id === MACHINE.id) : null;
}

test('the same surge that kills the attacker kills the worker — collateral is physics, and the census attributes it', LONG, async () => {
  // The two victims stand on opposite flanks of the squeeze lane (across ±52). Same-side
  // spacing fails twice over: within ~6 wu they depenetrate apart, and a worker at across
  // ~30 spawns inside the anvil's hull-radius contact band, which Rapier ejects from the
  // volume before the census sees it. Mirrored, each slams the anvil from its own side.
  const attackerPose = insidePose(MACHINE, 0);     // across +52
  const workerPose = insidePose(MACHINE, -104);    // across -52 — opposite flank, same law
  const { host, spawned, restore } = await bootMachine({
    simTime: SURGE_T,
    cast: {
      attacker: { pos: attackerPose.pos, team: 1, factionId: 'faction_dmc', role: 'attacker', hostile: true },
      worker: { pos: workerPose.pos, team: 2, factionId: 'faction_dmc', trafficRole: 'hauler' },
    },
  });
  try {
    const { attacker, worker } = spawned;
    const hull0 = { attacker: hullOf(attacker), worker: hullOf(worker) };
    let firstJudgment = null;
    let workerDied = false;
    let attackerDied = false;
    host.step(240, {
      before({ state }) {
        state.world.currentSectorId = KILL_MACHINE_SECTOR_ID;
        state.simTime = SURGE_T;
      },
      after() {
        const row = machineDiagnostics(host);
        // Tick 0's census can run before the spatial hash's first build — keep the first
        // judgment that actually saw occupants.
        if (!firstJudgment && row && row.collateral
          && ((row.collateral.attackerIds || []).length > 0
            || (row.collateral.collateral || []).length > 0)) {
          firstJudgment = { ...row.collateral };
        }
        workerDied ||= worker.alive === false || hullOf(worker) <= 0;
        attackerDied ||= attacker.alive === false || hullOf(attacker) <= 0;
        if (workerDied && attackerDied) return false;
        return undefined;
      },
    });
    assert.equal(attackerDied, true, 'the machine-assisted move resolves the attacker');
    assert.equal(workerDied, true,
      `the careless collateral move is real — the worker dies by the same slam law ` +
      `(hull ${hull0.worker} -> ${hullOf(worker)})`);
    assert.ok(hull0.worker > 0 && hullOf(worker) <= 0, 'the worker hull is destroyed, not flag-marked');

    assert.ok(firstJudgment, 'the surge records a live collateral census on diagnostics');
    assert.equal(firstJudgment.contact, true, 'contact during surge is judged real');
    assert.equal(firstJudgment.scriptedKill, false, 'no scripted-kill flag — the physics did it');
    assert.equal(firstJudgment.playerExposed, true, 'a player inside the volume is exposed too');
    assert.ok((firstJudgment.attackerIds || []).includes(attacker.id),
      'the attacker is attributable by id');
    const collateralIds = (firstJudgment.collateral || []).map((row) => row.id);
    assert.ok(collateralIds.includes(worker.id),
      'the worker is judged collateral, kept in place — avoidable, attributable, recoverable');
  } finally {
    restore();
  }
});

test('the identical worker shove during calm is the avoidable window — the machine keeps its day job', LONG, async () => {
  const workerPose = insidePose(MACHINE, -6);
  const { host, spawned, restore } = await bootMachine({
    simTime: CALM_T,
    cast: {
      worker: { pos: workerPose.pos, team: 2, factionId: 'faction_dmc', trafficRole: 'hauler' },
    },
  });
  try {
    const { worker } = spawned;
    const hull0 = hullOf(worker);
    let maxSpeed = 0;
    host.step(120, {
      before({ state }) {
        state.world.currentSectorId = KILL_MACHINE_SECTOR_ID;
        state.simTime = CALM_T;
      },
      after() {
        maxSpeed = Math.max(maxSpeed, speedOf(worker));
        return undefined;
      },
    });
    assert.equal(worker.alive !== false && hullOf(worker) > 0, true,
      'calm is the honest safe window — the worksite keeps working');
    assert.ok(hullOf(worker) > hull0 * 0.5, 'calm contact is not the bite');
    assert.ok(maxSpeed < 40, `calm does not slam (max ${maxSpeed.toFixed(1)})`);
    const row = machineDiagnostics(host);
    assert.ok(row, 'the machine still reports its schedule');
    assert.equal(row.phase, 'calm', 'the diagnostics clock agrees with the physics');
  } finally {
    restore();
  }
});
