import test from 'node:test';
import assert from 'node:assert/strict';
import { TRAILER_MOMENTS } from '../src/data/trailerMoments.js';
import { playTrailerScore, bindTrailerScore } from '../src/audio/trailerScore.js';
import { createBus } from '../src/core/eventBus.js';

test('every production trailer moment gets a finite, keyed phrase on the real music destination', () => {
  const notes = [], musicBus = {}, ctx = { state: 'running', currentTime: 7 };
  const owner = { rt: { ctx, musicBus, _scoreIdentity: { bpm: 96 } }, _isMuted: () => false,
    _noteFreq: (_note, octave) => 110 * 2 ** (octave - 2),
    _stuntGridTime: t => t + .125, _playNote: (...args) => notes.push(args) };
  const seen = new Set();
  for (const moment of TRAILER_MOMENTS) {
    const before = notes.length;
    assert.equal(playTrailerScore(owner, moment, seen), true);
    const phrase = notes.slice(before);
    assert.ok(phrase.length >= 3);
    assert.ok(phrase.every(n => n[0] === ctx && n[5] === musicBus && n[6] === null));
    assert.ok(phrase.every(n => n[1] > 10 && n[2] > 0 && n[2] < 2 && n[7] >= 7.125 && n[7] < 10));
    assert.equal(playTrailerScore(owner, moment, seen), false);
  }
});

test('the score listener yields locked/muted contexts and releases its subscriptions', () => {
  const bus = createBus(), notes = [];
  const owner = { bus, rt: { ctx: { state: 'suspended', currentTime: 0 }, musicBus: {} },
    _isMuted: () => false, _noteFreq: () => 440, _playNote: (...args) => notes.push(args) };
  const off = bindTrailerScore(owner), payload = { id: 'eighth_bell' };
  bus.emit('setPiece:staged', payload); assert.equal(notes.length, 0);
  owner.rt.ctx.state = 'running'; owner._isMuted = () => true;
  bus.emit('setPiece:staged', payload); assert.equal(notes.length, 0);
  owner._isMuted = () => false;
  bus.emit('setPiece:staged', payload); assert.equal(notes.length, 3);
  bus.emit('setPiece:staged', payload); assert.equal(notes.length, 3);
  bus.emit('game:newGame'); bus.emit('setPiece:staged', payload); assert.equal(notes.length, 6);
  off(); bus.emit('game:newGame'); bus.emit('setPiece:staged', payload); assert.equal(notes.length, 6);
});
