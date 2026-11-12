// MOB-03 — phone captions and toasts never sit on the key cluster, reel or dock, in either hand and at
// any control scale (390x664 portrait and 844x390 landscape, scale 0.8 to 1.6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { seatNote } from '../src/systems/mobile/noteSeat.js';

const rect = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h });
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

// The cluster as the stylesheet lays it out: keys 66/88 px wide times scale, 18 px up, 16 px in.
function cluster(vw, vh, scale, lefty) {
  const w = 160 * scale, h = 100 * scale, bottom = vh - 18, top = bottom - h;
  const left = lefty ? 16 : vw - 16 - w;
  const gun = rect(lefty ? left : left + w - 88 * scale, top, 88 * scale, 88 * scale);
  const tether = rect(lefty ? left + w - 66 * scale : left, bottom - 66 * scale, 66 * scale, 66 * scale);
  const reel = rect(lefty ? left + w + 12 : left - 12 - 84, bottom - 33 * scale + 38 - 152, 84, 152);
  const dock = rect(lefty ? 18 : vw - 18 - 110, top - 14 - 50, 110, 50);
  return [gun, tether, reel, dock];
}

for (const [vw, vh] of [[390, 664], [390, 844], [844, 390]]) {
  for (const lefty of [true, false]) {
    for (const scale of [0.8, 1, 1.3, 1.6]) {
      test(`${vw}x${vh} ${lefty ? 'left' : 'right'}-handed at ${scale}: a note on the keys is moved off them`, () => {
        const blockers = cluster(vw, vh, scale, lefty);
        // The wheel-mode seat in portrait (100 px up) and the short-landscape seat (8 px up), centred.
        const w = Math.min(vw * (vh > vw ? 0.88 : 0.48), 420), h = 36;
        const note = { left: Math.round((vw - w) / 2), top: vh - (vh > vw ? 100 : 8) - h, w, h };
        const seat = seatNote({ vw, vh, note, blockers });
        const final = seat ? { left: seat.left, top: seat.top, w: seat.maxWidth, h } : note;
        for (const b of blockers) {
          assert.ok(!overlaps(rect(final.left, final.top, final.w, final.h), b), `clear of ${JSON.stringify(b)}`);
        }
        assert.ok(final.left >= 0 && final.left + final.w <= vw && final.top >= 0, 'stays on screen');
      });
    }
  }
}

test('a note that is already clear stays where the stylesheet put it', () => {
  assert.equal(seatNote({ vw: 390, vh: 664, note: { left: 20, top: 200, w: 300, h: 30 }, blockers: cluster(390, 664, 1, true) }), null);
});

test('a powers handle near the top does not push a lifted note into it', () => {
  const blockers = [...cluster(390, 664, 1.6, true), rect(0, 8, 48, 60)];
  const note = { left: 41, top: 528, w: 308, h: 36 };
  const seat = seatNote({ vw: 390, vh: 664, note, blockers });
  assert.ok(seat && seat.top > 68 && seat.top < 528, `seated between the handle and the keys (${JSON.stringify(seat)})`);
  for (const b of blockers) assert.ok(!overlaps(rect(seat.left, seat.top, seat.maxWidth, 36), b));
});
