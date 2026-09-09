// check-story-beats.mjs — BP-05 story wire minimum (Wave 2).
// B8+ beat fires once on salvage trigger; story comms route through voice arbiter.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { story } from '../src/systems/story.js';
import { POST_SPINE_BEAT_CONTENT } from '../src/data/narrative.js';
import { FACTION_META } from '../src/data/factions.js';
import { VoiceQueue } from '../src/ui/voiceArbiter.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function run(name, fn) {
  fn();
  console.log(`ok   ${name}`);
}

run('Helix Directorate paper faction row exists (zero ships)', () => {
  const helix = FACTION_META.find((f) => f.id === 'faction_helix');
  assert.ok(helix, 'faction_helix missing from FACTION_META');
  assert.equal(helix.fleetClass, 'none');
  assert.equal(helix.homeSectors.length, 0);
});

run('B8 post-spine content registered in narrative.js', () => {
  const b8 = POST_SPINE_BEAT_CONTENT[8];
  assert.ok(b8, 'POST_SPINE_BEAT_CONTENT[8] missing');
  assert.equal(b8.beat, 8);
  assert.ok(b8.comms && b8.comms.includes('story_b8_helix_audit'));
});

run('story _fireComms routes through helpers.voice.say', () => {
  const src = readFileSync(join(ROOT, 'src/systems/story.js'), 'utf8');
  assert.match(src, /helpers\.voice/);
  assert.match(src, /voice\.say\(/);
  assert.match(src, /salvage:communicatorFound/);
  assert.match(src, /_onB8SalvageTrigger/);
});

run('B8 fires once on salvage:communicatorFound trigger', () => {
  const bus = createBus();
  const comms = [];
  const voiceCalls = [];
  const graffiti = [];
  bus.on('comms:popup', (p) => comms.push(p));
  bus.on('graffiti:show', (p) => graffiti.push(p));

  const state = {
    mode: 'flight',
    simTime: 100,
    meta: { seed: 47 },
    story: { beatIndex: 3, flags: {}, phase: 2, seenComms: {} },
    factions: {},
    entities: new Map(),
  };

  const ctx = {
    state,
    bus,
    helpers: {
      voice: {
        say: (msg) => voiceCalls.push(msg),
      },
    },
    registry: { get: () => null },
  };

  story.init(ctx);
  bus.emit('salvage:communicatorFound', {});
  bus.emit('salvage:communicatorFound', {});

  assert.equal(state.story.flags.b8_fired, true);
  const helixPop = comms.filter((p) => p.id === 'story_b8_helix_audit');
  assert.equal(helixPop.length, 1, 'B8 helix audit comms should fire exactly once');
  assert.ok(comms.some((p) => p.id === 'beat_hint_8'), 'B8 captain log hint should fire');
  assert.ok(graffiti.length >= 1, 'B8 graffiti should fire');
  assert.ok(voiceCalls.length >= 2, 'voice arbiter should receive story comms');
  assert.ok(voiceCalls.every((v) => v.channel === 'story' || v.channel === 'info' || v.channel === 'alert'));
});

run('voiceArbiter say accepts object and legacy channel forms', () => {
  const src = readFileSync(join(ROOT, 'src/ui/voiceArbiter.js'), 'utf8');
  assert.match(src, /typeof msgOrChannel === 'string'/);
  const newsSrc = readFileSync(join(ROOT, 'src/ui/marketNews.js'), 'utf8');
  assert.match(newsSrc, /voice\.say\(\{ channel: 'news'/);
});

run('VoiceQueue surfaces only one active voice at a time', () => {
  const q = new VoiceQueue();
  q.enqueue({ channel: 'story', text: 'line A', ttl: 5 }, 0);
  q.enqueue({ channel: 'story', text: 'line B', ttl: 5 }, 0);
  q.enqueue({ channel: 'info', text: 'line C', ttl: 5 }, 0);
  const first = q.step(0);
  assert.ok(first);
  assert.equal(q.active.text, 'line A');
  assert.equal(q.pending.length, 2);
  const second = q.step(1);
  assert.equal(second, null, 'floor still held — no second voice surfaces');
  assert.equal(q.active.text, 'line A');
});

console.log('\nBP-05 story beats: all checks passed.');
