// SEED-SE-16 — a clip inside the tape but outside the recorded-sound window still exports video.
//
// The theater path is the fast route, not a gate: its rendered-tape machinery refusals must fall
// through to the flight-video encoder, and only a user cancel or a failed file save is terminal.
// No jsdom: the fall-through decision is a pure exported predicate, the refusal object's shape
// is proven against the real exportTheaterClip source (the sound-window miss), and the fallback
// order theater → video-encode → exportClip is pinned by a scoped slice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { theaterRefusalFallsThrough } from '../src/ui/screens/clips.js';

const CLIPS_SRC = readFileSync(new URL('../src/ui/screens/clips.js', import.meta.url), 'utf8');
const THEATER_SRC = readFileSync(new URL('../src/ui/screens/theaterExport.js', import.meta.url), 'utf8');

test('machinery refusals fall through; user-facing outcomes do not', () => {
  assert.equal(theaterRefusalFallsThrough({ ok: false, reason: 'recorded-sound-unavailable', source: 'rendered-tape' }), true,
    'a sound-window miss must reach the video encoder');
  assert.equal(theaterRefusalFallsThrough({ ok: false, reason: 'tape-renderer-unavailable' }), true);
  assert.equal(theaterRefusalFallsThrough({ ok: false, reason: 'video-encoder-unavailable' }), true);
  assert.equal(theaterRefusalFallsThrough({ ok: false, reason: 'cancelled' }), false, 'a user cancel is terminal');
  assert.equal(theaterRefusalFallsThrough({ ok: false, reason: 'file-save-failed' }), false);
  assert.equal(theaterRefusalFallsThrough({ ok: true, status: 'exported' }), false, 'success returns as-is');
  assert.equal(theaterRefusalFallsThrough(null), false, 'no theater at all keeps the legacy fall-through');
});

test('the real sound-window miss returns that exact refusal object', () => {
  const spawn = THEATER_SRC.slice(THEATER_SRC.indexOf('export async function exportTheaterClip'));
  assert.match(spawn, /if \(!pcm\) return \{ ok: false, reason: 'recorded-sound-unavailable', source: 'rendered-tape' \};/,
    'the clip inside the tape but outside the sound window is the pinned refusal');
});

test('the export order is theater, then video-encode, then exportClip', () => {
  const fn = CLIPS_SRC.slice(CLIPS_SRC.indexOf('export async function exportRecordedClip'),
    CLIPS_SRC.indexOf('export async function exportLoggedMoment'));
  const theaterAt = fn.indexOf('exportTheaterClip(clip');
  const encodeAt = fn.indexOf('encodeFlightVideo(clip');
  const exportClipAt = fn.indexOf('return exportClip(clip, options)');
  assert.ok(theaterAt > -1 && encodeAt > theaterAt && exportClipAt > encodeAt,
    'theater → encodeFlightVideo → exportClip, in that order');
  assert.match(fn, /if \(!theaterRefusalFallsThrough\(theater\)\) return theater;/,
    'only the fall-through refusals continue past the theater result');
});
