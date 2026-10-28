// Packet 01 — the arsenal presentation projection. It resolves each verb's EFFECTIVE action from the
// authoritative weapon / fitting / binding / mode / state, reading every figure from the owner that
// defines it. These tests pin: the numbers are reads, the labels say what the NEXT press does, the
// projection agrees with the real input owner, an unbound action prints no phantom key, and the static
// part is cached on the fitting / mode / binding signature.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { input, applyFlightKeyEvent } from '../src/systems/input.js';
import { cloak } from '../src/systems/cloak.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import {
  ARSENAL_VERB_ORDER, armedOrdnanceCounts, combinationExample, createArsenalPresentation, describeCompiledChanges,
  readArsenalBindings, readCloakState, resolveArsenalPresentation, resolveBombAction, resolveFittedWeapons,
} from '../src/data/arsenalPresentation.js';
import { FIELD_DEFS } from '../src/data/fields.js';
import { GRAVITY_MARK_FIELD_COUPLING } from '../src/data/combatDefs.js';
import { MASS_SEED_DEF } from '../src/data/massSeed.js';
import { GYRE_SNARE } from '../src/data/gyreSnare.js';
import { BOMB_DEFS } from '../src/data/bombs.js';
import { IMPULSE_CHARGES } from '../src/data/impulseCharges.js';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { PLANET_REGION_RANK } from '../src/data/planets.js';
import { SWARM_CALLIN_CATALOG, SWARM_CALLIN_RECORD_KIND } from '../src/data/swarmDraft.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';

const CLOAK_FEATURES = { massline2: { enabled: true, cloak: true } };

function makeState(extra = {}) {
  const hull = { id: 1, alive: true, type: 'ship', cap: 60, capMax: 100, pos: { x: 0, z: 0 }, flags: {}, data: {} };
  const state = {
    mode: 'flight', playerId: 1, simTime: 50, tick: 3000,
    entities: new Map([[1, hull]]), entityList: [hull], settings: {},
    runtime: { features: CLOAK_FEATURES },
    player: { cargo: { items: {} }, activeShipIndex: 0, ownedShips: [{ fittings: [] }], massSeed: {} },
    fields: {}, bombs: {}, massline2: {},
    ...extra,
  };
  return state;
}
const fit = (state, ...ids) => { state.player.ownedShips[0].fittings = ids; return state; };
const read = (state, options) => resolveArsenalPresentation(state, options);

test('every figure is a read of its owner, and each entry records which owner supplied it', () => {
  const { entries } = read(makeState());
  const well = FIELD_DEFS.well;
  assert.equal(entries.pull.range.reachWu, well.deployRange);
  assert.equal(entries.pull.range.radiusWu, well.radius);
  assert.equal(entries.pull.cooldown.seconds, well.cooldownS);
  assert.ok(entries.pull.sentence.includes(`${well.deployRange} units`), 'the placement reach is quoted from the field def');
  assert.ok(entries.pull.sentence.includes(`${GRAVITY_MARK_FIELD_COUPLING}x`), 'the locked-target grip is the combat def');
  assert.equal(entries.shove.range.radiusWu, FIELD_DEFS.repulsor.radius);
  assert.equal(entries.shove.cooldown.seconds, FIELD_DEFS.repulsor.cooldownS);
  assert.equal(entries.pin.range.reachWu, MASS_SEED_DEF.travelSpeed * MASS_SEED_DEF.travelTimeS);
  assert.ok(entries.pin.sentence.includes(`${MASS_SEED_DEF.anchorTtlS}s`));
  assert.equal(entries.pin.cooldown.seconds, MASS_SEED_DEF.cooldownS);
  assert.equal(entries.rig.range.radiusWu, FIELD_DEFS.cone.radius);
  assert.equal(entries.gyre.cost.activate, GYRE_SNARE.capActivateMin);
  assert.equal(entries.gyre.cost.perSecond, GYRE_SNARE.capDrainPerS);
  assert.equal(entries.gyre.range.radiusWu, GYRE_SNARE.basinRadius);
  assert.equal(entries.gyre.range.reachWu, GYRE_SNARE.mawDist);
  const charge = IMPULSE_CHARGES.charge_standard;
  const withCharge = read(makeState({ player: { ...makeState().player, cargo: { items: { cmdty_impulse_charge: 2 } } } })).entries.bomb;
  assert.equal(withCharge.range.radiusWu, charge.radius);
  assert.equal(withCharge.cooldown.seconds, charge.armTimeS);
  for (const id of ARSENAL_VERB_ORDER) {
    const e = entries[id];
    assert.ok(e.sources && Object.keys(e.sources).length >= 2, `${id} names the owners of its values`);
    assert.ok(e.sources.binding, `${id} names its binding owner`);
    assert.ok(e.label && e.sentence && e.glyph !== undefined, `${id} has words and a glyph`);
  }
});

