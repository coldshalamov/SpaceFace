#!/usr/bin/env node
// check-station-mission-card-keyboard.mjs — Mission card Enter/Space selection parity
// (UIUX-STATION-MISSION-CARD-KEYBOARD-IMPL-001).
// Static wiring + pure-helper tests: focusable cards activate the same select path as click;
// Space is preventDefault'd; nested Accept buttons do not double-trigger card selection.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveMissionCardKeyboardSelection } from '../src/ui/screens/stationHub.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const hubSrc = readFileSync(join(ROOT, 'src/ui/screens/stationHub.js'), 'utf8');

// ── Static: focusable button semantics + shared keyboard path ────────────────
assert.match(hubSrc, /export function resolveMissionCardKeyboardSelection/,
  'mission card keyboard activation must be a direct-testable helper');
assert.match(hubSrc, /card\.setAttribute\(\s*['"]role['"]\s*,\s*['"]button['"]\s*\)/,
  'mission cards must expose role=button');
assert.match(hubSrc, /card\.setAttribute\(\s*['"]tabindex['"]\s*,\s*['"]0['"]\s*\)/,
  'mission cards must be keyboard-focusable (tabindex=0)');
assert.match(hubSrc, /list\.addEventListener\(\s*['"]keydown['"]\s*,\s*handleMissionCardKeydown\s*\)/,
  'mission list must listen for keydown on cards');
assert.match(hubSrc, /const selectMissionCard\s*=/,
  'pointer + keyboard must share a selectMissionCard helper');
assert.match(hubSrc, /selectMissionCard\(resolved\.missionId\)/,
  'keyboard path must call the shared selectMissionCard helper');
assert.match(hubSrc, /selectMissionCard\(card\.getAttribute\(['"]data-mid['"]\)\)/,
  'pointer body-click path must call the shared selectMissionCard helper');
assert.match(hubSrc, /ev\.preventDefault\(\)/,
  'keyboard activation must preventDefault (Space no-scroll)');
assert.match(hubSrc, /resolveMissionCardKeyboardSelection\(ev\)/,
  'keydown handler must gate via resolveMissionCardKeyboardSelection');
console.log('ok   static: role=button, shared select, keydown + preventDefault wired');

// ── Pure helper: Enter / Space on the card itself ────────────────────────────
function makeCard(mid = 'm_alpha') {
  return {
    classList: { contains: (c) => c === 'st-mission-card' },
    getAttribute(name) {
      if (name === 'data-mid') return mid;
      return null;
    },
    closest(sel) {
      if (sel === '.st-mission-card') return this;
      return null;
    },
  };
}

function makeNestedButton(card) {
  return {
    closest(sel) {
      if (sel === '.st-mission-card') return card;
      if (sel === 'button' || /button/.test(sel)) return this;
      return null;
    },
  };
}

{
  const card = makeCard('m_enter');
  const got = resolveMissionCardKeyboardSelection({ key: 'Enter', target: card });
  assert.deepEqual(got, { missionId: 'm_enter' }, 'Enter on focused card selects that mission');
}
{
  const card = makeCard('m_space');
  const got = resolveMissionCardKeyboardSelection({ key: ' ', target: card });
  assert.deepEqual(got, { missionId: 'm_space' }, 'Space on focused card selects that mission');
}
{
  const card = makeCard('m_other');
  assert.equal(
    resolveMissionCardKeyboardSelection({ key: 'ArrowDown', target: card }),
    null,
    'non-activation keys must not select',
  );
  assert.equal(
    resolveMissionCardKeyboardSelection({ key: 'Escape', target: card }),
    null,
    'Escape must not select',
  );
}
console.log('ok   helper: Enter/Space on card → missionId; other keys ignored');

// ── Nested Accept (native button): no double card selection ──────────────────
{
  const card = makeCard('m_nested');
  const accept = makeNestedButton(card);
  assert.equal(
    resolveMissionCardKeyboardSelection({ key: 'Enter', target: accept }),
    null,
    'Enter on nested Accept must not re-select the card',
  );
  assert.equal(
    resolveMissionCardKeyboardSelection({ key: ' ', target: accept }),
    null,
    'Space on nested Accept must not re-select the card',
  );
}
console.log('ok   helper: nested native Accept does not double-trigger card selection');

// ── Empty / missing data-mid ─────────────────────────────────────────────────
{
  const bare = {
    closest(sel) { return sel === '.st-mission-card' ? this : null; },
    getAttribute() { return null; },
  };
  assert.equal(
    resolveMissionCardKeyboardSelection({ key: 'Enter', target: bare }),
    null,
    'card without data-mid must not activate',
  );
  assert.equal(
    resolveMissionCardKeyboardSelection({ key: 'Enter', target: null }),
    null,
    'null target is a no-op',
  );
}
console.log('ok   helper: missing mid / null target are no-ops');

console.log('Station mission-card keyboard OK: Enter/Space parity + nested-button isolation');
