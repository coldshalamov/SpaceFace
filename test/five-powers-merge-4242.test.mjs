// The five powers (owner 2026-10-22, src/systems/powerVerbs.js; build_map §33 row 493 + §34 row
// 550). Eight overlapping verbs became five on the number row — 1 PULL · 2 SHOVE · 3 PIN ·
// 4 BOMB · 5 RIG — each driving an owner that already existed through its old internal flag.
// This suite proves the merge end to end on seed 4242:
//   • real key codes produce exactly the internal flags each power owns;
//   • old names resolve to the power keys, and custom bindings saved under old names carry over
//     (keyboard and pad);
//   • BOMB throws the sticky charge whenever one is aboard; the cycle turns to a drift bomb;
//   • RIG picks the cone or the skim scoop by the planet system's own band test;
//   • PULL marks a hostile or a loose body it lands on with the gravity mark, never a civilian;
//   • the rail reads one socket per power from the real owners;
//   • retired arsenal leaves the adventure shop and tech tree, owned copies untouched.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { input, applyFlightKeyEvent, resolveActionCodes, DEFAULTS, TAUGHT_FLIGHT_ACTIONS } from '../src/systems/input.js';
import { GAMEPAD_DEFAULT_BINDINGS, resolveGamepadBindings } from '../src/systems/gamepad.js';
import {
  POWER_VERBS, POWER_VERB_ALIASES, bombUsesCharge, resolveRigTarget, savedCodesForPower,
} from '../src/systems/powerVerbs.js';
import { bombs } from '../src/systems/bombs.js';
import { BOMB_CHARGE_CHOICE, BOMB_DEFS, BOMB_STARTER_KIT } from '../src/data/bombs.js';
import { actions } from '../src/systems/actions.js';
import { fields } from '../src/systems/fields.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { GRAVITY_MARK_STATUS_ID } from '../src/data/combatDefs.js';
import { PLANET_REGION_RANK } from '../src/data/planets.js';
import { POWER_SLOT, RAIL_SLOTS, readRailModel, resolveSlotLabels } from '../src/ui/powerRail.js';
import { buildOrdnanceGroups } from '../src/ui/orrery/hudAdapter.js';
import { WEAPONS } from '../src/data/weapons.js';
import { TECH_NODES } from '../src/data/tech.js';
import { POWER_PAGES } from '../src/systems/mobile/catalog.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const SEED = 4242;
const settingsFor = (scheme, bindings = null) => ({ settings: { controls: { bindings }, gameplay: { controlScheme: scheme } } });