test('the labels name what the NEXT press does: Pull well, Shove with a detonation count, Pin anchor with no root implied', () => {
  const state = makeState();
  let { entries } = read(state);
  assert.equal(entries.pull.label, 'Pull · Draws in');
  assert.match(entries.pull.sentence, /^Place a gravity well at your aim point/);
  assert.match(entries.pull.sentence, /gather/);
  assert.equal(entries.shove.label, 'Shove · Pushes away');
  assert.equal(entries.shove.detonates.total, 0);
  assert.equal(entries.pin.label, 'Pin · Drop anchor');
  assert.match(entries.pin.sentence, /does not hold or root enemies/, 'no universal root is implied');
  assert.doesNotMatch(entries.pin.sentence, /\b(freezes?|stuns?|roots? them)\b/i);
  // Shove: count what the owners' own predicates will detonate.
  const mine = { id: 21, alive: true, type: 'charge', data: { ownerId: 1, armed: true } };
  const theirs = { id: 22, alive: true, type: 'charge', data: { ownerId: 99, armed: true } };
  const unarmed = { id: 23, alive: true, type: 'charge', data: { ownerId: 1, armed: false } };
  const bomb = { id: 24, alive: true, type: 'bomb', data: { ownerId: 1, phase: 'drift', armedAt: 40 } };
  const bombNotYet = { id: 25, alive: true, type: 'bomb', data: { ownerId: 1, phase: 'drift', armedAt: 60 } };
  const bombField = { id: 26, alive: true, type: 'bomb', data: { ownerId: 1, phase: 'field', armedAt: 10 } };
  const bombRetired = { id: 27, alive: true, type: 'bomb', data: { ownerId: 1, phase: 'drift', armedAt: 10, retired: true } };
  state.entityList.push(mine, theirs, unarmed, bomb, bombNotYet, bombField, bombRetired);
  state.emergent = { stickies: [{ ownerId: 1, armed: true }, { ownerId: 99, armed: true }] };
  assert.deepEqual(armedOrdnanceCounts(state, 50), { charges: 1, bombs: 1, plants: 1, total: 3 });
  ({ entries } = read(state));
  assert.equal(entries.shove.label, 'Shove · Pushes away + 3 blasts');
  assert.match(entries.shove.sentence, /1 charge \+ 1 drift bomb \+ 1 planted charge will go off/);
  assert.equal(entries.shove.ready.state, 'armed');
});

