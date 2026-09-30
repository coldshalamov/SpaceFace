// B7 — three civilian set pieces: 346 yard tow-out, 347 archive dive, 348 liner
// toll run. Pins the catalog contract (order, trigger mirror, composition that
// actually plans ships, name-only role customization, documented cast) and every
// runtime resolution branch on a stub driver that mirrors the director's
// live-entity semantics: role-filtered entsOf/aliveCount, dead hulls excluded,
// per-role despawnAll, done-phase resolve/abort.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENCOUNTER_MODULES, ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import { barkText } from '../src/data/encounters.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import {
  ALL_KILL_MACHINE_BY_ID,
  killMachineFieldCenter,
  pointInsideKillMachine,
} from '../src/data/environmentalMachinery.js';

const ENEMY_IDS = new Set(ENEMY_TYPES.map((e) => e.id));

const EXPECTED = {
  yard_towout: {
    order: 346,
    deck: 'civilian',
    // Self-registered runtime dispatches by shapeId; the schedule label is the
    // trigger's own 'selfRegistered' marker (module comment, 346-yard-towout.js).
    script: 'selfRegistered',
    zoneTypes: ['civilian_core'],
    verbs: ['latch', 'tow'],
    signal: 'yard_crusher_clock',
  },
  archive_dive: {
    order: 347,
    deck: 'civilian',
    // Self-registered runtime (same shift as 346; schedule label is the trigger marker).
    script: 'selfRegistered',
    zoneTypes: ['derelict_field'],
    verbs: ['scan', 'salvage'],
    signal: 'archive_core_ping',
  },
  liner_toll_run: {
    order: 348,
    deck: 'civilian',
    script: 'convoy',
    zoneTypes: ['trade_lane'],
    verbs: ['escort', 'fight', 'outrun'],
    signal: 'liner_gate_line',
  },
};

// Minimal director driver: spawn/role/resolve semantics only. Motion, combat,
// towing, and scanning are played by mutating the stub ents between ticks.
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
        const role = sh.role || 'squad';
        live.ids.push(id);
        live.roles[id] = role;
        d.ents.set(id, {
          id,
          liveId: live.id,
          team: sh.team,
          pos: { ...(sh.pos || { x: 0, z: 0 }) },
          alive: true,
          archetype: sh.archetype,
          data: { ai: { encounterRole: role } },
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
      let count = 0;
      for (const e of d.entsOf(live, role)) {
        e.data.despawnAt = d.t + afterS;
        count++;
      }
      d.calls.despawns.push({ afterS, role: role || null, count });
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
      const id = d.nextId++;
      const pos = opts && opts.pos ? { ...opts.pos } : { x: 0, z: 0 };
      const ent = {
        id,
        type: 'wreck',
        alive: true,
        pos,
        data: {
          salvagePool: (opts && opts.pool) || { cmdty_scrap_metal: 2 },
          scanLabel: (opts && opts.scanLabel) || 'Wreck Debris',
          storyPropKind: (opts && opts.storyPropKind) || null,
        },
      };
      d.ents.set(id, ent);
      d.calls.wrecks.push(ent);
      return ent;
    },
  };
  return d;
}

function makeLive(id, planShips, factionId = 'faction_scn', sectorId = null) {
  return {
    id, shapeId: id, ids: [], roles: {},
    plan: { ships: planShips, factionId },
    sectorId,
    anchor: sectorId === 'sector_helios_prime' ? { x: 400, z: 0 } : null,
    data: {}, phase: null, deadlineAt: 0,
  };
}

// Plan ships for the stub: roles come from the module's own predation role
// names, exactly as the planner stamps them. If the runtime ever addressed a
// different role string, the no_budget guard below would trip and fail loudly.
function planShipsFor(mod, carrier, raiders) {
  const pred = mod.default.predation;
  return [
    { ...carrier, role: pred.carrierRole },
    ...raiders.map((r) => ({ ...r, role: pred.raiderRole })),
  ];
}

