// PQ-146 registered-owner contracts for stuntGrammar: lifecycle, exactly-once kill pay across
// death aliases, weapon-neutral base pay, session boundaries and bounded state. Physical
// recognitions are proven by the route tests; this file covers the owner's bookkeeping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { journalFor } from '../src/combat/stuntEvidence.js';
import { killPoints, trickPay, comboPay, isPulseWeapon, PULSE_KILL_SCORE, GUN_KILL_SCORE } from '../src/systems/stuntCombo.js';
import { threatReward } from '../src/combat/stuntScoring.js';

function ship(id, over = {}) {
  return { id, type: 'ship', alive: true, team: id === 0 ? 0 : 1, name: `ship ${id}`, pos: { x: id * 40, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, mass: 16, hull: 100, hullMax: 100,
    data: { defId: 'ship_kestrel', runCohort: id === 0 ? undefined : 'survival', ...over }, physicsBody: { schemaVersion: 1, dynamic: true, radius: 6, mass: 16 } };
}
function boot({ survival = true, ships = [ship(0), ship(1), ship(2)] } = {}) {
  const state = { playerId: 0, tick: 10, simTime: 10 / 60, mode: 'flight', entities: new Map(ships.map(e => [e.id, e])), entityList: ships, combat: {}, factions: {}, settings: {}, player: {},
    run: survival ? { kind: 'survival', phase: 'active', seed: 5, wave: 1 } : null };
  const bus = createBus(), events = [];
  for (const name of ['faction:repDelta', 'stunt:salvageRights', 'stunt:trickDetected', 'stunt:styleBanked']) bus.on(name, p => events.push({ name, p }));
  const grammar = Object.create(stuntGrammar);
  grammar.init({ state, bus });
  return { state, bus, grammar, events };
}

test('double init does not double-subscribe and destroy twice is safe', () => {
  const h = boot();
  h.grammar.init({ state: h.state, bus: h.bus });
  h.bus.emit('entity:killed', { id: 1, killerId: 0, weaponId: 'wpn_pulse_laser_s', tick: 12 });
  assert.equal(h.state.stunts.combo.baseScore, threatReward('fodder').baseScore, 'one death, one base award, even with a second init');
  h.grammar.destroy();
  h.grammar.destroy();
  h.bus.emit('entity:killed', { id: 2, killerId: 0, tick: 13 });
  assert.equal(h.state.stunts.combo.baseScore, threatReward('fodder').baseScore, 'a destroyed owner no longer listens');
});

test('one cohort death pays once across entity:killed and combat:kill aliases; unowned deaths pay no base score', () => {
  const h = boot();
  h.bus.emit('entity:killed', { id: 1, killerId: 0, weaponId: 'wpn_autocannon_s', tick: 12 });
  h.bus.emit('combat:kill', { targetId: 1, killerId: 0, weaponId: 'wpn_autocannon_s', tick: 12 });
  h.bus.emit('entity:killed', { id: 1, killerId: 0, tick: 13 });
  assert.equal(h.state.stunts.combo.baseScore, 100);
  assert.deepEqual(Object.keys(h.state.stunts.combo.settledDeaths).length, 1);
  h.bus.emit('entity:killed', { id: 2, killerId: 7, tick: 14 });
  assert.equal(h.state.stunts.combo.baseScore, 100, 'a room kill resolves the cohort but is not the player\'s');
  assert.equal(h.state.stunts.combo.gunKills, 1);
  h.grammar.destroy();
});

test('base kill pay is weapon neutral: the free Pulse pays what every gun pays, and tricks pay no faction or salvage side channel', () => {
  assert.equal(PULSE_KILL_SCORE, GUN_KILL_SCORE);
  assert.equal(killPoints('wpn_pulse_laser_s', 'fodder'), killPoints('wpn_railgun_m', 'fodder'));
  assert.equal(killPoints('anything', 'boss'), 2000);
  assert.equal(killPoints('anything', 'none'), 0, 'noncombatants and unbudgeted adds have no bounty');
  assert.ok(isPulseWeapon('wpn_pulse_laser_s'));
  assert.deepEqual(trickPay(), { reputation: 0, salvageRights: 0, credits: 0, factionId: 'faction_pitborn' });
  assert.equal(comboPay, trickPay);
  const h = boot();
  h.bus.emit('entity:killed', { id: 1, killerId: 0, weaponId: 'wpn_pulse_laser_s', tick: 12 });
  h.bus.emit('entity:killed', { id: 2, killerId: 0, weaponId: 'wpn_railgun_m', tick: 12 });
  assert.equal(h.state.stunts.combo.pulseKills, 1);
  assert.equal(h.state.stunts.combo.gunKills, 1);
  assert.equal(h.state.stunts.combo.baseScore, 200);
  assert.equal(h.events.filter(e => e.name === 'faction:repDelta' || e.name === 'stunt:salvageRights').length, 0);
  h.grammar.destroy();
});

test('Adventure deaths never enter the Crucible ledger; a missing tick falls back to the simulation tick', () => {
  const h = boot({ survival: false });
  h.bus.emit('entity:killed', { id: 1, killerId: 0, weaponId: 'wpn_pulse_laser_s' });
  assert.equal(h.state.stunts.combo.baseScore, 0);
  assert.equal(journalFor(h.state).lives.get('number:1').deathTick, 10, 'the death is still noted at state.tick for the causal record');
  h.grammar.destroy();
});

test('run:started and game:newGame clear tricks, combo, evidence and detector history for the new session', () => {
  const h = boot();
  h.bus.emit('entity:killed', { id: 1, killerId: 0, tick: 12 });
  h.grammar.detector.incidents.set('root:stale', { trickId: 'bolas' });
  h.state.stunts.recentTricks.push({ episodeId: 'root:stale', trickId: 'bolas' });
  h.state.stunts.totalTricksDetected = 1;
  assert.ok(h.state.stunts.combo.baseScore > 0);
  h.bus.emit('run:started', { kind: 'survival' });
  assert.equal(h.state.stunts.combo.baseScore, 0);
  assert.equal(h.state.stunts.recentTricks.length, 0);
  assert.equal(h.state.stunts.totalTricksDetected, 0);
  assert.equal(h.grammar.detector.incidents.size, 0);
  assert.equal(journalFor(h.state).roots.size, 0);
  assert.equal(h.state.stunts.schemaVersion, 2);
  h.bus.emit('entity:killed', { id: 2, killerId: 0, tick: 30 });
  h.bus.emit('game:newGame', {});
  assert.equal(h.state.stunts.combo.baseScore, 0);
  assert.equal(Object.keys(h.state.stunts.combo.settledDeaths).length, 0);
  h.grammar.destroy();
});

test('threat admission is immutable per life and every survival body is admitted at spawn', () => {
  const h = boot();
  const heavy = ship(3, { role: 'heavy' });
  h.state.entities.set(3, heavy); h.state.entityList.push(heavy);
  h.bus.emit('entity:spawned', { id: 3, entity: heavy });
  assert.equal(heavy.data.stuntThreat.threatClass, 'heavy');
  assert.equal(heavy.data.stuntThreat.styleBudget, 400);
  heavy.data.isBoss = true;
  h.bus.emit('entity:killed', { id: 3, killerId: 0, tick: 40 });
  assert.equal(h.state.stunts.combo.baseScore, 400, 'a later boss flag cannot promote an admitted life');
  const stray = ship(4, { runCohort: 'survival', unbudgetedAdd: true });
  h.state.entities.set(4, stray); h.state.entityList.push(stray);
  h.bus.emit('entity:spawned', { id: 4, entity: stray });
  h.bus.emit('entity:killed', { id: 4, killerId: 0, tick: 41 });
  assert.equal(h.state.stunts.combo.baseScore, 400, 'an endless unbudgeted add carries no bounty');
  h.grammar.destroy();
});

test('serialize is null during a live Survival run and a full adventure record otherwise; foreign payloads reset cleanly', () => {
  const live = boot();
  assert.equal(live.grammar.serialize(), null, 'Crucible numbers never leak into an Adventure save');
  live.grammar.destroy();
  const adventure = boot({ survival: false });
  const saved = adventure.grammar.serialize();
  assert.equal(saved.revision, 2); assert.equal(saved.mode, 'adventure');
  assert.ok(saved.evidence && saved.detector && saved.flight && saved.state);
  adventure.grammar.deserialize({ revision: 1, mode: 'adventure', state: { schemaVersion: 1, combo: { banked: 999 } } });
  assert.equal(adventure.state.stunts.combo.banked, 0, 'an unknown revision restores a fresh owner, never invented score');
  adventure.grammar.deserialize(saved);
  assert.equal(adventure.state.stunts.schemaVersion, 2);
  adventure.grammar.destroy();
});