test('RIG shows the CURRENT function before use, and a context change swaps the label with the action', () => {
  const state = makeState();
  let { entries } = read(state);
  assert.equal(entries.rig.label, 'Rig · Clear a path');
  assert.equal(entries.rig.glyph, 'field_cone_standard');
  assert.match(entries.rig.limits[0], /planet band this same key opens the skim scoop/, 'the other function is stated before it surprises');
  state.planet = { active: true, player: { regionRank: PLANET_REGION_RANK.skim } };
  ({ entries } = read(state));
  assert.equal(entries.rig.label, 'Rig · Harvest ore', 'inside a planet band the same key harvests ore');
  assert.equal(entries.rig.glyph, 'field_skim_standard', 'and its mark changes with it');
  assert.match(entries.rig.limits[0], /clearing cone instead/);
  state.planet.player.collectorOn = true;
  ({ entries } = read(state));
  assert.equal(entries.rig.label, 'Rig · Harvesting ore');
  assert.match(entries.rig.sentence, /Press to close it/);
  // An open cone folds first, even inside a band (resolveRigTarget): the label follows the press.
  state.fields.coneActive = true;
  ({ entries } = read(state));
  assert.equal(entries.rig.label, 'Rig · Clearing a path');
  assert.match(entries.rig.sentence, /Press to fold it/);
});

test('BOMB names the exact payload, its stock, and whether the next press throws, calls in or drops', () => {
  const state = makeState();
  state.bombs = { selectedId: 'bomb_frag', rack: { cells: [{ id: 'bomb_frag', count: 4 }] } };
  let { entries } = read(state);
  assert.equal(entries.bomb.label, 'Bomb · drop Frag ×4');
  assert.deepEqual(entries.bomb.payload, { id: 'bomb_frag', name: BOMB_DEFS.bomb_frag.name, stock: 4, capacity: BOMB_DEFS.bomb_frag.magazine, next: 'drop' });
  assert.equal(entries.bomb.glyph, 'bomb_frag');
  assert.match(entries.bomb.sentence, /^Next press: drop Frag cassette ×4\./);
  // a sticky charge aboard becomes the default ordnance
  state.player.cargo.items.cmdty_impulse_charge = 3;
  ({ entries } = read(state));
  assert.equal(entries.bomb.label, 'Bomb · throw Charge ×3');
  assert.equal(entries.bomb.glyph, 'power_charge');
  // unless the cycle explicitly chose the bay bomb
  state.bombs.bombChosen = true;
  ({ entries } = read(state));
  assert.equal(entries.bomb.label, 'Bomb · drop Frag ×4');
  // a stocked swarm call-in outranks the bay bomb on the press, so the label names it
  state.bombs.bombChosen = false; delete state.bombs.bombChosen;
  state.player.cargo.items.cmdty_impulse_charge = 0;
  state.run = { kind: 'survival', phase: 'active', ruleset: SWARM_RULESET,
    modifiers: [{ kind: SWARM_CALLIN_RECORD_KIND, callinId: 'smart_bomb', count: 2 }] };
  ({ entries } = read(state));
  assert.equal(entries.bomb.label, 'Bomb · call in Smart Bomb ×2');
  assert.equal(entries.bomb.glyph, 'callin_smart_bomb');
  assert.equal(entries.bomb.payload.next, 'callin');
  // an empty rack says so instead of showing a stale payload
  state.run = null;
  state.bombs = { selectedId: null, rack: { cells: [null, null] } };
  ({ entries } = read(state));
  assert.equal(entries.bomb.label, 'Bomb · none left');
  assert.equal(resolveBombAction(state).action, 'empty');
});