test('the number row is the five powers in every scheme; the Line keeps Space/F only', () => {
  for (const scheme of ['pilot', 'classic', 'helm-assist']) {
    const st = settingsFor(scheme);
    assert.deepEqual(resolveActionCodes(st, 'pull'), ['Digit1'], `${scheme} pull`);
    assert.deepEqual(resolveActionCodes(st, 'shove'), ['Digit2', 'KeyR'], `${scheme} shove`);
    assert.deepEqual(resolveActionCodes(st, 'pin'), ['Digit3'], `${scheme} pin`);
    assert.equal(resolveActionCodes(st, 'bomb')[0], 'Digit4', `${scheme} bomb seat`);
    assert.deepEqual(resolveActionCodes(st, 'rig'), ['Digit5'], `${scheme} rig`);
    assert.deepEqual(resolveActionCodes(st, 'tether'), ['Space', 'KeyF'], `${scheme} line has no digit`);
    assert.deepEqual(resolveActionCodes(st, 'cycleBomb'), ['Comma']);
  }
  // The bomb keeps the old charge-throw letter of each scheme.
  assert.deepEqual(resolveActionCodes(settingsFor('pilot'), 'bomb'), ['Digit4', 'KeyY']);
  assert.deepEqual(resolveActionCodes(settingsFor('helm-assist'), 'bomb'), ['Digit4', 'KeyQ']);
  // No digit 6–9 seat is left behind, and no two flight actions share a number-row digit.
  for (const [name, table] of Object.entries(DEFAULTS.SCHEMES)) {
    const seen = new Map();
    for (const [action, codes] of Object.entries(table)) {
      for (const code of codes || []) {
        if (!/^Digit[1-9]$/.test(code)) continue;
        assert.ok(!seen.has(code), `${name}: ${code} is both ${seen.get(code)} and ${action}`);
        seen.set(code, action);
      }
    }
    assert.deepEqual([...seen.keys()].sort(), ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'], `${name} digit seats`);
  }
  for (const power of POWER_VERBS) assert.ok(TAUGHT_FLIGHT_ACTIONS.includes(power), `${power} is taught`);
});

test('old names resolve to the power keys; saved custom codes under old names carry over', () => {
  const st = settingsFor('pilot');
  for (const [legacy, power] of Object.entries(POWER_VERB_ALIASES)) {
    assert.deepEqual(resolveActionCodes(st, legacy), resolveActionCodes(st, power), `${legacy} → ${power}`);
  }
  assert.deepEqual(resolveActionCodes(settingsFor('pilot', { deployWell: ['KeyZ'] }), 'pull'), ['KeyZ']);
  assert.deepEqual(resolveActionCodes(settingsFor('pilot', { chargeThrow: ['KeyT'] }), 'bomb'), ['KeyT']);
  assert.deepEqual(resolveActionCodes(settingsFor('pilot', { pull: ['KeyP'], deployWell: ['KeyZ'] }), 'pull'), ['KeyP'],
    'the power\'s own saved entry wins over an old one');
  assert.equal(savedCodesForPower(null, 'pull'), undefined);
  // Pad: defaults and an old remap.
  assert.deepEqual([...GAMEPAD_DEFAULT_BINDINGS.shove], ['alt', 'dDown']);
  assert.deepEqual([...GAMEPAD_DEFAULT_BINDINGS.bomb], ['dRight']);
  assert.deepEqual([...GAMEPAD_DEFAULT_BINDINGS.pull], ['l1+dLeft']);
  assert.deepEqual([...GAMEPAD_DEFAULT_BINDINGS.pin], ['l1+dDown']);
  assert.deepEqual([...GAMEPAD_DEFAULT_BINDINGS.rig], ['l1+dRight']);
  for (const legacy of Object.keys(POWER_VERB_ALIASES)) assert.equal(GAMEPAD_DEFAULT_BINDINGS[legacy], undefined, `${legacy} has no pad seat of its own`);
  // RB + D-Pad Left is a chord the merge freed (the old charge throw), so the share rules accept it.
  const pad = resolveGamepadBindings({ controls: { gamepad: { bindings: { deployWell: ['r1+dLeft'] } } } });
  assert.deepEqual(pad.pull, ['r1+dLeft'], 'a pad remap saved under the old Well name drives Pull');
});

test('RIG picks the cone in open space and the scoop inside a planet band; an open rig folds first', () => {
  assert.equal(resolveRigTarget({}), 'cone');
  const band = { planet: { active: true, player: { regionRank: PLANET_REGION_RANK.skim, collectorOn: false } } };
  assert.equal(resolveRigTarget(band), 'skim');
  const approach = { planet: { active: true, player: { regionRank: PLANET_REGION_RANK.sling, collectorOn: false } } };
  assert.equal(resolveRigTarget(approach), 'cone', 'outside the skim band the scoop would harvest nothing');
  assert.equal(resolveRigTarget({ ...band, fields: { coneActive: true } }), 'cone', 'an open cone folds before the scoop opens');
  assert.equal(resolveRigTarget({ planet: { active: true, player: { regionRank: 0, collectorOn: true } } }), 'skim', 'an open scoop closes');
});

test('BOMB throws the sticky charge whenever one is aboard, unless the cycle chose a drift bomb', () => {
  const carrying = (n, bay) => ({ player: { cargo: { items: { cmdty_impulse_charge: n } } }, bombs: bay });
  assert.equal(bombUsesCharge(carrying(0, { selectedId: 'bomb_frag' })), false, 'no charge aboard: the rack');
  assert.equal(bombUsesCharge(carrying(3, { selectedId: 'bomb_frag' })), true, 'the charge leads');
  assert.equal(bombUsesCharge(carrying(3, { selectedId: 'bomb_frag', bombChosen: true })), false, 'the cycle chose a bomb');
  assert.equal(bombUsesCharge(carrying(3, { selectedId: null, bombChosen: true })), true, 'a dry rack falls back to the charge');
});

function flightSim(systems) {
  const sim = createSimulation({ seed: SEED, bus: createBus(), systems });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({ ...makeShipEntitySpec('ship_kestrel', { pos: { x: 0, z: 0 }, rot: 0 }), isPlayer: true });
  state.playerId = player.id;
  return { sim, state, player };
}

test('real key codes drive exactly the internal flags each power owns', () => {
  const { sim, state } = flightSim([input]);
  const host = sim.registry.get('input');
  const press = (code) => {
    applyFlightKeyEvent(host, { code, pressed: true });
    sim.step();
    const a = { ...state.input.actions };
    applyFlightKeyEvent(host, { code, pressed: false });
    sim.step();
    return a;
  };
  const FLAGS = ['deployWell', 'deployRepulsor', 'chargeDetonate', 'deployMassSeed', 'dropBomb', 'chargeThrow', 'toggleClearingCone', 'toggleSkimCollector', 'cycleBomb'];
  const on = (a) => FLAGS.filter((f) => a[f] === true).sort();
  assert.deepEqual(on(press('Digit1')), ['deployWell']);
  assert.deepEqual(on(press('Digit2')), ['chargeDetonate', 'deployRepulsor']);
  assert.deepEqual(on(press('KeyR')), ['chargeDetonate', 'deployRepulsor']);
  assert.deepEqual(on(press('Digit3')), ['deployMassSeed']);
  state.bombs = { selectedId: 'bomb_frag' };
  state.player.cargo = { items: { cmdty_impulse_charge: 0 } };
  assert.deepEqual(on(press('Digit4')), ['dropBomb'], 'no charge aboard: the drift bomb');
  state.player.cargo.items.cmdty_impulse_charge = 3;
  assert.deepEqual(on(press('Digit4')), ['chargeThrow'], 'a charge aboard leads');
  state.bombs.bombChosen = true;
  assert.deepEqual(on(press('KeyY')), ['dropBomb'], 'the cycle chose the drift bomb');
  assert.deepEqual(on(press('Digit5')), ['toggleClearingCone']);
  state.planet = { active: true, player: { regionRank: PLANET_REGION_RANK.skim, collectorOn: false } };
  assert.deepEqual(on(press('Digit5')), ['toggleSkimCollector']);
  assert.deepEqual(on(press('Comma')), ['cycleBomb']);
  assert.deepEqual(on(press('Digit6')), [], 'the old Repulsor digit is free');
  assert.deepEqual(on(press('Digit9')), [], 'the old bomb digit is free');
});

test('the ordnance cycle walks the sticky charge, then the loaded rack cells, and back', () => {
  const { state } = flightSim([bombs]);
  bombs.bus = { emit() {} };
  bombs.state = state;
  state.player.cargo = { items: { cmdty_impulse_charge: 2 } };
  state.bombs = undefined;
  // A fresh bay is the starter kit: frag + goo (the concussion drum is the SHOVE power's job now).
  assert.deepEqual([...BOMB_STARTER_KIT], ['bomb_frag', 'bomb_goo']);
  // With a charge aboard the bay starts on the charge; the cycle turns to frag, goo, then back.
  const seen = [];
  const chosen = [];
  for (let i = 0; i < 4; i++) {
    seen.push(bombs.cycleSelection(state));
    chosen.push(state.bombs.bombChosen === true);
  }
  assert.deepEqual(seen, ['bomb_frag', 'bomb_goo', BOMB_CHARGE_CHOICE, 'bomb_frag']);
  assert.deepEqual(chosen, [true, true, false, true], 'the flag lives only while a bomb is chosen over the charge');
  assert.ok(state.bombs.rack.cells.every((c) => !c || c.id !== BOMB_CHARGE_CHOICE), 'the charge is never a rack cell');
  // With no charge aboard the choice disappears, the cycle skips it, and no flag is written.
  state.player.cargo.items.cmdty_impulse_charge = 0;
  assert.equal(bombs.cycleSelection(state), 'bomb_goo');
  assert.equal(state.bombs.bombChosen, undefined);
});

function ship(id, x, z, team, data = {}) {
  return {
    id, type: 'ship', alive: true, team, collides: true, radius: 10, mass: 40,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 200, hullMax: 200, shield: 0, shieldMax: 0,
    armorHp: 0, armorMax: 0, cap: 100, capMax: 100, flags: {},
    physicsBody: { schemaVersion: 1, radius: 10, mass: 40, inertiaY: 160, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship', proportions: { length: 1.6, halfWidth: 0.5, height: 0.4 }, ...data },
  };
}

function pullOnLockedTarget(targetSpec) {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    const sim = createSimulation({ seed: SEED, bus: createBus(), systems: [actions, fields] });
    const { state } = sim;
    state.mode = 'flight';
    state.input.actions = {};
    const player = sim.spawn(ship(1, 0, 0, 0));
    const target = sim.spawn(targetSpec);
    state.playerId = player.id;
    state.player.targetId = target.id;
    state.input.aimWorld = { x: 300, z: 0 };
    state.input.actions.deployWell = true;
    for (let i = 0; i < 4; i++) sim.step();
    const runtime = state.combat && state.combat.entities && state.combat.entities[String(target.id)];
    const pending = (runtime && runtime.pendingStatuses) || [];
    return !!(runtime && (runtime.statuses?.[GRAVITY_MARK_STATUS_ID] || pending.some((p) => p && p.id === GRAVITY_MARK_STATUS_ID)));
  } finally {
    FIELD_FLAGS.enabled = previous;
  }
}

test('PULL marks a hostile hull it lands on with the gravity mark, and never a civilian', () => {
  assert.equal(pullOnLockedTarget(ship(2, 300, 60, 1, { encounter: true })), true, 'a hostile in the footprint is marked');
  assert.equal(pullOnLockedTarget(ship(3, 300, 60, 0)), false, 'a civilian is left alone');
  assert.equal(pullOnLockedTarget(ship(4, 900, 0, 1, { encounter: true })), false, 'outside the footprint nothing is marked');
});

test('the rail shows one socket per power, read from the real owners', () => {
  assert.deepEqual(RAIL_SLOTS.map((s) => s.action), ['travelBurn', 'pull', 'shove', 'pin', 'bomb', 'rig', 'tether']);
  const labels = resolveSlotLabels({ pull: ['Digit1'], shove: ['Digit2', 'KeyR'], pin: ['Digit3'], bomb: ['Digit4', 'KeyY'], rig: ['Digit5'], tether: ['Space', 'KeyF'], travelBurn: ['NumLock', 'F8'] });
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((i) => labels[i]), ['1', '2', '3', '4', '5', 'Space']);
  const groups = buildOrdnanceGroups({ pull: ['Digit1'], shove: ['Digit2'], pin: ['Digit3'], bomb: ['Digit4'], rig: ['Digit5'], tether: ['Space'] });
  assert.deepEqual(groups.filter((g) => g.power).map((g) => `${g.name} ${g.slots.map((s) => s.key).join(' ')}`),
    ['Pull 1', 'Shove 2', 'Pin 3', 'Bomb 4', 'Rig 5', 'Line Space'], 'each power prints by name with its key');
  const state = {
    simTime: 10, playerId: 1, mode: 'flight', entities: new Map([[1, { id: 1, alive: true, data: {} }]]), entityList: [],
    fields: { cooldowns: { well: 14 } },
    player: { cargo: { items: { cmdty_impulse_charge: 2 } }, massSeed: {} },
    bombs: { selectedId: 'bomb_frag', rack: { sockets: 2, cells: [{ id: 'bomb_frag', count: 2 }, null] }, cooldowns: {} },
  };
  const rail = readRailModel(state, 10);
  assert.equal(rail[POWER_SLOT.pull].state, 'cooling', 'PULL reads the well cooldown');
  assert.equal(rail[POWER_SLOT.shove].state, 'ready');
  assert.equal(rail[POWER_SLOT.bomb].charge, true, 'BOMB shows the sticky charge it will throw');
  const chose = readRailModel({ ...state, bombs: { ...state.bombs, bombChosen: true } }, 10)[POWER_SLOT.bomb];
  assert.equal(chose.charge, undefined, 'after the cycle chose a drift bomb, BOMB shows the bay');
  assert.match(rail[POWER_SLOT.bomb].name, /Charge ×2/);
  assert.match(rail[POWER_SLOT.rig].why, /clearing cone/i);
  assert.equal(rail[POWER_SLOT.line].state, 'ready');
});

