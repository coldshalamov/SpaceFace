// PULSE-04 — the band carries a schedule's worth of copy: all eight channels hold at least
// sixty authored lines in the existing schema, ids and texts stay globally unique, and every
// line that shipped before the deepening survives byte-identical.
import assert from 'node:assert/strict';
import test from 'node:test';

import * as bandData from '../src/data/bandRadio.js';

const ORIGINAL_LINES = new Map([
  ['concord_01', 'Transit delays resolved through mandatory vessel detention.'],
  ['concord_02', 'No civilians displaced. Housing eligibility was revised.'],
  ['concord_03', 'Atmo allocation remained stable after three sectors closed.'],
  ['concord_04', 'Unregistered wreck removed from public navigation records.'],
  ['concord_05', 'Concord confirms no incident requiring public concern.'],
  ['concord_06', 'Piracy fell after survivor reporting was centralized.'],
  ['concord_07', 'Helios Bay Seven passed review. Criteria remain sealed.'],
  ['concord_08', 'All submitted corrections remain officially received.'],
  ['concord_09', 'Pallas ration surpluses were reclassified as scheduled. Belt Outpost crews remain on standing ration review.'],
  ['margin_01', 'Tessera broke the blockade. Concord reports the lane reopened itself.'],
  ['margin_02', 'A convoy arrived three ships short. Nobody filed missing.'],
  ['margin_03', 'Tessera cleared the lane. Survivors received the invoice.'],
  ['margin_04', 'The Tessera docked with fresh scars and no statement.'],
  ['margin_05', 'Hollow Station counted seventeen hulls. Still no crews.'],
  ['margin_06', 'Tessera dropped a freighter. Prices followed. Someone planned both.'],
  ['margin_07', "Tessera crossed Vale's closure. The people remained inside."],
  ['margin_08', 'If you saw it, send proof. Names protected.'],
  ['margin_09', 'Shaft 7 logged 0.7t moisture loss. Two miners unaccounted. The column is shorter than the names.'],
  ['margin_10', 'R3-CARRIER filter batch: withdrawn year 3, replacement still pending. We are asking why.'],
  ['margin_11', 'The Clear-Air index moved again. Same desk holds the position. We printed the desk.'],
  ['margin_12', 'Division 6 renewed its budget under REF 44-C. No public scope. We are counting the cycles.'],
  ['margin_13', 'Ceres cracks more cells than its own belt burns. The Cut claim crews still ration by mid-shift. The manifests do not add up.'],
  ['static_01', "Reach remembers Tessera's guns. Bring armor, not apologies."],
  ['static_02', 'Concord says seizure. Reach says free salvage.'],
  ['static_03', 'Meridian lost a hauler and found three invoices.'],
  ['static_04', 'Quiet ship passed you. You noticed late.'],
  ['static_05', "Reach knows Tessera's name. Nobody has priced it yet."],
  ['static_06', "Patrol lights off. That's confidence or shame."],
  ['static_07', 'New bounty posted. Old corpse underneath.'],
  ['static_08', 'Tessera drinks free. Anyone objecting can pay in teeth.'],
  ['ballad_01', 'White candles lean where no wind can reach.'],
  ['ballad_02', 'The Pit kept names the ledger lost.'],
  ['ballad_03', 'Borrowed time still pays in scars.'],
  ['ballad_04', 'A tollman smiled; the convoy passed.'],
  ['ballad_05', 'Seventeen sailed; the dark returned their hulls.'],
  ['ballad_06', 'The Thunderchild died. The title crossed the fire.'],
  ['ballad_07', 'Old gates remember every borrowed key.'],
  ['ballad_08', 'Keep one light for ships that cannot answer.'],
  ['vespers_01', 'One voice enters. The Pattern widens.'],
  ['vespers_02', 'Burden becomes offering. Offering becomes ascent.'],
  ['vespers_03', 'The dark is not empty. It listens.'],
  ['vespers_04', 'A broken hull still keeps its note.'],
  ['vespers_05', 'The unrecorded are not the unmade.'],
  ['vespers_06', 'At the seventh interval, release your name.'],
  ['vespers_07', 'The Choir counts no distance between graves.'],
  ['vespers_08', 'Be still. The next chord remembers you.'],
  ['routing_01', 'FOUND: VESSEL. HELD: ROUTE. DELIVERY: PENDING.'],
  ['routing_02', 'UNCLAIMED MASS ENTERED FOR SORTING.'],
  ['routing_03', 'DELAY IS A LOCATION. YOU ARE IN IT.'],
  ['routing_04', 'OWNER FIELD BLANK. CUSTODY REMAINS VALID.'],
  ['routing_05', 'CARGO RING THREE AWAITS A LIVING SIGNATURE.'],
  ['routing_06', 'OBSTRUCTION RECLASSIFIED AS INVENTORY.'],
  ['routing_07', 'ALL DESTINATIONS EXIST UNTIL DELIVERY.'],
  ['routing_08', 'FOUND. HELD. DELIVERED. FOUND AGAIN.'],
  ['numbers_01', 'SEVEN. FOUR. FOUR. HOLD.'],
  ['numbers_02', 'NINE LEFT. TWO RETURNED. SAY NOTHING.'],
  ['numbers_03', 'PALLAS. ZERO-THREE. BLACK WAKE.'],
  ['numbers_04', 'ONE VOICE. SEVENTEEN HULLS. NO NAMES.'],
  ['numbers_05', 'BEARING {bearing}. REPEAT. BEARING {bearing}.'],
  ['numbers_06', 'THE THIRD LIGHT LIES.'],
  ['numbers_07', 'COUNT DOORS, NOT SHIPS.'],
  ['numbers_08', 'CODE ENDS WHEN SOMEONE ANSWERS.'],
  ['numbers_09', 'ELEVEN. TWO. ZERO POINT SEVEN. SAY NOTHING.'],
  ['numbers_10', 'R3. CARRIER. YEAR THREE. STILL WAITING.'],
  ['numbers_11', 'FORTY-ONE. ZERO. COUNT THE DOORS.'],
  ['local_quiessence_01', 'Seventeen intact hulls answer only by staying dark.'],
  ['local_quiessence_02', 'Seventeen carrier IDs answer. No transmitters do.'],
  ['local_quiessence_03', 'The violet buoy pulses between station intervals.'],
  ['local_quiessence_04', 'Memorial channel repeats no names.'],
  ['local_hush_01', 'A world-shaped gap enters the receiver.'],
  ['local_hush_02', 'Carrier absent. Static absent. Nothing to tune.'],
  ['local_hush_03', 'Gain rises. The silence stays level.'],
  ['local_hush_04', "Signal resumes beyond the Hush's orbital shadow."],
  ['local_obelisk_02', 'Carrier bears no callsign. The interval is a countdown.'],
  ['local_obelisk_03', 'Vael patrol chatter drops every word near the anomaly.'],
  ['local_obelisk_04', "The dark companion answers in your hull's own band."],
  ['local_obelisk_05', 'It learned your transponder the first time you looked. It is still answering.'],
  ['local_cathedral_01', 'Nine held hours still answer on this band.'],
  ['local_cathedral_02', 'The Marker survived the hull. It is still marking.'],
  ['local_cathedral_03', 'Scavenger chatter thins every time the bow comes into line.'],
  ['local_cathedral_04', 'Concord claims the bow. The static claims the rest.'],
  ['local_candle_01', 'Twenty-four carriers answer. The twenty-fifth stays dark.'],
  ['local_candle_02', 'Every damaged candle returns to the ledger. The band keeps the count.'],
  ['local_candle_03', 'Families paid for the flames. The flames pay nobody back.'],
  ['local_candle_04', 'The dark plinth answers last. It answers nothing.'],
  ['local_charon_01', 'A colony barge still breathes on the old manifest channel.'],
  ['local_charon_02', 'GARDEN WORLD: the band repeats a destination with no match.'],
  ['local_charon_03', 'The birth records answer three generations late.'],
  ['local_charon_04', 'Air and seed still trade here. Pride does not.'],
]);

