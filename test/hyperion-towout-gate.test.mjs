// PR-expansion 956 — Hyperion Cut joins the yard tow-out's premise.
//
// The Hyperion yard winch is a real authored kill machine (environmentalMachinery) but the
// 346 tow-out never reached it: the trigger gated to three machine sectors and only ran the
// civilian_core zone type, while Hyperion's anchor zone is a mining_belt. This pins the two
// new gate entries, proves the winch resolves as the bound machine through the encounter's
// own fire path (live anchor = the belt's real zone anchor, the schedule's own coordinate
// space), and keeps the no-machine abort clean everywhere else — the belt sectors with no
// authored jaw still get no offer.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ENCOUNTER_MODULES } from '../src/data/encounters/index.generated.js';
import {
  ALL_KILL_MACHINE_BY_ID,
  HYPERION_YARD_WINCH,
  killMachineFieldCenter,
  killMachinesForSector,
  pointInsideKillMachine,
} from '../src/data/environmentalMachinery.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const HYPERION = 'sector_hyperion_cut';
const MACHINE_REACH_WU = 1500; // the encounter's own constant (346-yard-towout.js)

const mod = ENCOUNTER_MODULES.find((m) => m.trigger.id === 'yard_towout');
const hyperionBelt = SECTOR_ZONES[HYPERION].find((zone) => zone.id === 'zone_hyperion_belt');
const beltAnchor = sectorLocalToGlobalForSector(hyperionBelt.center, HYPERION);

// Minimal director driver, same live-entity semantics as the b7 set-piece harness:
// role-filtered entsOf, dead hulls excluded, done-phase resolve/abort.
function makeDriver() {
  const d = {
    t: 1000,
    nextId: 1,
    ents: new Map(),
    calls: { says: [], grants: [], reps: [], resolutions: [], aborts: [], despawns: [], wrecks: [] },
    now() { return d.t; },
    setNow(t) { d.t = t; },
    spawnShips(live, ships) {
      const ids = [];
      for (const sh of ships || []) {
        const id = d.nextId++;
        live.ids.push(id);
        live.roles[id] = sh.role || 'squad';
        d.ents.set(id, {
          id,
          liveId: live.id,
          team: sh.team,
          pos: { ...(sh.pos || { x: 0, z: 0 }) },
          alive: true,
          archetype: sh.archetype,
          data: { ai: { encounterRole: live.roles[id] } },
        });
        ids.push(id);
      }
      return ids;
    },
    entsOf(live, role) {
      const out = [];
      for (const id of live.ids) {
        if (role && live.roles[id] !== role) continue;
        const e = d.ents.get(id);
        if (e && e.alive !== false) out.push(e);
      }
      return out;
    },
    aliveCount(live, role) { return d.entsOf(live, role).length; },
    despawnAll(live, afterS, role) {
      d.calls.despawns.push({ afterS, role: role || null });
    },
    say(live, channel, bark) { d.calls.says.push({ channel, bark }); },
    grant(amount, reason) { d.calls.grants.push({ amount, reason }); },
    rep(factionId, delta, reason) { d.calls.reps.push({ factionId, delta, reason }); },
    resolve(live, outcome, o) {
      if (live.phase === 'done') return;
      live.phase = 'done';
      live.outcome = outcome;
      d.calls.resolutions.push({ outcome, speak: !!(o && o.speak) });
    },
    abort(live, reason) {
      if (live.phase === 'done') return;
      live.phase = 'done';
      live.outcome = `aborted:${reason}`;
      d.calls.aborts.push(reason);
    },
    spawnWreck(live, opts) {
      const ent = {
        id: d.nextId++, type: 'wreck', alive: true,
        pos: { ...(opts && opts.pos ? opts.pos : { x: 0, z: 0 }) },
        data: {
          salvagePool: (opts && opts.pool) || { cmdty_scrap_metal: 2 },
          scanLabel: (opts && opts.scanLabel) || 'Wreck Debris',
          storyPropKind: (opts && opts.storyPropKind) || null,
        },
      };
      d.ents.set(ent.id, ent);
      d.calls.wrecks.push(ent);
      return ent;
    },
  };
  return d;
}

function planShips() {
  const pred = mod.default.predation;
  return [
    { archetype: 'mule_trader', team: 2, pos: { x: 0, z: 0 }, role: pred.carrierRole },
    { archetype: 'mule_trader', team: 2, pos: { x: 60, z: 40 }, role: pred.raiderRole },
  ];
}

function fireAt(sectorId, anchor) {
  const d = makeDriver();
  const live = {
    id: 'yard_towout', shapeId: 'yard_towout', ids: [], roles: {},
    plan: { ships: planShips(), factionId: 'faction_mts' },
    sectorId,
    anchor: anchor ? { ...anchor } : null,
    data: {}, phase: null, deadlineAt: 0,
  };
  mod.runtime.fire(d, live, {});
  return { d, live };
}

