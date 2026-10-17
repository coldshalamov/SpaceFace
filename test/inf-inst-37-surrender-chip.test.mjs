import test from 'node:test';
import assert from 'node:assert/strict';
import { surrenderRecovery, isSurrenderedContact } from '../src/systems/surrenderRecovery.js';
import { targetLockChipText } from '../src/ui/hud.js';
import { instrumentScenario, mountInstrumentCard } from './helpers/infInstrumentScenario.mjs';

test('INST-37 seed 4242: accepted surrender rewords the locked hull within one tick and clearing restores it', () => {
  const h = instrumentScenario([surrenderRecovery]);
  try {
    const hull = h.sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: 120, z: 0 },
      hull: 12, hullMax: 100, mass: 80,
      data: { name: 'Reach Cutter', ai: { fsm: 'attack', passive: false }, intent: {} },
    });
    h.state.player.targetId = hull.id;
    const card = mountInstrumentCard(h);
    const intent = card.el.querySelector('.sf-target__intent');
    card.update();
    const before = intent.textContent;
    assert.equal(targetLockChipText(hull, 1), 'LOCKED');
    assert.doesNotMatch(before, /SURRENDERED/);

    hull.data.ai.fsm = 'surrender';
    hull.data.ai.passive = true;
    h.bus.emit('combat:surrendered', { entityId: hull.id, reason: 'damage-critical' });
    h.bus.flush();
    h.sim.step();
    assert.equal(hull.data.surrenderRecovery.recoveryKind, 'surrendered', 'the sim accepted recovery');
    assert.equal(h.state.tick, 1);
    const accepted = JSON.stringify(hull.data);
    const selection = h.state.player.targetId;
    card.update(); // second call: neither a target change nor the panel's slow sixth update
    assert.equal(targetLockChipText(hull, 1), 'SURRENDERED');
    assert.match(intent.textContent, /^SURRENDERED · /);
    assert.equal(JSON.stringify(hull.data), accepted, 'chip readers do not write sim state');
    assert.equal(h.state.player.targetId, selection, 'surrender leaves the hull targetable');

    hull.data.ai.fsm = 'attack';
    hull.data.ai.passive = false;
    h.sim.step();
    card.update();
    assert.equal(targetLockChipText(hull, 1), 'LOCKED');
    assert.equal(intent.textContent, before);
    assert.ok(hull.data.surrenderRecovery, 'a retained recovery annotation cannot keep the label stale');
  } finally { h.sim.dispose(); }
});

test('INST-37: only a live surrendered hull overrides the existing lock-progress strings', () => {
  assert.equal(targetLockChipText(null, 0.25), 'ACQUIRING 25%');
  assert.equal(targetLockChipText(null, 0.75), 'TRACKING 75%');
  assert.equal(isSurrenderedContact({ type: 'station', data: { ai: { fsm: 'surrender' } } }), false);
  assert.equal(isSurrenderedContact({ type: 'ship', alive: false, data: { ai: { fsm: 'surrender' } } }), false);
});
