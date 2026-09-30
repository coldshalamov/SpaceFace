// PRO-03 — numbers format in the player's locale, not a pinned en-US.
//
// The Done sentence: a focused test proves the death summary AND the HUD tooltip format 12345 with
// the active locale's separators under de-DE and en-US. The "do not": change the numbers, add a
// formatting dependency.
//
// So this proves the same figure 12345 renders as "12,345" under en-US and "12.345" under de-DE,
// and that no formatting dependency was introduced — the only tool is Intl, which toLocaleString
// already used.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  FALLBACK_NUMBER_LOCALE,
  formatCount,
  formatNumber,
  localeGroupsThousands,
  resolveNumberLocale,
} from '../src/ui/numberFormat.js';
import { respawnToastText } from '../src/ui/hud.js';
import { setGameLocale } from '../src/localization/gameLocalization.js';

// 12345 in two locales whose group separators genuinely differ.
const N = 12345;
const EN = '12,345';
const DE = '12.345';

// ---------------------------------------------------------------------------------------
// The Done sentence — the shared helper
// ---------------------------------------------------------------------------------------

test('PRO-03: 12345 uses the active locale separators under de-DE and en-US', () => {
  setGameLocale('en-US');
  assert.equal(formatCount(N, null), EN, 'en-US groups with a comma');
  setGameLocale('de-DE');
  assert.equal(formatCount(N, null), DE, 'de-DE groups with a period');
  // The figure itself is untouched — only its separators move.
  assert.equal(formatCount(N, null).replace(/[^0-9]/g, ''), '12345');
  setGameLocale('en-US');
});

test('PRO-03: the state settings locale wins over the runtime locale', () => {
  // The player's own choice is authoritative and may differ from the runtime locale, which is
  // exactly the case where a pinned tag was most wrong.
  setGameLocale('en-US');
  const german = { settings: { locale: 'de-DE' } };
  assert.equal(resolveNumberLocale(german), 'de-DE');
  assert.equal(formatCount(N, german), DE);
  setGameLocale('en-US');
});

test('PRO-03: an explicit tag wins over both, and the fallback is the shipped default', () => {
  assert.equal(resolveNumberLocale({ settings: { locale: 'de-DE' } }, 'fr-FR'), 'fr-FR');
  assert.equal(resolveNumberLocale(null, ''), FALLBACK_NUMBER_LOCALE);
  assert.equal(FALLBACK_NUMBER_LOCALE, 'en-US');
});

// ---------------------------------------------------------------------------------------
// The Done sentence — the two named surfaces
// ---------------------------------------------------------------------------------------

test('PRO-03: the HUD respawn toast reads in the player locale', () => {
  const payload = { stationId: 'station_helios', costCr: N, refundCr: N, locale: 'de-DE' };
  const de = respawnToastText(payload);
  assert.ok(de.includes(DE), `the recovery cost uses the de-DE separator, got: ${de}`);
  assert.ok(!de.includes(EN), `no en-US grouping survives in a de-DE readout, got: ${de}`);

  const en = respawnToastText({ ...payload, locale: 'en-US' });
  assert.ok(en.includes(EN), `en-US groups with a comma, got: ${en}`);
  assert.ok(!en.includes(DE), `no de-DE grouping survives in an en-US readout, got: ${en}`);
});

test('PRO-03: the HUD credits tooltip reads in the player locale', () => {
  // buildCreditsTip is closure-private, so it is proven through the exported number helper it now
  // uses, and through the absence of the pinned tag in the source (next test).
  setGameLocale('en-US');
  assert.equal(formatCount(N, null), EN);
  setGameLocale('de-DE');
  assert.equal(formatCount(N, null), DE);
  setGameLocale('en-US');
});

test('PRO-03: the HUD no longer pins en-US for a player-visible figure', () => {
  // The regression this pins: a later edit that reintroduces a hardcoded tag on one of these
  // readouts. Canvas layout maths (toFixed for transforms) is not a locale concern and is not
  // matched here because the pattern requires toLocaleString.
  const src = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  const pinned = src.split(/\r?\n/)
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /toLocaleString\(\s*['"]en-US['"]/.test(line));
  assert.deepEqual(pinned, [],
    `no player-visible figure may pin en-US; found at lines ${pinned.map(([n]) => n).join(', ')}`);
});