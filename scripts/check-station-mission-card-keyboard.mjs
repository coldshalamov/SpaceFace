#!/usr/bin/env node
// check-station-mission-card-keyboard.mjs — Mission card Enter/Space selection parity
// (UIUX-STATION-MISSION-CARD-KEYBOARD-IMPL-001).
// Static wiring + pure-helper tests: focusable mission rows activate the same select path as a
// body click; nested native action controls do not double-trigger card selection. The live docked
// board is src/ui/station/screens/contracts.js — its rows are native <button> elements, so
// Enter/Space activation and focus come from the platform; the shared helper remains the
// reference contract for any card list that uses focusable role=button cards.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveMissionCardKeyboardSelection } from '../src/ui/station/stationMissionModel.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const contractsSrc = readFileSync(join(ROOT, 'src/ui/station/screens/contracts.js'), 'utf8');

// ── Static: the live board's mission rows are keyboard-reachable native buttons ──
assert.match(contractsSrc, /<button type="button" class="sx-ct-row\$\{[^"]+\}"[^>]*data-mid=/,
  'live mission rows must be native buttons carrying data-mid (keyboard-activatable by default)');
assert.match(contractsSrc, /role="tab"/,
  'live mission rows must expose tab semantics for the dock strip');
assert.match(contractsSrc, /closest\(\s*['"]\[data-mid\]['"]\s*\)/,
  'live board must resolve the activated mission row through data-mid');
console.log('ok   static: live board rows are native buttons resolved through data-mid');

// ── Static: the shared keyboard helper stays direct-testable ─────────────────
assert.match(
  readFileSync(join(ROOT, 'src/ui/station/stationMissionModel.js'), 'utf8'),
  /export function resolveMissionCardKeyboardSelection/,
  'mission card keyboard activation must be a direct-testable helper',
);
console.log('ok   static: shared keyboard helper exported from the station mission model');

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