test('the Hyperion gate now admits the tow-out: winch in census, belt zone, sector id', () => {
  assert.equal(killMachinesForSector(HYPERION).includes(HYPERION_YARD_WINCH), true,
    'the winch is the Hyperion machine census');
  assert.equal(ALL_KILL_MACHINE_BY_ID.hyperion_yard_winch, HYPERION_YARD_WINCH);
  assert.ok(mod.trigger.gates.sectorIds.includes(HYPERION), 'the sector gate admits Hyperion');
  assert.ok(mod.trigger.zoneTypes.includes('mining_belt'), 'the zone gate admits the belt');
  assert.equal(hyperionBelt.type, 'mining_belt', 'the Hyperion anchor zone is the belt');
  assert.ok(mod.trigger.zoneTypes.includes('civilian_core'), 'the starter core stays reachable');

  // The belt anchor genuinely reaches the winch — the premise exists on measured geometry,
  // not on the gate alone. ~949 WU, well inside the encounter's 1500 WU reach.
  const d = Math.hypot(
    beltAnchor.x - HYPERION_YARD_WINCH.globalPos.x,
    beltAnchor.z - HYPERION_YARD_WINCH.globalPos.z,
  );
  assert.ok(d <= MACHINE_REACH_WU, `the belt anchor reaches the winch (${d.toFixed(1)} WU)`);
});

test('seed 4242 equivalent: firing at the Hyperion belt binds the yard winch, not an abort', () => {
  const { d, live } = fireAt(HYPERION, beltAnchor);
  assert.equal(live.phase, 'tow', 'the offer opens at the belt anchor');
  assert.equal(live.data.towout.machineId, 'hyperion_yard_winch',
    'the bound machine is the authored winch by stable id');
  const machine = ALL_KILL_MACHINE_BY_ID[live.data.towout.machineId];
  assert.equal(machine, HYPERION_YARD_WINCH);
  assert.equal(machine.sectorId, HYPERION);

  // The cast lands on the machine's own law: the hauler upstream of the intake, outside the
  // gather geometry, aimed at the anvil — the same binding the Helios cracker gets.
  const hauler = d.entsOf(live, 'hauler')[0];
  const skiff = d.entsOf(live, 'skiff')[0];
  assert.ok(hauler && skiff, 'both roster hulls spawned');
  assert.equal(hauler.disabled, true);
  assert.ok(!pointInsideKillMachine(machine, hauler.pos), 'the hauler spawns outside the intake');
  const spawnDist = Math.hypot(hauler.pos.x - machine.globalPos.x, hauler.pos.z - machine.globalPos.z);
  assert.ok(spawnDist < machine.hazardRadius + 80, 'and inside the clear bar, still in play');
  const anvil = machine.anvil.pos;
  const wantAim = Math.atan2(anvil.z - hauler.pos.z, anvil.x - hauler.pos.x);
  assert.ok(Math.abs(hauler.data.intent.aimAngle - wantAim) < 1e-6, 'the drift aims at the anvil');
  assert.equal(hauler.data.intent.fire, false);
  assert.equal(d.calls.aborts.length, 0, 'no abort on a real premise');

  // The winch's own cycle stays the only clock: the offer lives until the window expires,
  // then stands down honest — 'withdrawn', no crush asserted, no wreck minted.
  const center = killMachineFieldCenter(machine, machine.fields[0]);
  assert.ok(Number.isFinite(center.x) && Number.isFinite(center.z), 'the intake field resolves');
  d.setNow(live.deadlineAt + 1);
  mod.runtime.tick(d, live, {}, d.now());
  assert.equal(d.calls.resolutions.at(-1).outcome, 'withdrawn');
  assert.equal(d.calls.wrecks.length, 0);
});

test('the no-machine abort stays clean where no yard jaw exists', () => {
  // A machineless sector id.
  {
    const { d, live } = fireAt('sector_nowhere', { x: 0, z: 0 });
    assert.equal(live.outcome, 'aborted:no_machine');
    assert.deepEqual(d.calls.aborts, ['no_machine']);
    assert.equal(live.ids.length, 0, 'no cast spawned before the premise check');
  }
  // A real frontier belt sector with authored zones but no kill machine: the same honest
  // abort — the new zone gate only ever admits sectors whose machine is truly in reach.
  {
    const anchor = sectorLocalToGlobalForSector(
      SECTOR_ZONES.sector_eris_margin[0].center, 'sector_eris_margin',
    );
    const { d, live } = fireAt('sector_eris_margin', anchor);
    assert.equal(live.outcome, 'aborted:no_machine');
    assert.deepEqual(d.calls.aborts, ['no_machine']);
    assert.equal(live.ids.length, 0);
    assert.equal(killMachinesForSector('sector_eris_margin').length, 0);
  }
  // Even in a machine sector, an anchor out of reach aborts — reach is measured, not assumed.
  // (The winch sits ~949 WU from the belt anchor; clear it by more than the reach plus the
  // winch's own offset.)
  {
    const far = { x: beltAnchor.x + MACHINE_REACH_WU * 3, z: beltAnchor.z };
    const { d, live } = fireAt(HYPERION, far);
    assert.equal(live.outcome, 'aborted:no_machine');
    assert.deepEqual(d.calls.aborts, ['no_machine']);
  }
});