test('the band still carries exactly eight channels and each holds a full schedule', () => {
  assert.equal(bandData.BAND_CHANNELS.length, 8);
  assert.equal(bandData.TUNABLE_BAND_CHANNELS.length, 7);
  for (const channel of bandData.BAND_CHANNELS) {
    assert.ok(channel.lines.length >= 60,
      `${channel.id} carries ${channel.lines.length} lines; the schedule needs at least 60`);
  }
});

test('every band line id and text is globally unique', () => {
  const ids = bandData.BAND_CHANNELS.flatMap((channel) => channel.lines.map((line) => line.id));
  assert.equal(new Set(ids).size, ids.length, 'band line ids must be globally unique');
  const texts = bandData.BAND_CHANNELS
    .flatMap((channel) => channel.lines.map((line) => line.text.toLowerCase()));
  assert.equal(new Set(texts).size, texts.length, 'band line texts must be unique, case-insensitive');
});

test('every pre-deepening line survives byte-identical', () => {
  const live = new Map();
  for (const channel of bandData.BAND_CHANNELS) {
    for (const line of channel.lines) live.set(line.id, line.text);
  }
  for (const [id, text] of ORIGINAL_LINES) {
    assert.equal(live.get(id), text, `${id} must still carry its original copy`);
  }
});

test('band copy stays ticker-length and inline-safe', () => {
  for (const channel of bandData.BAND_CHANNELS) {
    for (const line of channel.lines) {
      assert.ok(line.text.length <= 140, `${line.id} exceeds the band ticker length`);
      for (const ch of line.text) {
        const code = ch.codePointAt(0);
        assert.ok(code >= 32 && code !== 127 && code !== 0xFFFD && code !== 0x2028 && code !== 0x2029,
          `${line.id} contains an unsafe or line-breaking character`);
      }
    }
  }
});
