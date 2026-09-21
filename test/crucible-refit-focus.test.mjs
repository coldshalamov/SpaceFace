// INF-060 — the Crucible refit answers a controller. The shared gamepad layer already walks DOM
// focus spatially and clicks with A (ui/input.js moveFocus/activateFocused, scoped to the active
// screen), and pad B respects the screen's locked flag so a paused run cannot be popped by
// accident. What the refit itself lacked: every refresh() wiped the rows (destroying focus and
// resetting every spare picker to its first option — acting on hardpoint 1 silently reset
// hardpoint 2's pick), nothing scrolled a focused row into the scroll column, and only Escape
// worked from the keyboard. These tests pin the spare-choice guard as a pure contract and the
// wiring — focus capture/restore across the row rebuild, scroll-to-focused, the keyboard row
// walk, and the modal gating that keeps input away from flight.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  crucibleRefitScreen,
  crucibleDraftScreen,
  rememberedSpareChoice,
} from '../src/ui/screens/crucibleDraft.js';

const OPTIONS = [
  { instanceId: 11, label: 'Pulse Laser S' },
  { instanceId: 22, label: 'Scattergun' },
  { instanceId: 33, label: 'Salvage Rig' },
];

test('the remembered spare is honored while it fits and pruned when it does not', () => {
  assert.equal(rememberedSpareChoice(OPTIONS, 22), '22', 'the player\u2019s pick survives a rebuild');
  assert.equal(rememberedSpareChoice(OPTIONS, '33'), '33', 'string ids match by value');
  assert.equal(rememberedSpareChoice(OPTIONS, 99), null, 'a consumed/unfittable pick is pruned, not reset to option 1');
  assert.equal(rememberedSpareChoice(OPTIONS, null), null);
  assert.equal(rememberedSpareChoice([], 22), null);
});

test('both surfaces stay modal: locked, dialog-announced, and the pad back respects the lock', () => {
  assert.deepEqual(crucibleRefitScreen.data, { locked: true }, 'the paused run must not be popped by pad B');
  assert.deepEqual(crucibleDraftScreen.data, { locked: true });
  const source = readFileSync(new URL('../src/ui/screens/crucibleDraft.js', import.meta.url), 'utf8');
  assert.ok(source.includes("rootEl.setAttribute('aria-modal', 'true')"), 'both surfaces announce the modal');
  // The pad cancel path in the shared UI layer pops only unlocked screens — the lock above is
  // what keeps an accidental B from abandoning the run.
  const inputSource = readFileSync(new URL('../src/ui/input.js', import.meta.url), 'utf8');
  assert.match(inputSource, /if \(!screenManager\.locked \|\| !screenManager\.locked\(\)\) screenManager\.popScreen\(\)/,
    'pad cancel must respect the locked screen');
});

test('the refit rebuild restores focus and the chosen spare instead of resetting them', () => {
  const source = readFileSync(new URL('../src/ui/screens/crucibleDraft.js', import.meta.url), 'utf8');
  // Focus is captured before the row wipe and restore is attempted after it.
  const refitRefresh = source.slice(source.indexOf('refresh(ctx) {', source.indexOf('crucibleRefitScreen')));
  assert.ok(refitRefresh.includes('focusedControlId(rootEl)'), 'the rebuild captures where focus was');
  assert.ok(refitRefresh.includes('restoreFocusedControl(rootEl, savedFocus)'), 'the rebuild restores the player\u2019s place');
  // The spare picker is seeded from the remembered choice, which updates on change.
  assert.ok(refitRefresh.includes('rememberedSpareChoice(lines.options, this._spareChoice.get(row.slotIndex))'),
    'the select is seeded from the remembered choice');
  assert.ok(refitRefresh.includes("this._spareChoice.set(row.slotIndex, pick.value)"), 'edits are remembered');
  assert.ok(source.includes('this._spareChoice = new Map()'), 'the choice memory lives on the screen instance');
});

test('scroll-to-focused and the keyboard row walk are wired on the refit', () => {
  const source = readFileSync(new URL('../src/ui/screens/crucibleDraft.js', import.meta.url), 'utf8');
  assert.match(source, /focusin[\s\S]{0,120}scrollIntoView\(\{ block: 'nearest' \}\)/,
    'a focus move into the scroll column brings the row into view');
  assert.match(source, /ArrowUp' \|\| event\.key === 'ArrowDown'/, 'keyboard Up/Down walk the rows');
  assert.match(source, /active\.tagName === 'SELECT'\) return/, 'a focused select keeps its native arrows');
  // The draft's rebuild keeps the player on the same offer instead of the first card.
  assert.match(source, /savedFocus = focusedControlId\(rootEl\)/, 'the draft captures focus across its card rebuild');
  assert.match(source, /restoreFocusedControl\(rootEl, savedFocus\)/, 'both surfaces restore, not just the refit');
});