test('a retired payload still in an old rack keeps its own name, never a power\'s (no "Bomb · Pull" beside the Pull power)', () => {
  for (const def of Object.values(BOMB_DEFS)) {
    const state = makeState({ bombs: { selectedId: def.id, rack: { cells: [{ id: def.id, count: 2 }] } } });
    const bomb = read(state).entries.bomb;
    assert.equal(bomb.glyph, def.id, `${def.id} draws its own mark`);
    assert.match(bomb.label, /^Bomb · drop .+ ×2$/);
    assert.doesNotMatch(bomb.label, /^Bomb · (Pull|Shove|Pin|Rig|Line|Gyre) ×/, `${def.id}: the payload is never named like a power`);
    assert.ok(bomb.sentence.includes(def.name), `${def.id}: the sentence names the payload`);
  }
  // a fitted-but-dry socket keeps the family and says empty rather than inventing a payload
  const dry = makeState({ bombs: { selectedId: 'bomb_frag', rack: { cells: [{ id: 'bomb_frag', count: 0 }] } } });
  assert.equal(read(dry).entries.bomb.label, 'Bomb · Frag empty');
  assert.equal(read(dry).entries.bomb.glyph, 'bomb_frag', 'a dry fitted socket keeps its own mark');
  assert.equal(read(makeState({ bombs: { selectedId: null, rack: { cells: [null, null] } } })).entries.bomb.glyph, '', 'an unassigned rack has no payload mark');
});

// The projection and the press must agree. Drive the REAL input owner (the same harness the hold-preview
// test uses) in each ordnance situation and compare which internal flag fired with what the label says.
function bootInput() {
  const sim = createSimulation({ seed: 4931, bus: createBus(), systems: [input] });
  const { state } = sim;
  state.mode = 'flight';
  const p = sim.spawn({ ...makeShipEntitySpec('ship_kestrel', { pos: { x: 0, z: 0 }, rot: 0 }), isPlayer: true });
  state.playerId = p.id;
  state.world = { ...(state.world || {}), currentSectorId: 'sector_a' };
  state.settings.gameplay = { ...(state.settings.gameplay || {}), powerFire: 'press' };
  const host = sim.registry.get('input');
  const tap = (code) => { applyFlightKeyEvent(host, { code, pressed: true }); sim.step(); applyFlightKeyEvent(host, { code, pressed: false }); };
  const flags = () => ['chargeThrow', 'swarmBombThrow', 'dropBomb', 'toggleClearingCone', 'toggleSkimCollector']
    .filter((f) => state.input.actions[f] === true);
  return { sim, state, tap, flags };
}

test('the label agrees with the real press: charge throws, swarm call-in calls in, bay bomb drops, rig follows the band', () => {
  const t = bootInput();
  const press = (code) => { t.tap(code); return t.flags(); };
  // 1. a charge aboard
  t.state.player.cargo = { items: { cmdty_impulse_charge: 2 } };
  assert.equal(resolveBombAction(t.state).action, 'throw');
  assert.deepEqual(press('Digit4'), ['chargeThrow']);
  // 2. no charge, a stocked call-in
  t.state.player.cargo.items.cmdty_impulse_charge = 0;
  t.state.bombs = { selectedId: 'bomb_frag', rack: { cells: [{ id: 'bomb_frag', count: 2 }] } };
  t.state.run = { kind: 'survival', phase: 'active', ruleset: SWARM_RULESET,
    modifiers: [{ kind: SWARM_CALLIN_RECORD_KIND, callinId: 'orbital_lance', count: 1 }] };
  assert.equal(resolveBombAction(t.state).action, 'callin');
  assert.equal(resolveBombAction(t.state).kind, 'orbital_lance');
  assert.deepEqual(press('Digit4'), ['swarmBombThrow']);
  // 3. no call-in either: the bay bomb drops
  t.state.run = null;
  assert.equal(resolveBombAction(t.state).action, 'drop');
  assert.deepEqual(press('Digit4'), ['dropBomb']);
  // 4. a charge aboard but the cycle chose the bay bomb: the press DROPS, and the label says so
  t.state.player.cargo.items.cmdty_impulse_charge = 2;
  t.state.bombs.bombChosen = true;
  const entry = read(t.state).entries.bomb;
  assert.equal(entry.payload.next, 'drop');
  assert.deepEqual(press('Digit4'), ['dropBomb']);
  // 5. rig: the cone in open space, the scoop in a planet band — the same key, the label before the press
  t.state.player.cargo.items.cmdty_impulse_charge = 0;
  assert.equal(read(t.state).entries.rig.label, 'Rig · Clear a path');
  assert.deepEqual(press('Digit5'), ['toggleClearingCone']);
  t.state.planet = { active: true, player: { regionRank: PLANET_REGION_RANK.skim } };
  assert.equal(read(t.state).entries.rig.label, 'Rig · Harvest ore');
  assert.deepEqual(press('Digit5'), ['toggleSkimCollector']);
});

