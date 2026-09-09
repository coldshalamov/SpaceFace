// WF-13 — the WANTED heat family's semantic audio: the authoritative heat:changed packet keys
// the whole family, and the handler is FULLY PACKET-DRIVEN — every verdict derives from the
// packet's own level/previousValue/wanted/wantedCrossed, so no cross-run or post-load transient
// can stale it (the wave-2 review proved a memory-based climb guard plays a phantom escalation
// after heat.js's 0.4s emit throttle suppresses a climb). Only edges speak: the WANTED flip and
// band climbs play the rising alarm (pitched up per band), dropping clean plays the clear sting;
// chips inside a band and decay-without-clear stay silent.
// Pure routing characterization: the AudioContext is never created here.
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { AUDIO_CUE_TO_RECIPE, audio } from '../src/audio/audioSystem.js';
import { heat, heatLevelFor, THRESHOLD } from '../src/systems/heat.js';

// Level/wanted/wantedCrossed derive from the producer's own math (heat.js) so a drift in the
// emit contract fails here instead of silently keeping the suite green.
function heatPacket(overrides = {}) {
  const value = overrides.value != null ? overrides.value : 0.3;
  const previousValue = overrides.previousValue != null ? overrides.previousValue : 0.2;
  return {
    value,
    previousValue,
    level: heatLevelFor(value),
    wanted: value >= THRESHOLD,
    wantedCrossed: (value >= THRESHOLD) !== (previousValue >= THRESHOLD),
    suspicion: value <= 0 ? 0 : Math.min(1, value / THRESHOLD),
    threshold: THRESHOLD,
    ...overrides,
  };
}

function hostWith(played = []) {
  const host = Object.create(audio);
  host._onCue = (cue) => { played.push(cue); return null; };
  return host;
}

test('the heat family ships both recipes as ui-category data with envelopes', () => {
  const ids = RECIPES.map((recipe) => recipe.id);
  assert.equal(ids.filter((id) => id === 'sfx_wanted_alert').length, 1);
  assert.equal(ids.filter((id) => id === 'sfx_wanted_clear').length, 1);
  for (const id of ['sfx_wanted_alert', 'sfx_wanted_clear']) {
    const recipe = RECIPES.find((entry) => entry.id === id);
    assert.equal(recipe.category, 'ui', `${id} rides the ui bus`);
    assert.ok(recipe.gainEnvelope && Number.isFinite(recipe.gainEnvelope.release), `${id} has an envelope`);
  }
  assert.equal(AUDIO_CUE_TO_RECIPE.wanted_escalate, 'sfx_wanted_alert');
  assert.equal(AUDIO_CUE_TO_RECIPE.wanted_clear, 'sfx_wanted_clear');
});

test('the WANTED flip ducks and speaks louder than a band climb', () => {
  const played = [];
  const host = hostWith(played);
  host._onHeatChanged(heatPacket({ value: 0.16, previousValue: 0, wantedCrossed: true }));
  assert.equal(played.length, 1);
  assert.equal(played[0].id, 'wanted_escalate');
  assert.equal(played[0].duck, true, 'the flip owns the ear');
  assert.equal(played[0].importance, 0.9);

  const climbed = [];
  const climber = hostWith(climbed);
  climber._onHeatChanged(heatPacket({ value: 0.3, previousValue: 0.16 }));
  assert.equal(climbed.length, 1);
  assert.equal(climbed[0].id, 'wanted_escalate');
  assert.equal(climbed[0].duck, false, 'a climb inside WANTED never squelches combat audio');
  assert.ok(climbed[0].importance < 0.8, 'climbs stay below the priority-squelch threshold');
});

test('dropping clean plays the clear sting at critical importance (squelch-proof)', () => {
  const played = [];
  const host = hostWith(played);
  host._onHeatChanged(heatPacket({ value: 0, previousValue: 0.3, wantedCrossed: true }));
  assert.equal(played.length, 1);
  assert.equal(played[0].id, 'wanted_clear');
  assert.equal(played[0].importance, 0.8, 'the relief sting must survive a combat squelch window');
});

test('the alarm ladder is audible across all five bands (rate steps ~2 semitones)', () => {
  const played = [];
  const host = hostWith(played);
  let prev = 0.16;
  host._onHeatChanged(heatPacket({ value: 0.16, previousValue: 0, wantedCrossed: true }));
  for (const value of [0.25, 0.45, 0.65, 0.85]) {
    host._onHeatChanged(heatPacket({ value, previousValue: prev }));
    prev = value;
  }
  assert.equal(played.length, 5, 'flip + four climbs all speak');
  for (let i = 1; i < played.length; i++) {
    assert.ok(played[i].rate > played[i - 1].rate, `band ${i + 1} is pitched up`);
    assert.ok(played[i].gain > played[i - 1].gain, `band ${i + 1} is louder`);
  }
  assert.equal(played[0].rate, 1, 'band 1 enters at natural pitch');
  assert.ok(played[4].rate >= 1.4, 'band 5 is at least a fifth up from band 1 — the ladder must be perceivable, not sub-JND');
  assert.ok(played[4].rate <= 1.6 && played[4].gain <= 0.9, 'clamps hold at the top band');
});