test('the phone deck carries the five powers on one page', () => {
  const page = POWER_PAGES.find((p) => p.name === 'Powers');
  assert.ok(page, 'a Powers page exists');
  assert.deepEqual(page.powers.map((p) => p.id), ['pull', 'shove', 'pin', 'bomb', 'cycleBomb', 'rig', 'gyreSnare'],
    'the five powers, the ordnance cycle, and the Gyre Snare kept on the first page');
  const all = POWER_PAGES.flatMap((p) => p.powers.map((x) => x.id));
  for (const legacy of Object.keys(POWER_VERB_ALIASES)) assert.ok(!all.includes(legacy), `${legacy} left the deck`);
});

test('retired arsenal leaves the adventure shop and tech tree; its job has a home; owned copies stay defined', () => {
  const RETIRED = {
    wpn_gravity_marker_s: 'pull', wpn_gravity_well_m: 'pull', wpn_momentum_sink_s: 'line',
    wpn_inertial_shunt_s: 'mod_ram_plate', wpn_sticky_detonator: 'bomb', tool_viscosity_field: 'bomb', wpn_conductive_primer: 'mod_relay_arc',
  };
  for (const [id, home] of Object.entries(RETIRED)) {
    const def = WEAPONS.find((w) => w.id === id);
    assert.ok(def, `${id} still exists for owned copies and NPC kits`);
    assert.equal(def.retiredInto, home, `${id} names where its job went`);
    for (const node of TECH_NODES) {
      assert.ok(!(node.unlocks?.modules || []).includes(id), `${node.id} no longer advertises ${id}`);
    }
  }
  assert.equal(BOMB_DEFS.bomb_concussion.retiredInto, 'shove');
  assert.ok(!BOMB_STARTER_KIT.includes('bomb_concussion'));
  // The kept arsenal is untouched.
  // The approved table keeps the vector mine (a placed trap, the mine family) on sale and researchable.
  assert.ok(TECH_NODES.find((n) => n.id === 'tech_guided_ordnance').unlocks.modules.includes('wpn_vector_mine_m'));
  for (const id of ['wpn_vector_mine_m', 'wpn_concussion_cannon_s', 'wpn_mass_driver', 'wpn_thermal_cooker', 'wpn_emp_disruptor_m', 'tool_grav_anchor', 'tool_polarity_inverter', 'tool_seismic_gong', 'tool_quantum_sympathy', 'tool_hardlight_prism', 'tool_thruster_hijacker']) {
    assert.equal(WEAPONS.find((w) => w.id === id)?.retiredInto, undefined, `${id} stays on sale`);
  }
});