test('bindings come from the remappable owner: a remap moves the label, an unbound action shows no phantom key, legacy aliases are kept', () => {
  const state = makeState();
  let { entries } = read(state);
  assert.equal(entries.pull.binding.label, '1');
  assert.equal(entries.gyre.binding.label, "'");
  assert.equal(entries.cloak.binding.label, '`');
  // remap Gyre and Pull
  state.settings = { controls: { bindings: { gyreSnare: ['KeyV'], pull: ['KeyZ', 'Digit1'] } } };
  ({ entries } = read(state));
  assert.equal(entries.gyre.binding.label, 'V');
  assert.equal(entries.pull.binding.label, '1', 'the power keeps its own digit as the displayed key when it is bound');
  assert.deepEqual(entries.pull.binding.all.sort(), ['1', 'Z']);
  // a saved binding under the OLD name still drives the power
  state.settings = { controls: { bindings: { deployWell: ['KeyP'] } } };
  ({ entries } = read(state));
  assert.equal(entries.pull.binding.label, 'P', 'legacy deployWell → Pull');
  // an action the pilot explicitly unbound stays unbound: no phantom key, and the example says so
  state.settings = { controls: { bindings: { gyreSnare: [], deployWell: [] } } };
  const out = read(state);
  assert.equal(out.entries.gyre.binding.bound, false);
  assert.equal(out.entries.gyre.binding.label, '');
  assert.equal(out.entries.pull.binding.bound, false, 'an explicitly unbound legacy alias stays unbound');
  assert.match(out.combo.steps[1].text, /Gyre \(unbound\)/, 'the combination example never teaches a key the pilot removed');
  assert.match(out.combo.steps[0].text, /Pull \(unbound\)/);
  // the table the HUD pre-resolves can be handed in
  const table = readArsenalBindings(makeState());
  assert.ok(Array.isArray(table.gyreSnare) && Array.isArray(table.cloak) && Array.isArray(table.cycleBomb));
});

test('the cloak reads ready, active, revealed or depleted from its own runtime and module — never "ready" without one', () => {
  const state = fit(makeState(), 'mod_cloak_mk1');
  state.massline2 = { cloak: { available: true, active: false, energy: 1, radius: 320, baseRadius: 320 } };
  assert.equal(readCloakState(state).state, 'ready');
  assert.equal(read(state).entries.cloak.label, 'Cloak · Ready');
  const mod = MODULES.find((m) => m.id === 'mod_cloak_mk1');
  assert.equal(read(state).entries.cloak.range.radiusWu, mod.mods.cloakBaseRadius, 'the signature figure is the module\'s own');
  assert.match(read(state).entries.cloak.limits[0], /scanner pulse burns it open/);
  state.massline2.cloak.active = true;
  assert.equal(readCloakState(state).state, 'active');
  assert.equal(read(state).entries.cloak.label, 'Cloak · Active');
  assert.match(read(state).entries.cloak.sentence, /signature ring/);
  assert.match(read(state).entries.cloak.sentence, /firing drops it/);
  state.massline2.cloak.revealUntil = state.simTime + 1.5;
  assert.equal(readCloakState(state).state, 'revealed');
  assert.equal(read(state).entries.cloak.label, 'Cloak · Revealed');
  assert.match(read(state).entries.cloak.sentence, /Concealment depends on signature, observers and what you do/);
  state.massline2.cloak.revealUntil = state.simTime - 1;
  state.massline2.cloak.active = false;
  state.massline2.cloak.energy = 0.05;
  assert.equal(readCloakState(state).state, 'depleted');
  assert.equal(read(state).entries.cloak.label, 'Cloak · Depleted');
  assert.equal(read(state).entries.cloak.ready.state, 'unaffordable');
  // none fitted, or a mode with the cloak flag off: unavailable, never "ready"
  assert.equal(readCloakState(fit(makeState())).state, 'unavailable');
  assert.equal(read(fit(makeState())).entries.cloak.label, 'Cloak · none fitted');
  const off = fit(makeState({ runtime: { features: { massline2: { enabled: true, cloak: false } } } }), 'mod_cloak_mk1');
  assert.equal(readCloakState(off).state, 'unavailable');
  assert.equal(read(off).entries.cloak.label, 'Cloak · off here');
});