test('B7: catalog carries the three set pieces with honest composition and roles', () => {
  const orders = ENCOUNTER_MODULES.filter((m) => EXPECTED[m.trigger.id]).map((m) => m.encounterOrder);
  assert.deepEqual(orders.sort((a, b) => a - b), [346, 347, 348]);
  for (const [id, exp] of Object.entries(EXPECTED)) {
    const enc = ENCOUNTERS[id];
    assert.ok(enc, `${id} is in the catalog`);
    assert.equal(enc.id, id);
    const mod = ENCOUNTER_MODULES.find((m) => m.trigger.id === id);
    assert.equal(mod.encounterOrder, exp.order);
    assert.equal(enc.deck, exp.deck);
    assert.equal(enc.script, exp.script);
    assert.deepEqual(enc.zoneTypes, exp.zoneTypes);
    assert.deepEqual(enc.verbs, exp.verbs);
    assert.equal(enc.scoutApproach.signal, exp.signal);
    assert.ok(enc.scoutApproach.rangeWu > 0, `${id} scout range`);
    assert.ok(enc.scoutApproach.resolves, `${id} scout resolution`);
    // Composition the planner turns into ships: civilian + squad blocks with
    // archetypes and sizes, and name-only role customization (no `enabled`, so
    // plan.predation stays null — no custody, no engagement authority).
    for (const block of [enc.civilian, enc.squad]) {
      assert.ok(block && block.archetypes.length > 0, `${id} block archetypes`);
      assert.ok(block.size[1] >= 1, `${id} block size`);
      for (const arch of block.archetypes) assert.ok(ENEMY_IDS.has(arch), `${id} archetype ${arch} exists`);
    }
    assert.ok(enc.predation && enc.predation.enabled !== true, `${id} predation is name-only`);
    assert.ok(enc.predation.carrierRole, `${id} carrierRole`);
    assert.ok(enc.predation.raiderRole, `${id} raiderRole`);
    // The documented cast is the plan roles: carrier first, raider second.
    assert.deepEqual(
      enc.roster.map((r) => r.cast),
      [enc.predation.carrierRole, enc.predation.raiderRole],
      `${id} roster matches plan roles`,
    );
    for (const row of enc.roster) assert.ok(ENEMY_IDS.has(row.archetype), `${id} roster archetype ${row.archetype} exists`);
    assert.ok(mod.runtime && typeof mod.runtime.fire === 'function' && typeof mod.runtime.tick === 'function');
    // The alert line must exist: say() with an unknown id fails silent.
    assert.ok(barkText(enc.bark, {}, id), `${id} bark ${enc.bark} resolves to a line`);
  }
});

