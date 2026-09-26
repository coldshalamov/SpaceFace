// Deep-faction voice coverage (INFERENCE-13).
//
// The five K1-route factions — Archive, Fulfillment, Pitborn, Understory, Verge-Layer — used to
// fall through every faction-keyed voice/corpus table into the Frontier fallback, so a Pitborn
// yard scrapper opened with the same words and voice as an independent free-trader. These tests
// pin the live path: corpus → barkDirector → barkDirector:voice → resolveBarkVoice → register,
// plus the event-line families (history, witness, pursuit, surrender, escape, hull, stunt, bar).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BARKS,
  BARK_FACTIONS,
  BARK_SITUATIONS,
  barkFor,
  hullRecognitionBarkFor,
  historyBarkFor,
  witnessCrimeBarkFor,
  pursuitBarkFor,
  surrenderBarkFor,
  escapeTauntBarkFor,
  barGreetingBarkFor,
  barApproachBarkFor,
} from '../src/data/barks.js';
import {
  BARK_CORPUS_TARGET,
  FACTION_VOICE_REGISTERS,
  enumerateDeliveredBarkWavs,
  resolveBarkVoice,
} from '../src/audio/barkVoice.js';
import { SAMPLE_MANIFEST } from '../src/audio/sampleLibrary.js';
import { STUNT_BARKS, stuntRecognitionBarkFor } from '../src/systems/barkDirector.js';
import { createSimulation } from '../src/core/sim.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEEP = [
  'faction_archive',
  'faction_fulfillment',
  'faction_pitborn',
  'faction_understory',
  'faction_verge_layers',
];

// ── Live-route evidence: the five K1 authored encounters carry the corpus faction ids ──────────

test('the five deep factions are live: K1 encounters carry matching factionId values', () => {
  const encounters = {
    faction_pitborn: 'src/data/encounters/200-k1-pitborn-yard.js',
    faction_archive: 'src/data/encounters/190-k1-archive-reading-room.js',
    faction_fulfillment: 'src/data/encounters/180-k1-fulfillment-fixed-route.js',
    faction_understory: 'src/data/encounters/170-k1-understory-salvager.js',
    faction_verge_layers: 'src/data/encounters/210-k1-verge-observer-prism.js',
  };
  for (const [factionId, rel] of Object.entries(encounters)) {
    const src = readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(src.includes(`factionId: '${factionId}'`), `${rel} must carry ${factionId}`);
    assert.ok(BARK_FACTIONS.includes(factionId), `${factionId} must be in BARK_FACTIONS`);
  }
});

// ── Corpus: every situation is authored in-faction, none collapse to Frontier ──────────────────

test('each deep faction authors all eight core situations plus distress', () => {
  for (const id of DEEP) {
    const pack = BARKS[id];
    assert.ok(pack, `${id} missing from BARKS`);
    for (const situation of [...BARK_SITUATIONS, 'distress']) {
      const lines = pack[situation];
      assert.ok(Array.isArray(lines) && lines.length >= 4, `${id}.${situation} needs ≥4 authored lines`);
      for (const line of lines) {
        assert.ok(!(BARKS.faction_free[situation] || []).includes(line),
          `${id}.${situation} borrows a Frontier line: ${line}`);
      }
    }
    // barkFor stays in-house across the whole deterministic index space.
    for (const situation of BARK_SITUATIONS) {
      const line = barkFor(id, situation, 7);
      assert.ok(pack[situation].includes(line), `${id}.${situation} barkFor escaped the pack`);
    }
  }
});

// ── Voice registers: each deep faction resolves to its own register, never the Frontier body ────

test('resolveBarkVoice maps each deep faction to its own register with a shipped sample', () => {
  const seen = new Set();
  for (const id of DEEP) {
    const row = resolveBarkVoice({ factionId: id, situation: 'warn' });
    assert.equal(row.factionId, id);
    assert.equal(row.registerId, id, `${id} must resolve its own register, got ${row.registerId}`);
    assert.notEqual(row.registerId, 'faction_free', `${id} must not fall back to Frontier`);
    const register = FACTION_VOICE_REGISTERS[id];
    assert.equal(row.speech.f0, register.f0);
    const entry = SAMPLE_MANIFEST.get(register.sampleId);
    assert.ok(entry, `${register.sampleId} missing from SAMPLE_MANIFEST`);
    assert.ok(existsSync(path.join(ROOT, entry.file)), `${entry.file} missing on disk`);
    seen.add(register.f0);
  }
  // Registers are distinguishable: no two deep houses share a fundamental, and none collides
  // with an existing house (blind-identification tolerance is <3 Hz).
  assert.equal(seen.size, DEEP.length);
  const all = BARK_FACTIONS.map((id) => FACTION_VOICE_REGISTERS[id].f0).sort((a, b) => a - b);
  for (let i = 1; i < all.length; i++) {
    assert.ok(all[i] - all[i - 1] >= 5, `register fundamentals too close: ${all[i - 1]} vs ${all[i]}`);
  }
});