test('the cloak "ready" threshold is the cloak system\'s own engage floor', () => {
  // The projection says depleted below the floor and ready at it; the system refuses / engages at the same line.
  for (const [energy, projected, engages] of [[0.11, 'depleted', false], [0.12, 'ready', true]]) {
    const state = fit(makeState(), 'mod_cloak_mk1');
    state.massline2 = { cloak: { available: true, active: false, energy, radius: 320, baseRadius: 320 } };
    state.input = { actions: { cloakToggle: true } };
    const toasts = [];
    const system = Object.create(cloak);
    system.bus = { emit(name, payload) { if (name === 'toast') toasts.push(payload.text); }, on() { return () => {}; } };
    system._unsubs = [];
    system.update(0.016, state);
    assert.equal(readCloakState(state).state === 'active', engages, `energy ${energy}: the system ${engages ? 'engages' : 'refuses'}`);
    state.massline2.cloak.active = false;
    state.massline2.cloak.energy = energy;
    assert.equal(readCloakState(state).state, projected, `energy ${energy} reads ${projected}`);
    assert.equal(toasts.includes('Cloak charge too low'), !engages);
  }
});

test('the Gyre reads gather / release from the Gyre system\'s own phase', () => {
  const state = makeState();
  assert.equal(read(state).entries.gyre.label, 'Gyre · Gathers rocks');
  state.gyreSnare = { phase: 'beaming', tooHeavyCount: 2 };
  let e = read(state).entries.gyre;
  assert.equal(e.label, 'Gyre · Gathering');
  assert.match(e.sentence, /2 too big to take whole/);
  state.gyreSnare = { phase: 'holding' };
  e = read(state, { denial: { tool: 'gyre', code: 'protected', text: 'Cargo or quest wreck — towed, never swallowed', tick: 1 } }).entries.gyre;
  assert.equal(e.label, 'Gyre · Release');
  assert.match(e.sentence, /Release to throw it/);
  assert.equal(e.denial.text, 'Cargo or quest wreck — towed, never swallowed', 'the refusal the owner published is carried verbatim');
  assert.equal(read(state).entries.gyre.denial, undefined, 'and only while the caller carries one');
  state.gyreSnare = { phase: 'off', liveBalls: 1 };
  assert.equal(read(state).entries.gyre.label, 'Gyre · Thrown');
  // too little charge to wake
  state.gyreSnare = { phase: 'off' };
  state.entities.get(1).cap = GYRE_SNARE.capActivateMin - 1;
  assert.equal(read(state).entries.gyre.ready.state, 'unaffordable');
});

