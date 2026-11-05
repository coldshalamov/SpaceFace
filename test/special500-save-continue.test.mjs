import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { rememberMoralDebt } from '../src/systems/moralMemory.js';
import { confessionalReadback } from '../src/systems/special500Confessional.js';
import { createDockIntent } from '../src/core/dockIntent.js';
import { stationShiftAt } from '../src/data/worldCalendar.js';

test('real production save/Continue restores pending choice, once-only results and literal finale read-back', async t => {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 4242 });
  const { state, bus } = runtime, get = name => runtime.getSystem(name);
  const offers = [], errors = [], loaded = [], mail = [];
  bus.on('special500:confessional', p => { if (p.offerId) offers.push(p); });
  bus.on('save:error', p => errors.push(p)); bus.on('save:loaded', p => loaded.push(p));
  bus.on('comms:popup', p => { if (p.id === 'mail:mail_guilt_read_back') mail.push(p); });
  try {
    state.mode = 'flight';
    get('ships').newGame(); get('world').newGame(); get('economy').newGame(); get('factions').newGame();
    get('economy').grantCredits(100, 'test:starting-balance');
    const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: state.player,
      team: 0, pos: { x: 120, z: -80 } }));
    state.playerId = player.id;
    get('world').enterSector('sector_vesta_forge', { placePlayer: true });
    assert.equal(await get('physics').prepareBackend(state, { reset: true }), true);
    state.simTime = 60; state.tick = 3600;
    rememberMoralDebt(state, { id: 'save-ledger', name: 'A pilot spared, then returned', cause: 'moral_trap:save' });
    bus.emit('dock:docked', createDockIntent(state, { stationId: 'station_forge' }, player));
    const original = offers.at(-1);
    assert.ok(original?.recordText.includes('A pilot spared, then returned'));
    const saver = get('save'), pending = JSON.parse(JSON.stringify(saver.serialize('incoming-pending')));
    const pendingBytes = JSON.stringify(pending);
    assert.ok(pendingBytes.includes(original.recordText.replaceAll('\n', '\\n')));
    bus.emit('ui:confessionalChoose', { ...original, choice: 'decline' });
    const credits = state.player.credits;
    assert.equal(await saver.loadEnvelope(pending, 'incoming-pending'), true, JSON.stringify(errors));
    assert.ok(loaded.some(p => p.slot === 'incoming-pending'), 'save owner emitted its real loaded receipt');
    const resumed = offers.at(-1);
    assert.equal(resumed.offerId, original.offerId); assert.ok(resumed.generation > original.generation);
    assert.equal(resumed.recordText, original.recordText);
    bus.emit('ui:confessionalChoose', { ...original, choice: 'file' });
    assert.equal(state.player.credits, credits, 'pre-load choice is stale');
    bus.emit('ui:confessionalChoose', { ...resumed, choice: 'file' });
    assert.equal(state.player.credits, credits - 40);
    const accepted = state.story.flags.guilt_filed.recordText;
    assert.equal(accepted, original.recordText);
    const choirRep = state.factions.faction_choir.rep;
    const paid = JSON.parse(JSON.stringify(saver.serialize('incoming-paid')));
    assert.equal(await saver.loadEnvelope(paid, 'incoming-paid'), true, JSON.stringify(errors));
    bus.emit('ui:confessionalChoose', { ...resumed, choice: 'file' });
    assert.equal(state.player.credits, credits - 40); assert.equal(state.factions.faction_choir.rep, choirRep);
    assert.equal(state.story.flags.guilt_filed.recordText, accepted);

    const pitbornBefore = state.factions.faction_pitborn.rep;
    state.simTime += stationShiftAt('station_forge', state.simTime).endsInS;
    bus.emit('dock:docked', createDockIntent(state, { stationId: 'station_forge' }, state.entities.get(state.playerId)));
    get('mail').update(1, state);
    assert.equal(state.factions.faction_pitborn.rep, pitbornBefore + 1);
    assert.ok(state.mail.delivered.includes('mail_heard_the_count'));
    const karaoke = JSON.parse(JSON.stringify(saver.serialize('incoming-karaoke')));
    assert.equal(await saver.loadEnvelope(karaoke, 'incoming-karaoke'), true);
    bus.emit('dock:docked', createDockIntent(state, { stationId: 'station_forge' }, state.entities.get(state.playerId)));
    get('mail').update(1, state);
    assert.equal(state.factions.faction_pitborn.rep, pitbornBefore + 1, 'Continue never pays a second standing reward');
    assert.equal(state.mail.delivered.filter(id => id === 'mail_heard_the_count').length, 1);

    state.simTime += 1;
    get('world').enterSector('sector_ashfall_reach', { placePlayer: true });
    state.story.flags.deep_reach_operation_complete = true;
    state.story.flags.kurtz_desk_opened = true;
    assert.equal(get('cargo').addCargo('cmdty_personal_ledger', 1), 1);
    bus.emit('ui:endgameChoose', { choice: 'D', confirm: true });
    assert.equal(state.story.endgameChoice, 'D', 'real story owner commits the canonical outcome');
    let guard = 0;
    while (state.story.writtenFinale.completedAtS == null && guard++ < 50) {
      state.simTime = state.story.writtenFinale.nextAtS; get('story')._pumpWrittenFinale();
    }
    assert.equal(mail.at(-1)?.text, accepted, 'real canonical finale emitted the literal mail');
    // Simulate an interrupted delivery before the next save, while retaining the completed
    // canonical ending. No success event is manufactured; the real mail owner must recover.
    state.mail.delivered = state.mail.delivered.filter(id => id !== 'mail_guilt_read_back');
    state.mail.events = Array.from({ length: 96 }, (_, i) => ({ n: 'irrelevant', t: i, f: {} }));
    const beforeReadback = JSON.parse(JSON.stringify(saver.serialize('incoming-readback-due')));
    assert.equal(await saver.loadEnvelope(beforeReadback, 'incoming-readback-due'), true, JSON.stringify(errors));
    assert.equal(confessionalReadback(state).text, accepted);
    const before = mail.length;
    get('mail').update(1, state);
    assert.equal(mail.length, before + 1); assert.equal(mail.at(-1).text, accepted);
    const delivered = JSON.parse(JSON.stringify(saver.serialize('incoming-readback-delivered')));
    assert.equal(await saver.loadEnvelope(delivered, 'incoming-readback-delivered'), true, JSON.stringify(errors));
    get('mail').update(1, state);
    assert.equal(mail.length, before + 1, 'a delivered letter never repeats after Continue');
    const oldShape = { at: 0, records: 2 };
    state.story.flags.guilt_filed = oldShape;
    const legacy = JSON.parse(JSON.stringify(saver.serialize('incoming-legacy-filing')));
    assert.equal(await saver.loadEnvelope(legacy, 'incoming-legacy-filing'), true);
    assert.deepEqual(state.story.flags.guilt_filed, oldShape);
    assert.equal(confessionalReadback(state), null, 'a legacy count cannot invent historical filed text');
    bus.emit('ui:confessionalChoose', { ...resumed, choice: 'file' });
    assert.equal(state.player.credits, credits - 40, 'a legacy terminal filing cannot charge again');
    let bells = 0;
    bus.on('audio:cue', cue => { if (cue.id === 'sfx_eighth_bell_toll') bells += 1; });
    state.mode = 'flight'; state.settings.gameplay.difficulty = 'standard';
    get('combat').kill(state.entities.get(state.playerId), null, {});
    assert.equal(bells, 1, 'actual combat defeat invokes the registered bell');
    const death = JSON.parse(JSON.stringify(saver.serialize('incoming-death-bell')));
    assert.equal(await saver.loadEnvelope(death, 'incoming-death-bell'), true);
    assert.ok(state.story.flags.death_bell_tolled != null);
    get('special500DeathBell')._onDeath(state.combat.lastPlayerDefeat);
    assert.equal(bells, 1, 'a saved death occurrence cannot toll again on Continue');
    assert.ok(errors.every(error => error.autosave === true && error.reason === 'superseded'),
      JSON.stringify(errors)); // named loads intentionally supersede sector-triggered autosaves
  } finally { runtime.dispose(); }
});