test('resetting or rebinding a power row clears the keys saved under its old names', async () => {
  const { settingsScreen } = await import('../src/ui/screens/settings.js');
  const { PILOT_BINDINGS } = await import('../src/systems/input.js');
  const state = { settings: { gameplay: { controlScheme: 'pilot' }, controls: {
    bindings: { deployWell: ['KeyZ'], chargeThrow: ['KeyT'] },
    gamepad: { enabled: true, deadzone: 0.12, invertY: false, bindings: { deployWell: ['r1+dLeft'] } },
  } } };
  const ctx = { state, bus: { emit() {} } };
  const host = Object.create(settingsScreen);
  host._render = () => {};
  host._set = (c, section, key, value) => { c.state.settings[section][key] = value; };
  assert.deepEqual(resolveActionCodes(state, 'pull'), ['KeyZ'], 'the old remap drives Pull before the reset');
  host._commitBind(ctx, 'pull', null, {}, PILOT_BINDINGS);
  assert.equal(state.settings.controls.bindings.deployWell, undefined, 'the reset clears the old name too');
  assert.deepEqual(resolveActionCodes(state, 'pull'), ['Digit1'], 'reset restores the shipped key, not the old remap');
  host._commitBind(ctx, 'bomb', 'KeyB', {}, PILOT_BINDINGS);
  assert.equal(state.settings.controls.bindings.chargeThrow, undefined, 'a rebind retires the old name');
  assert.deepEqual(resolveActionCodes(state, 'bomb'), ['KeyB', 'KeyY']);
  host._commitPadBind(ctx, 'pull', null);
  assert.equal(state.settings.controls.gamepad.bindings, null, 'the pad reset clears the old Well remap');
  assert.deepEqual(resolveGamepadBindings(state.settings).pull, ['l1+dLeft']);
});

test('the field power roster points each verb at the rail socket of the power that fires it', async () => {
  const { POWER_ROSTER } = await import('../src/data/fields.js');
  const owner = { seed: 'pin', well: 'pull', repulsor: 'shove', cone: 'rig', skim: 'rig' };
  for (const row of POWER_ROSTER) {
    assert.equal(row.railSlot, POWER_SLOT[owner[row.id]], `${row.id} sits on ${owner[row.id]}`);
    assert.equal(POWER_VERB_ALIASES[row.action], owner[row.id], `${row.action} is an alias of ${owner[row.id]}`);
  }
});