test('B7 yard_towout: machine law — towed, crushed, hauler_lost, withdrawn, no_machine, no_budget', async () => {
  const mod = ENCOUNTER_MODULES.find((m) => m.trigger.id === 'yard_towout');
  const ships = planShipsFor(mod,
    { archetype: 'mule_trader', team: 2, pos: { x: 0, z: 0 } },
    [{ archetype: 'mule_trader', team: 2, pos: { x: 60, z: 40 } }]);
  // The live anchor sits in zone_helios_core's yard: the nearest authored machine
  // within reach is the helios claim cracker. All danger/clear points below come
  // from the machinery module's own exported predicates — real law, real math.
  const machine = ALL_KILL_MACHINE_BY_ID.helios_claim_cracker;
  const field = machine.fields[0];
  const fire = (plan = ships, sectorId = 'sector_helios_prime') => {
    const d = makeDriver();
    const live = makeLive('yard_towout', plan.map((s) => ({ ...s, pos: { ...s.pos } })), 'faction_scn', sectorId);
    mod.runtime.fire(d, live, {});
    return { d, live };
  };
  {
    // Binding: the runtime names a real machine, places the hauler upstream of the
    // intake, and aims its failing drift at the machine's own anvil.
    const { d, live } = fire();
    assert.equal(live.phase, 'tow');
    assert.equal(live.approach.signal, mod.default.scoutApproach.signal);
    const tow = live.data.towout;
    assert.equal(ALL_KILL_MACHINE_BY_ID[tow.machineId], machine);
    assert.equal(tow.mouth, undefined, 'no private mouth point: the danger is the machine');
    const hauler = d.entsOf(live, 'hauler')[0];
    assert.equal(hauler.disabled, true);
    const spawnDist = Math.hypot(hauler.pos.x - machine.globalPos.x, hauler.pos.z - machine.globalPos.z);
    assert.ok(!pointInsideKillMachine(machine, hauler.pos), 'spawns outside the gather geometry');
    assert.ok(spawnDist < machine.hazardRadius + 80, 'spawns inside the clear bar, still in play');
    const anvil = machine.anvil.pos;
    const wantAim = Math.atan2(anvil.z - hauler.pos.z, anvil.x - hauler.pos.x);
    assert.ok(Math.abs(hauler.data.intent.aimAngle - wantAim) < 1e-6, 'drift aims at the anvil');
    assert.equal(hauler.data.intent.fire, false);
    // The machine never chases: its root is world-fixed across ticks.
    const root = { x: machine.globalPos.x, z: machine.globalPos.z };
    d.setNow(1010);
    mod.runtime.tick(d, live, {}, d.now());
    d.setNow(1020);
    mod.runtime.tick(d, live, {}, d.now());
    assert.equal(machine.globalPos.x, root.x);
    assert.equal(machine.globalPos.z, root.z);
    assert.equal(live.phase, 'tow', 'parked in the band, the offer stays open');
  }
  {
    // Towed: real danger first, then stable separation beyond the machine's own
    // hazard radius — two ticks of outward hold, once, reward once.
    // resolve() uses shape receipts raw (no fmt pass), so amounts are inlined.
    assert.ok(!/\{[a-zA-Z_]+\}/.test(mod.default.receipts.towed), 'shape receipts render raw — no {key} placeholders');
    const { d, live } = fire();
    const hauler = d.entsOf(live, 'hauler')[0];
    hauler.pos.x = killMachineFieldCenter(machine, field).x;
    hauler.pos.z = killMachineFieldCenter(machine, field).z;
    d.setNow(1010);
    mod.runtime.tick(d, live, {}, d.now());
    assert.equal(live.phase, 'tow', 'inside the jaw is not clear');
    hauler.pos.x = machine.globalPos.x + machine.hazardRadius + 80 + 1;
    hauler.pos.z = machine.globalPos.z;
    d.setNow(1020);
    mod.runtime.tick(d, live, {}, d.now());
    assert.equal(live.phase, 'tow', 'outward separation must hold');
    d.setNow(1030);
    mod.runtime.tick(d, live, {}, d.now());
    assert.equal(d.calls.resolutions.at(-1).outcome, 'towed');
    assert.equal(d.calls.grants.at(-1).amount, 300);
    assert.equal(d.calls.reps.at(-1).delta, 4);
    assert.deepEqual(d.calls.despawns.at(-1).role, 'skiff');
    assert.equal(d.entsOf(live, 'hauler').length, 1);
  }
  {
    // Crushed: the hull's last living position was inside the machine's geometry —
    // the machinery took it, and the leavings spawn where it actually died.
    const { d, live } = fire();
    const hauler = d.entsOf(live, 'hauler')[0];
    const center = killMachineFieldCenter(machine, field);
    hauler.pos.x = center.x;
    hauler.pos.z = center.z;
    d.setNow(1010);
    mod.runtime.tick(d, live, {}, d.now());
    hauler.alive = false;
    mod.runtime.tick(d, live, {}, d.now());
    assert.equal(d.calls.resolutions.at(-1).outcome, 'crushed');
    assert.equal(d.calls.resolutions.at(-1).speak, true);
    assert.equal(d.entsOf(live, 'hauler').length, 0);
    assert.equal(d.calls.wrecks.length, 1);
    assert.equal(d.calls.wrecks[0].pos.x, center.x);
    assert.equal(d.calls.wrecks[0].pos.z, center.z);
    assert.equal(d.calls.wrecks[0].data.scanLabel, 'Crusher leavings');
    assert.ok(d.calls.wrecks[0].data.salvagePool.cmdty_scrap_metal > 0);
    assert.deepEqual(d.calls.despawns.at(-1).role, 'skiff');
  }
  {
    // Lost elsewhere is not a crush: a hull that dies outside the geometry resolves
    // hauler_lost and mints no gift wreckage.
    const { d, live } = fire();
    d.entsOf(live, 'hauler')[0].alive = false;
    d.setNow(1010);
    mod.runtime.tick(d, live, {}, d.now());
    assert.equal(d.calls.resolutions.at(-1).outcome, 'hauler_lost');
    assert.equal(d.calls.wrecks.length, 0);
  }
  {
    // THE COUNTEREXAMPLE (SF-136): the offer expires with the hauler afloat and
    // untouched — the old private-clock code resolved 'crushed' and minted a wreck
    // for damage that never occurred. Machine law stands down instead.
    const { d, live } = fire();
    const hauler = d.entsOf(live, 'hauler')[0];
    d.setNow(live.deadlineAt + 1);
    mod.runtime.tick(d, live, {}, d.now());
    assert.equal(d.calls.resolutions.at(-1).outcome, 'withdrawn');
    assert.equal(d.calls.wrecks.length, 0, 'no damage asserted without contact');
    assert.equal(d.calls.grants.length, 0);
    assert.equal(d.entsOf(live, 'hauler').length, 1, 'the hauler is truthfully still afloat');
    assert.deepEqual(d.calls.despawns.at(-1).role, 'skiff');
  }
  {
    // The tow owns the hull: latching clears the failing autopilot's thrust so the
    // rope never fights the drive. A stranger's tether does not. (Axes are ship-local:
    // the drift is live on whichever axis the hull's facing puts it.)
    const { d, live } = fire();
    const hauler = d.entsOf(live, 'hauler')[0];
    const drifting = () => hauler.data.intent.moveZ !== 0 || hauler.data.intent.moveX !== 0;
    assert.ok(drifting(), 'the failing autopilot is live after fire');
    mod.runtime.event(d, live, {}, 'tetherAttached', { targetId: hauler.id + 999 });
    assert.ok(drifting(), 'wrong target leaves the drift alone');
    mod.runtime.event(d, live, {}, 'tetherAttached', { targetId: hauler.id });
    assert.equal(live.data.towout.latched, true);
    assert.equal(hauler.data.intent.moveZ, 0);
    assert.equal(hauler.data.intent.moveX, 0);
  }
  {
    // No premise, no offer: a live record with no reachable yard machine aborts.
    const { d, live } = fire(ships, 'sector_nowhere');
    assert.equal(live.outcome, 'aborted:no_machine');
    assert.deepEqual(d.calls.aborts, ['no_machine']);
  }
  {
    // A partial budget grant landing the hauler alone aborts: one hull is a
    // different encounter, and must not resolve 'towed' for a job never set.
    const { d, live } = fire(ships.slice(0, 1));
    assert.equal(live.outcome, 'aborted:no_budget');
    assert.deepEqual(d.calls.aborts, ['no_budget']);
  }
});

