// PQ-165.01 — every voiced bark captioned; audio-cue table. Seed 16501.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { barkFor } from '../src/data/barks.js';
import { createGameState } from '../src/core/gameState.js';
import { countBarkCorpus } from '../src/audio/barkVoice.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import {
  ACCESSIBILITY_AUDIO_CUE_TABLE,
  CAPTIONS_SEED,
  audioCueCaption,
  captionForBark,
  captionRecordForBarkLine,
  captionRecordsForAllBarkForLines,
  everyVoicedBarkCaptioned,
  resolveAccessibilityCue,
} from '../src/ui/captions.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SEED = CAPTIONS_SEED;

test(`seed ${SEED}: every barkFor() line produces a caption record`, () => {
  assert.equal(everyVoicedBarkCaptioned(), true);
  const records = captionRecordsForAllBarkForLines();
  assert.ok(records.length > 0, 'bark corpus must be non-empty');
  assert.equal(records.length, countBarkCorpus());
  for (const row of records) {
    assert.equal(typeof row.text, 'string');
    assert.ok(row.text.length > 0, `${row.factionId}/${row.situation} empty caption`);
    const again = barkFor(row.factionId, row.situation, row.index);
    assert.equal(captionRecordForBarkLine(again).text, again);
    assert.equal(row.text, again);
  }
  const caption = captionForBark('faction_quiet', 'warn', 0);
  assert.ok(caption.text.length > 0);
  assert.equal(caption.channel, 'bark');
  console.log(`SEED=${SEED} barkCaptions=${records.length}`);
});

test(`seed ${SEED}: cue table for well/taut/telegraph honours audioCues`, () => {
  const state = createGameState(SEED);
  assert.equal(state.settings.accessibility.captions, true);
  assert.equal(state.settings.accessibility.audioCues, true);
  for (const kind of ['well', 'taut', 'telegraph']) {
    const on = resolveAccessibilityCue(kind, true);
    const fromSettings = resolveAccessibilityCue(kind, state.settings);
    const off = resolveAccessibilityCue(kind, false);
    assert.ok(on && on.recipeId, `${kind} cue missing when audioCues true`);
    assert.equal(fromSettings.recipeId, on.recipeId);
    assert.equal(off, null, `${kind} must be silent when audioCues false`);
    assert.ok(ACCESSIBILITY_AUDIO_CUE_TABLE[kind]);
  }
  assert.equal(audioCueCaption('well', true).text, 'Gravity well');
  assert.equal(audioCueCaption('tetherTaut', true).text, 'Line taut');
  assert.equal(audioCueCaption('telegraph', true).text, 'Incoming telegraph');
  assert.equal(audioCueCaption('well', false), null);
  assert.equal(audioCueCaption('taut', false), null);
  assert.equal(audioCueCaption('telegraph', false), null);
  const audioSrc = readFileSync(join(ROOT, 'src/audio/audioSystem.js'), 'utf8');
  for (const kind of ['well', 'taut', 'telegraph']) {
    assert.ok(audioSrc.includes(`_playAccessibilityCue('${kind}'`), `${kind} cue must be wired`);
    const recipeId = ACCESSIBILITY_AUDIO_CUE_TABLE[kind].recipeId;
    assert.ok(RECIPES.some((row) => row.id === recipeId), `${kind} recipe ${recipeId} missing`);
  }
  console.log(`SEED=${SEED} cueOff=null`);
});