test('chips inside a band, mid-band decay, and sub-threshold drift are silent', () => {
  const played = [];
  const host = hostWith(played);
  host._onHeatChanged(heatPacket({ value: 0.2, previousValue: 0.18 }));   // in-band chip
  host._onHeatChanged(heatPacket({ value: 0.45, previousValue: 0.5 }));   // decay, same band
  host._onHeatChanged(heatPacket({ value: 0.35, previousValue: 0.45 }));  // decay band 3→2
  host._onHeatChanged(heatPacket({ value: 0.16, previousValue: 0.35 }));  // decay band 2→1, still wanted
  host._onHeatChanged(heatPacket({ value: 0.05, previousValue: 0.1 }));   // sub-threshold drift, no WANTED edge
  assert.equal(played.length, 0, 'only edges may speak');
});

test('a throttle-suppressed climb never plays a phantom escalation on the later decay step', () => {
  const played = [];
  const host = hostWith(played);
  // Bust → flip at band 1 (packet 1 speaks).
  host._onHeatChanged(heatPacket({ value: 0.16, previousValue: 0, wantedCrossed: true }));
  assert.equal(played.length, 1);
  // A second raise to band 3 inside heat.js's 0.4s emit window is suppressed by the producer:
  // no packet exists, so the handler must learn about band 3 only when a future packet says so.
  // The first decay step (3→2) carries previousValue ABOVE the current level — it must stay
  // silent even though the handler never saw band 2 or 3 before.
  host._onHeatChanged(heatPacket({ value: 0.4, previousValue: 0.524 }));
  assert.equal(played.length, 1, 'a falling packet may never voice the rising alarm');
});

test('the first climb after a load speaks without any prior packet (fully packet-driven)', () => {
  const played = [];
  const host = hostWith(played);
  // Save restored heat 0.20 (band 1); no restore packet is emitted. The next bust raises to
  // 0.36 = band 2 — the packet's own previousValue proves the climb.
  host._onHeatChanged(heatPacket({ value: 0.36, previousValue: 0.2 }));
  assert.equal(played.length, 1);
  assert.equal(played[0].id, 'wanted_escalate');
});

test('a crossing with no usable previousValue speaks; without a crossing nothing may', () => {
  const played = [];
  const host = hostWith(played);
  // The producer always sends previousValue (its own fallback sets it to value, which cannot
  // prove a climb) — if such a packet ever arrives, the packet's crossing edge alone must still
  // voice the flip.
  host._onHeatChanged({ value: 0.16, previousValue: 0.16, level: 1, wanted: true, wantedCrossed: true, threshold: THRESHOLD });
  assert.equal(played.length, 1);
  assert.equal(played[0].id, 'wanted_escalate');
  assert.equal(played[0].duck, true);
  // The same packet without the crossing edge: nothing may speak.
  const silent = [];
  hostWith(silent)._onHeatChanged({ value: 0.3, previousValue: 0.3, level: 2, wanted: true, wantedCrossed: false, threshold: THRESHOLD });
  assert.equal(silent.length, 0);
});

test('the producer carries previousLevel on the packet (non-enumerable), and the handler reads it', () => {
  // heat.js now stamps previousLevel non-enumerably so the climb verdict is a packet fact, not a
  // re-derivation from the raw scalar. A climb whose previousValue sits exactly on a band boundary
  // (ceil(value*5) lands flat) must still speak, because the packet — not the scalar math — proves it.
  const played = [];
  const host = hostWith(played);
  const packet = heatPacket({ value: 0.41, previousValue: 0.4 });
  // Simulate the producer's stamp: a genuine 2->3 climb that ceil(previousValue*5) would misread as flat.
  Object.defineProperty(packet, 'previousLevel', { value: 2, enumerable: false });
  host._onHeatChanged(packet);
  assert.equal(played.length, 1, 'a packet-stamped band climb speaks even on a ceil boundary');
  assert.equal(played[0].id, 'wanted_escalate');

  // The packet field must not leak into serialization (save/clone safety).
  const clone = JSON.parse(JSON.stringify(packet));
  assert.equal(clone.previousLevel, undefined, 'previousLevel stays out of cloned/serialized packets');

  // Legacy packets without previousLevel fall back to scalar derivation and stay correct.
  const legacy = [];
  hostWith(legacy)._onHeatChanged(heatPacket({ value: 0.3, previousValue: 0.16 }));
  assert.equal(legacy.length, 1, 'a packet without previousLevel still voices a real climb');
});

test('the real heat system stamps previousLevel on the emitted packet (non-enumerable)', () => {
  // Drive the producer itself: 0.4 (band 2) -> 0.45 (band 3) is a genuine climb whose
  // ceil(previousValue*5) lands flat on the boundary — exactly the case only the stamp gets right.
  const state = { player: { heat: 0.4 }, simTime: 10, entities: new Map() };
  const packets = [];
  const bus = { on: () => () => {}, emit: (name, p) => packets.push(p) };
  const system = Object.create(heat);
  system.init({ state, bus });
  system._raise(0.05, 'test climb');
  const pkt = packets.filter((p) => p && p.reason === 'test climb').at(-1);
  assert.ok(pkt, 'the climb emits a heat:changed packet');
  assert.equal(pkt.level, 3);
  assert.equal(pkt.previousValue, 0.4);
  assert.equal(pkt.previousLevel, 2, 'the packet carries the band the value just left');
  assert.equal(Object.keys(pkt).includes('previousLevel'), false,
    'the stamp stays out of enumeration (spread/clonePlain/JSON safe)');
});

test('null payloads never throw', () => {
  const played = [];
  const host = hostWith(played);
  host._onHeatChanged(null);
  host._onHeatChanged(undefined);
  host._onHeatChanged({ level: 2, wanted: true, wantedCrossed: false });
  assert.equal(played.length, 0, 'a packet without previousValue cannot prove a climb');
});