test('B7 archive_dive: recovered, stripped, core_lost, deadline, and no_budget branches', async () => {
  const mod = ENCOUNTER_MODULES.find((m) => m.trigger.id === 'archive_dive');
  const ships = planShipsFor(mod,
    { archetype: 'mule_trader', team: 2, pos: { x: 0, z: 0 } },
    [
      { archetype: 'reaver_pirate', team: 1, pos: { x: 400, z: 0 } },
      { archetype: 'reaver_pirate', team: 1, pos: { x: 420, z: 60 } },
    ]);
  const fire = (plan = ships) => {
    const d = makeDriver();
    const live = makeLive('archive_dive', plan.map((s) => ({ ...s, pos: { ...s.pos } })));
    mod.runtime.fire(d, live, {});
    return { d, live };
  };
  {
    const { d, live } = fire();
    assert.equal(live.phase, 'dive');
    assert.equal(live.approach.signal, mod.default.scoutApproach.signal);
    const core = d.entsOf(live, 'core')[0];
    assert.equal(core.data.scannable, true);
    // A pulse fired out of reach credits nothing; three in reach recover the core.
    mod.runtime.event(d, live, {}, 'scanPulse', { pos: { x: 5000, z: 0 } });
    assert.equal(core.data.scanProgress, 0);
    mod.runtime.event(d, live, {}, 'tetherAttached', { pos: { x: 0, z: 0 } });
    assert.equal(core.data.scanProgress, 0);
    for (let i = 0; i < 3; i++) {
      mod.runtime.event(d, live, {}, 'scanPulse', { pos: { x: 100, z: 0 } });
    }
    assert.equal(core.data.scanProgress, 1);
    d.setNow(1010);
    mod.runtime.tick(d, live, {}, d.now());
    assert.equal(d.calls.resolutions.at(-1).outcome, 'recovered');
    assert.equal(d.calls.grants.at(-1).amount, 250);
    assert.equal(d.calls.reps.at(-1).factionId, 'faction_archive');
    assert.deepEqual(d.calls.despawns.at(-1).role, 'scavenger');
  }
  {
    const { d, live } = fire();
    const core = d.entsOf(live, 'core')[0];
    const scav = d.entsOf(live, 'scavenger')[0];
    scav.pos.x = core.pos.x + 10;
    scav.pos.z = core.pos.z;
    d.setNow(1010);
    mod.runtime.tick(d, live, {}, d.now());
    assert.equal(d.calls.resolutions.at(-1).outcome, 'stripped');
    assert.equal(d.calls.resolutions.at(-1).speak, true);
    assert.equal(core.data.stripped, true);
    assert.deepEqual(core.data.salvagePool, {});
    assert.equal(d.entsOf(live, 'core').length, 1);
    assert.deepEqual(d.calls.despawns.at(-1).role, 'scavenger');
  }
  {
    const { d, live } = fire();
    d.entsOf(live, 'core')[0].alive = false;
    d.setNow(1010);
    mod.runtime.tick(d, live, {}, d.now());
    assert.equal(d.calls.resolutions.at(-1).outcome, 'core_lost');
  }
  {
    const { d, live } = fire();
    d.setNow(live.deadlineAt + 1);
    mod.runtime.tick(d, live, {}, d.now());
    assert.equal(d.calls.resolutions.at(-1).outcome, 'stripped');
    assert.equal(d.calls.resolutions.at(-1).speak, false);
    const leftover = d.entsOf(live, 'core')[0];
    assert.ok(leftover);
    assert.equal(leftover.data.stripped, true);
    assert.deepEqual(leftover.data.salvagePool, {});
    assert.deepEqual(d.calls.despawns.at(-1).role, 'scavenger');
  }
  {
    const { d, live } = fire(ships.slice(0, 1));
    assert.equal(live.outcome, 'aborted:no_budget');
  }
});

