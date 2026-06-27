// check-onboarding.mjs — guards the mid/late-game onboarding contract (goal P1-10).
//
// The first-flight tutorial (5 staged steps) covers flight + first dock/sell. The mid/late systems
// — drill-mining, outfitting, tech tree, automation, claims/bases, crafting — were previously
// un-onboarded, leaving a steep self-serve cliff. P1-10 adds a one-time contextual hint for each,
// fired on the player's first interaction with that system via the player.hints mechanism.
//
// This check pins the contract: every un-onboarded system has a hint wired to its first-use event
// in onboarding.js. A system added later without a hint (or a hint whose trigger event was renamed)
// fails the gate loudly rather than silently re-creating the cliff.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(ROOT, 'src/systems/onboarding.js'), 'utf8');
const wfRest = readFileSync(join(ROOT, 'scripts/wf-rest.js'), 'utf8');

// Each un-onboarded system → the event that fires on first interaction + the hint key that should
// be shown. (The station-hub orientation hint is included too — it's the single biggest cliff.)
const REQUIRED_HINTS = [
  { system: 'station hub orientation', event: "bus.on('dock:docked'", hintKey: "'firstHub'" },
  { system: 'drill-mining',            event: "bus.on('drill:start'",   hintKey: "'firstDrill'" },
  { system: 'outfitting',              event: "bus.on('ui:fitModule'",  hintKey: "'firstOutfit'" },
  { system: 'tech tree',               event: "bus.on('tech:researched'", hintKey: "'firstTech'" },
  { system: 'automation',              event: "bus.on('asset:deployed'", hintKey: "'firstAutomation'" },
  { system: 'claims/bases',            event: "bus.on('claim:claimed'", hintKey: "'firstClaim'" },
  { system: 'crafting',                event: "bus.on('craft:queueChanged'", hintKey: "'firstCraft'" },
];

for (const { system, event, hintKey } of REQUIRED_HINTS) {
  assert.ok(src.includes(event),
    `onboarding.js must subscribe to ${event} (the ${system} first-use event) — otherwise the system is un-onboarded`);
  assert.ok(src.includes(`_showHint(${hintKey}`),
    `onboarding.js must call _showHint(${hintKey}) for ${system} — the contextual hint is missing`);
}

// The _showHint mechanism itself must exist + respect the tutorialHints setting + dedupe via hints.
assert.match(src, /_showHint\(key, text\)/, '_showHint(key, text) must exist (the hint display mechanism)');
assert.match(src, /tutorialHints === false/, '_showHint must respect settings.gameplay.tutorialHints === false');
assert.match(src, /st\.player\.hints\[key\]/, '_showHint must dedupe via state.player.hints[key] (fire-once-per-save)');

// The contextual control bar runs during flight updates, so it must not inspect alert DOM every
// frame. Dock/gate proximity is already available from the physics-owned range events.
assert.match(src, /_dockControlInRange/, 'control bar should track dock range from dock:range events');
assert.match(src, /_gateControlInRange/, 'control bar should track gate range from gate:range events');
assert.match(src, /_controlHintsEl/, 'control bar should cache the #control-hints element');
assert.ok(!src.includes("document.querySelector('.sf-alert--dock')"),
  'control bar must not query the dock alert DOM during flight updates');
assert.ok(!src.includes("document.querySelector('.sf-alert--info')"),
  'control bar must not query the gate alert DOM during flight updates');
assert.match(src, /_storySig/, 'story objective refresh should cache its last rendered content signature');
assert.match(src, /sig === this\._storySig/, 'story objective refresh should skip DOM rebuilds when the objective text is unchanged');

// The default dock binding is E, with Enter accepted only as a secondary convenience in input.js.
// New-player copy must use the live binding label so the first dock objective, first-station hint,
// control bar, alert prompt, help screen, and key handler do not contradict each other.
const dockBindingMentions = src.match(/BINDINGS\.dock\.label/g) || [];
assert.ok(dockBindingMentions.length >= 4,
  'onboarding.js should source dock tutorial/control copy from BINDINGS.dock.label');
const localMapBindingMentions = src.match(/BINDINGS\.localmap\.label/g) || [];
const starMapBindingMentions = src.match(/BINDINGS\.starmap\.label/g) || [];
assert.ok(localMapBindingMentions.length >= 2,
  'onboarding.js should source local-map tutorial/control copy from BINDINGS.localmap.label');
assert.ok(starMapBindingMentions.length >= 3,
  'onboarding.js should source star-map tutorial/control copy from BINDINGS.starmap.label');
for (const staleDockCopy of [/Press Enter at the dock prompt/, /Press ENTER to dock/, /Enter to dock/]) {
  assert.doesNotMatch(src, staleDockCopy,
    `onboarding.js must not use stale hard-coded dock copy: ${staleDockCopy}`);
  assert.doesNotMatch(wfRest, staleDockCopy,
    `wf-rest.js must not teach future agents stale dock copy: ${staleDockCopy}`);
}
assert.match(wfRest, /dock binding from src\/ui\/bindings\.js|UI-owned dock binding is src\/ui\/bindings\.js dock/,
  'wf-rest.js should tell future UI agents to source dock prompts from src/ui/bindings.js');
for (const staleMapCopy of [/Star Map \(M\)/, /N local map/, /M star map/, /M open Star Map/]) {
  assert.doesNotMatch(src, staleMapCopy,
    `onboarding.js must not use stale hard-coded map copy: ${staleMapCopy}`);
}

console.log(`Onboarding OK — ${REQUIRED_HINTS.length} mid/late-game system hints wired (hub, drill, outfit, tech, automation, claims, craft).`);
