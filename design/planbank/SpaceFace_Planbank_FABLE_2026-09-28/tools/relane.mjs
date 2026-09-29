// Fifth-run fixup: THE RELEASE is parked (FINISH_LANES.md §12, owner 2026-09-27), so no packet may carry it.
// Each packet moves to the live lane whose bar it serves. Idempotent; prints the count moved.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAP = {
  'dead-settings-controls-do-something': 'THE INSTRUMENT',
  'video-and-audio-options-reach-parity': 'THE INSTRUMENT',
  'machine-locales-are-labelled-previews': 'THE INSTRUMENT',
  'out-of-fuel-has-a-door': 'THE WORLD',
  'statistics-counters-exist-in-the-sim': 'THE LONG GAME',
  'ironman-is-one-way': 'THE LONG GAME',
  'export-bundles-medals-and-records': 'THE MACHINE',
  'the-electron-shell-remembers-the-window': 'THE MACHINE',
  'save-fuzz-never-throws': 'THE MACHINE',
  'quota-pressure-keeps-one-recovery': 'THE MACHINE',
  'onboarding-and-pad-settings-survive-save': 'THE MACHINE',
  'migration-ladder-from-v1': 'THE MACHINE',
  'focus-loss-can-mute-and-pause': 'THE MACHINE',
  'a-stuck-ship-can-ask-for-a-tow': 'THE HAND',
  'every-cue-is-captioned': 'THE EAR',
};

let moved = 0;
for (const f of ['bank/packets-15-professional.mjs', 'bank/packets-20-more.mjs']) {
  const full = path.join(HERE, f);
  let s = fs.readFileSync(full, 'utf8');
  for (const [slug, lane] of Object.entries(MAP)) {
    const re = new RegExp(`(slug: '${slug}'[\\s\\S]{0,400}?lane: )'THE RELEASE'`);
    if (re.test(s)) { s = s.replace(re, `$1'${lane}'`); moved += 1; }
  }
  fs.writeFileSync(full, s);
}
console.log(`relaned ${moved} packets`);