test('B7 liner_toll_run: escorted, ran, lost, delayed, and no_budget branches', async () => {
  const mod = ENCOUNTER_MODULES.find((m) => m.trigger.id === 'liner_toll_run');
  const ships = planShipsFor(mod,
    { archetype: 'mule_trader', team: 2, pos: { x: 0, z: 0 } },
    [
      { archetype: 'customs_cutter', team: 2, pos: { x: 700, z: -50 } },
      { archetype: 'customs_cutter', team: 2, pos: { x: 700, z: 50 } },
    ]);
  const fire = (plan = ships) => {
    const d = makeDriver();
    const live = makeLive('liner_toll_run', plan.map((s) => ({ ...s, pos: { ...s.pos } })));
    mod.runtime.fire(d, live, {});
    return { d, live };
  };
  {
    const { d, live } = fire();
    assert.equal(live.phase, 'escort');
    assert.equal(live.approach.signal, mod.default.scoutApproach.signal);
    const liner = d.entsOf(live, 'liner')[0];
    liner.pos.x = live.data.tollrun.exitX + 1;
    d.setNow(1010);
    mod.runtime.tick(d, live, {}, d.now());
    assert.equal(d.calls.resolutions.at(-1).outcome, 'escorted');
    assert.equal(d.calls.grants.at(-1).amount, 350);
    assert.deepEqual(d.calls.despawns.at(-1).role, 'cutter');
    assert.equal(d.entsOf(live, 'liner').length, 1);
  }
  {
    const { d, live } = fire();
    for (const e of d.entsOf(live, 'cutter')) e.alive = false;
    d.setNow(1010);
    mod.runtime.tick(d, live, {}, d.now());
    assert.equal(d.calls.resolutions.at(-1).outcome, 'ran');
    assert.ok(d.calls.reps.some((r) => r.delta < 0), 'breaking the picket costs rep');
    assert.equal(d.calls.reps.at(-1).factionId, 'faction_scn', 'rep hits the picket\'s faction');
  }
  {
    const { d, live } = fire();
    d.entsOf(live, 'liner')[0].alive = false;
    d.setNow(1010);
    mod.runtime.tick(d, live, {}, d.now());
    assert.equal(d.calls.resolutions.at(-1).outcome, 'lost');
  }
  {
    const { d, live } = fire();
    d.setNow(live.deadlineAt + 1);
    mod.runtime.tick(d, live, {}, d.now());
    assert.equal(d.calls.resolutions.at(-1).outcome, 'delayed');
  }
  {
    const { d, live } = fire(ships.slice(0, 1));
    assert.equal(live.outcome, 'aborted:no_budget');
  }
});
