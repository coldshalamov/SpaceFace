// INF-082 — give one fitting a small proving job. The Frame Coupler (massline head:
// a 200-mass tow turns with you) changed towing for real, but no job ever asked for
// it — the capability had no proof. Now the board posts a heavy-tow set piece: a real
// 200-mass core (five times the usual long-tow core) with the coupler named in the
// brief, completable through the existing tow/sling settlement, and structurally
// optional (no chain, no unlock, no progression gate). Settlement itself rides the
// unchanged authored-set-piece owner, covered end-to-end by the pq-152 drives.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTHORED_SET_PIECES,
  MISSION_TYPES,
  authoredSetPieceById,
  buildAuthoredSetPieceOffer,
  validateAuthoredSetPieceCatalog,
} from '../src/data/missions.js';
import { AUTHORED_SET_PIECE_ENCOUNTERS } from '../src/data/encounters/set-piece-authored.js';
import { MODULES } from '../src/data/modules.js';
import { TECH_NODES } from '../src/data/tech.js';

const ROW = authoredSetPieceById('heavy_tow');
const LONG_TOW = authoredSetPieceById('long_tow');

test('the proving job exists on the ordinary authored board', () => {
  assert.ok(ROW, 'heavy_tow row registered');
  assert.equal(ROW.startStationId, 'station_beltout', 'posted at a working board');
  const validation = validateAuthoredSetPieceCatalog();
  assert.equal(validation.ok, true, 'catalog validates at eleven rows: ' + validation.errors.join('; '));
  assert.equal(AUTHORED_SET_PIECES.length, 11, 'catalog grew by exactly this job');
  const offer = buildAuthoredSetPieceOffer('heavy_tow', 7);
  assert.ok(offer && offer.id.includes('heavy_tow'), 'an accept/decline offer builds');
  assert.equal(offer.stationId, 'station_beltout', 'offer carries its board');
  assert.equal(offer.reward_cr, ROW.rewardCr, 'offer pays the row rate');
});

test('the brief names the fitting and its ordinary acquisition', () => {
  assert.match(ROW.brief, /frame coupler/i, 'the capability is named');
  assert.match(ROW.brief, /Tractor Systems/i, 'the tech path is named');
  assert.match(ROW.brief, /shipworks/i, 'the shop path is named');
  const coupler = MODULES.find((m) => m.id === 'mod_frame_coupler_m');
  assert.ok(coupler, 'the named fitting exists');
  assert.equal(coupler.mods && coupler.mods.masslineHeadId, 'frame_coupler', 'it grants the head');
  assert.notEqual(coupler.purchasable, false, 'it is an ordinary shop good');
  assert.ok(Number.isFinite(coupler.price) && coupler.price > 0, 'it has an ordinary price');
  const tech = TECH_NODES.find((t) => t.id === coupler.requiresTech);
  assert.ok(tech, 'its tech exists');
  assert.deepEqual(tech.prereqs || [], [], 'its tech is prereq-free early acquisition');
});

test('the heaviness is a real spawned mass, not a mission buff', () => {
  const piece = AUTHORED_SET_PIECE_ENCOUNTERS.heavy_tow;
  assert.ok(piece, 'the encounter piece exists');
  const core = (piece.actors || []).find((a) => a.role === 'slag_core');
  assert.ok(core, 'a slag core spawns');
  assert.equal(core.mass, 200, 'the coupler\u2019s own number rides the body');
  assert.equal(core.tetherable, true, 'it is towable by the live tether');
  const light = AUTHORED_SET_PIECE_ENCOUNTERS.long_tow.actors.find((a) => a.role === 'slag_core');
  assert.ok(core.mass > light.mass * 2, 'materially heavier than the usual tow');
  assert.deepEqual(ROW.methodHooks, LONG_TOW.methodHooks, 'shared physical verbs, zero special-casing');
  assert.deepEqual(ROW.methods, LONG_TOW.methods, 'settlement runs the existing tow/sling owner');
});

test('declining blocks nothing', () => {
  const type = MISSION_TYPES.find((t) => t.type === 'authored_set_piece');
  assert.equal(type && type.chainable, false, 'no chain to break');
  assert.ok(!ROW.requiresTech && !ROW.unlockId && !ROW.requiresOrigin, 'no progression gate');
  const offer = buildAuthoredSetPieceOffer('heavy_tow', 7);
  assert.equal(offer.expiresAtEpoch, null, 'no expiry trap on an ignored offer');
  assert.ok(!('accepted' in offer) && !('active' in offer), 'an unaccepted offer is pure data');
});