test('delivered corpus covers all deep-faction lines as on-disk WAVs', () => {
  const rows = enumerateDeliveredBarkWavs();
  assert.equal(rows.length, BARK_CORPUS_TARGET);
  const byFaction = new Map();
  for (const row of rows) {
    byFaction.set(row.factionId, (byFaction.get(row.factionId) || 0) + 1);
    assert.ok(existsSync(path.join(ROOT, row.file)), `${row.file} missing`);
  }
  for (const id of DEEP) {
    assert.ok((byFaction.get(id) || 0) >= 32, `${id} must deliver ≥32 line WAVs, got ${byFaction.get(id)}`);
  }
});

// ── Event-line families: recognition, law cadence, and stunt all speak in-faction ───────────────

test('event-line families resolve authored deep-faction lines', () => {
  for (const id of DEEP) {
    const hull = hullRecognitionBarkFor(id, 0, { ship: 'Kestrel', class: 'frigate' });
    assert.ok(hull.includes('Kestrel'), `${id} hull line must fill {ship}: ${hull}`);

    const history = historyBarkFor(id, {
      hasHistory: true,
      captains: [{ name: 'Vey Senna', stance: 'hunts' }],
      kills: 4,
    }, 0);
    assert.ok(history.includes('Vey Senna'), `${id} history line must name the captain: ${history}`);

    for (const [label, fn] of [
      ['witness', witnessCrimeBarkFor],
      ['pursuit', pursuitBarkFor],
      ['surrender', surrenderBarkFor],
      ['escape', escapeTauntBarkFor],
    ]) {
      const line = fn(id, 0);
      assert.ok(typeof line === 'string' && line.length > 8, `${id} ${label} line missing`);
      // Contrast: the deep-faction line is not any Frontier line — the old failure mode.
      assert.ok(!/friend|lane's a long|out here, friend/i.test(line) || id === 'faction_pitborn',
        `${id} ${label} reads like generic Frontier`);
    }

    assert.ok(Array.isArray(STUNT_BARKS[id]) && STUNT_BARKS[id].length >= 4, `${id} stunt pack missing`);
    const stunt = stuntRecognitionBarkFor(id, 1, { title: 'Void Hook' });
    assert.ok(stunt.includes('Void Hook'), `${id} stunt line must fill {title}: ${stunt}`);
  }
});

// ── Bar contacts: generated contacts in deep-faction space greet in their own register ──────────

test('generated bar contacts in deep-faction space voice their own house', () => {
  for (const id of DEEP) {
    const greeting = barGreetingBarkFor(id, 'barkeep', 0);
    const approach = barApproachBarkFor(id, 2);
    assert.ok(greeting && greeting.length > 4, `${id} bar greeting missing`);
    assert.ok(approach && approach.length > 4, `${id} bar approach missing`);
    assert.notEqual(greeting, barGreetingBarkFor('faction_free', 'barkeep', 0),
      `${id} barkeep greeting must not reuse the Frontier line`);
    assert.notEqual(approach, barApproachBarkFor('faction_free', 2),
      `${id} approach must not reuse the Frontier line`);
  }
});

// ── Live owner path: barkDirector._speak emits faction-voiced payloads for deep-faction ships ────

test('barkDirector speaks a pitborn ship in the pitborn register, through the live emit', () => {
  const sim = createSimulation({ seed: 1313, systems: [barkDirector, voiceArbiter] });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 220, hullMax: 220, radius: 10,
    data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  const contact = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_pitborn', pos: { x: 260, z: 0 },
    hull: 90, hullMax: 90, radius: 8,
    data: { ai: { fsm: 'pursue', archetype: 'pirate_raider', hostileTeams: [0] }, combat: { targetId: player.id } },
  });

  const voices = [];
  bus.on('barkDirector:voice', (p) => voices.push(p));
  // The flee event seam is a live emit: ai:flee → barkDirector → voiceArbiter → barkDirector:voice.
  bus.emit('ai:flee', { entityId: contact.id });
  assert.equal(voices.length, 1, 'ai:flee on a pitborn ship emits one bark receipt');
  assert.equal(voices[0].factionId, 'faction_pitborn');
  assert.equal(voices[0].situation, 'flee');
  assert.ok(BARKS.faction_pitborn.flee.includes(voices[0].text),
    `emitted line must come from the pitborn pack, got: ${voices[0].text}`);
  const resolved = resolveBarkVoice({ factionId: voices[0].factionId, situation: 'flee', line: voices[0].text });
  assert.equal(resolved.registerId, 'faction_pitborn');
  assert.equal(resolved.sampleId, 'bark_pitborn');
});