test('fitted weapons describe the COMPILED result, and a chain module states its hop rule', () => {
  const state = fit(makeState(), 'wpn_pulse_laser_s');
  assert.deepEqual(describeCompiledChanges(state, WEAPONS.find((w) => w.id === 'wpn_pulse_laser_s')), [], 'a bare weapon changes nothing');
  fit(state, 'wpn_pulse_laser_s', 'mod_bank_shot', 'mod_relay_arc');
  const weapon = resolveFittedWeapons(state)[0];
  assert.equal(weapon.defId, 'wpn_pulse_laser_s');
  assert.equal(weapon.glyph, 'wpn_pulse_laser_s');
  assert.ok(weapon.changes.some((line) => /^Bounces off up to 1 surface\.$/.test(line)), weapon.changes.join(' | '));
  const hop = weapon.changes.find((line) => /jumps to up to \d+ more hulls? within \d+ units, never the same one twice/.test(line));
  assert.ok(hop, `a chain module describes its hop rule: ${weapon.changes.join(' | ')}`);
  assert.doesNotMatch(weapon.changes.join(' '), /root sibling|lineage|generation|proc budget|compatibility emitter/i);
  // an unfitted modifier changes nothing
  assert.deepEqual(resolveFittedWeapons(fit(makeState(), 'wpn_pulse_laser_s'))[0].changes, []);
  assert.equal(resolveFittedWeapons(fit(makeState(), 'mod_cloak_mk1')).length, 0, 'modules are not weapons');
});

test('the static part is cached on the fitting / mode / binding signature; readiness is live', () => {
  const state = fit(makeState(), 'mod_cloak_mk1');
  const reader = createArsenalPresentation();
  const a = reader.read(state);
  const b = reader.read(state);
  assert.equal(reader.builds, 1, 'a second read of unchanged state rebuilds nothing');
  assert.equal(a.entries.pull.sentence, b.entries.pull.sentence);
  assert.equal(a.combo, b.combo, 'the combination example is built once per signature');
  // readiness is NOT cached
  const hot = reader.read(state, { rail: { 1: { state: 'cooling', why: 'Recharging — 3s', cooldownMs: 3000 } } });
  assert.equal(hot.entries.pull.ready.state, 'cooling');
  assert.equal(reader.read(state).entries.pull.ready.state, 'ready');
  assert.equal(reader.builds, 1);
  // each signature input invalidates it
  state.settings = { controls: { bindings: { gyreSnare: ['KeyV'] } } };
  reader.read(state);
  assert.equal(reader.builds, 2, 'a rebind rebuilds');
  fit(state, 'mod_cloak_mk1', 'wpn_pulse_laser_s');
  reader.read(state);
  assert.equal(reader.builds, 3, 'a refit rebuilds');
  state.run = { kind: 'survival', ruleset: SWARM_RULESET };
  reader.read(state);
  assert.equal(reader.builds, 4, 'a mode change rebuilds');
  state.planet = { active: true, player: { regionRank: PLANET_REGION_RANK.skim } };
  reader.read(state);
  assert.equal(reader.builds, 5, 'the rig target changing rebuilds');
  reader.read(state);
  assert.equal(reader.builds, 5);
});

test('the combination example is the production sequence: Pull, then Gyre, then release to throw', () => {
  const out = read(makeState());
  assert.deepEqual(out.combo.order, ['pull', 'gyre', 'throw']);
  assert.equal(out.combo.steps.length, 3);
  assert.match(out.combo.steps[0].text, /^Pull \(1\) drops a well on a pile of loose rocks and they gather\./);
  assert.match(out.combo.steps[1].text, /^Hold Gyre \('\) over the pile/);
  assert.match(out.combo.steps[2].text, /^Release Gyre to throw the ball/);
  assert.match(out.combo.note, /Solve it any way the room allows/, 'the player may solve the scene another way');
  assert.deepEqual(combinationExample(out.entries).order, out.combo.order);
  // it references the same capability definitions, not a bespoke description
  assert.ok(out.entries.pull.combos[0].startsWith('Pull piles loose rocks'));
  assert.ok(out.entries.gyre.combos[0].includes('Gyre scoops the pile into a ball'));
  // and the swarm catalogue's call-ins all exist as Bomb-key payloads
  assert.ok(SWARM_CALLIN_CATALOG.some((row) => row.id === 'smart_bomb'));
});
