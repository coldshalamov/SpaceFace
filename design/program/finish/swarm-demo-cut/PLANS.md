<!-- LIFETIME: ACTIVE_PROGRAM -->
# Swarm Demo Cut — implementation plans

> **For the implementing agent:** read [`README.md`](./README.md) first — §2 (the taste bar) is
> the acceptance standard for every plan below. Execute one plan at a time, task by task. Each
> task is test-first where the behaviour is logic, and screenshot-first where it is look.

**Goal:** make Crucible Swarm a one-press, readable, juicy, classic horde mode the owner can demo
live on his laptop.

**Architecture:** almost everything already exists — Swarm rules (`src/data/swarmMode.js`), the
Brood population (`src/systems/swarmBrood.js`, `src/render/broodPresentation.js`), the chain and
juice owners (`src/systems/swarmChain.js`, `src/systems/swarmJuice.js`), a three-offer draft
(`offerDraft` in `src/data/survivalDraft.js`), authored verb cards (`src/data/swarmDraft.js`), room
legendaries (`src/systems/swarmLegendaries.js`), and the Iron Maw physics boss
(`src/data/encounters/capital-boss/iron-maw.js`). The plans gate, re-present, retune and connect
them. Two small shared pieces are introduced and reused: a pure Swarm screen policy
(`src/ui/swarmGlass.js`, Plan 1) and a demo-run profile (`src/data/swarmDemoProfile.js`, Plan 3).

**Tech stack:** plain ES modules, `node:test` + `node:assert/strict` (`node --test <file>`),
Three.js render side, DOM UI, the sim may run in a worker (`?simLane=worker` is default on some
routes — UI reads the mirrored state, never the worker's).

---

## Rules every plan follows

1. **Shared checkout.** Before editing: `git status --short` and read `design/program/NOW.md`.
   Others may be editing the same files (on 2026-11-05 `src/ui/orrery/flightCluster.js`,
   `hudAdapter.js`, `power-railLayouts.js` and many `src/render/*` files were dirty from other
   work). Read the current diff of any file you need; preserve foreign hunks. Stage exact paths
   only (`git add -- <path>`), never `-A`; commit with `git commit -- <paths>`; never reset, stash,
   clean or force-push.
2. **Ordinary route.** Every result must show up on title → Swarm (Plan 3) or title → Crucible →
   Quick play. No dev flag, lab screen or test-only path counts.
3. **No per-frame cost.** Nothing new allocates per frame or scans every entity per frame. If a
   task changes per-frame work, record a matched before/after on the laptop (alternate the two
   builds in one session) in the commit body.
4. **Adventure is untouched.** Every change is gated to a live Swarm run (`state.run.kind ===
   'survival'` and `isSwarmRuleset(state.run.ruleset)`). Add a test that proves Adventure
   behaviour is unchanged wherever you add a gate.
5. **Determinism.** Sim code uses `state.rng` / `state.simTime`, never `Math.random`/`Date.now`.
   Never re-record `test/*.expected.json` goldens to pass.
6. **Look proof.** For any visible change: shoot before/after with the real screen
   (`node scripts/ui-bench.mjs --shot=<id>` for screens; for the live round, boot `npm start` /
   the `spaceface` preview, title → Swarm, with the Browser pane **visible** — a hidden pane
   throttles to ~1 fps and stalls loading at 87.8%). Open every PNG and judge it against README
   §2 line by line. Save under `.devshots/swarm-demo-cut/<plan>/`.
7. **Words.** Any player-facing string goes through the localization catalog the surrounding code
   already uses; run the catalog regeneration the repo uses for new strings
   (`npm run` script names: search `package.json` for `loc:`).
8. **Commit message** names the player outcome, e.g. `swarm: no story chatter during a round`.

---

## Plan 1 — Quiet screen

**Player outcome:** during a Swarm round a spectator sees only the fight, the chain number, round
progress, hull/shield, a six-icon power bar, radar, and at most three short callouts.

**Allowed paths:** `src/ui/swarmGlass.js` (new), `src/ui/hudAttention.js`, `src/ui/comms.js`,
`src/ui/captions.js`, `src/ui/toasts.js`, `src/ui/stuntCallout.js`, `src/ui/masslineHud.js`,
`src/ui/targetPanel.js`, `src/ui/discoveryPlate.js`, `src/ui/hud.js` (only the Swarm gates
described), `test/swarm-glass*.test.mjs` (new).
**Coordinate first (others were editing):** `src/ui/orrery/*` power rail. Do Task 6 last and only
after reading the current diff.
**Do not touch:** `src/systems/barkDirector.js`, `src/systems/faction_archive.js` — they are
Adventure owners; silence them at the glass, not at the source.

### Task 1: the Swarm screen policy (pure)

**Files:** Create `src/ui/swarmGlass.js`; Test `test/swarm-glass.test.mjs`.

**Step 1 — failing test:**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSwarmGlass, swarmGlassAdmits, swarmCalloutText, SWARM_CALLOUT_MAX } from '../src/ui/swarmGlass.js';

const swarm = { run: { kind: 'survival', ruleset: 'swarm', phase: 'active' } };
const adventure = { run: null };

test('Swarm glass is on only for a live Swarm run', () => {
  assert.equal(isSwarmGlass(swarm), true);
  assert.equal(isSwarmGlass(adventure), false);
  assert.equal(isSwarmGlass({ run: { kind: 'survival', ruleset: 'scored', phase: 'active' } }), false);
  assert.equal(isSwarmGlass({ run: { kind: 'survival', ruleset: 'swarm', phase: 'inactive' } }), false);
});

test('story, chatter, news, discovery and diagnostics never reach the Swarm glass', () => {
  for (const source of ['bark', 'chatter', 'news', 'comms', 'faction', 'codex', 'landmark', 'contract', 'massline-detail', 'target-card', 'physics-log']) {
    assert.equal(swarmGlassAdmits(swarm, { source }), false, source);
  }
});

test('the fight sources still reach it', () => {
  for (const source of ['swarm-callout', 'boss', 'danger', 'round']) {
    assert.equal(swarmGlassAdmits(swarm, { source }), true, source);
  }
});

test('outside Swarm nothing changes', () => {
  assert.equal(swarmGlassAdmits(adventure, { source: 'bark' }), true);
});

test('callouts are three words or fewer, plain, uppercase', () => {
  assert.equal(SWARM_CALLOUT_MAX, 3);
  assert.equal(swarmCalloutText('PILE-UP ×7'), 'PILE-UP ×7');
  assert.equal(swarmCalloutText('LINE RELEASED 16T — MESSY'), null);   // jargon + 5 tokens
  assert.equal(swarmCalloutText('Clean snag 93'), null);                // a number nobody understands
  assert.equal(swarmCalloutText('double kill'), 'DOUBLE KILL');
});
```

**Step 2:** `node --test test/swarm-glass.test.mjs` → FAIL (module missing).

**Step 3 — implement:**

```js
// The Swarm glass (design/program/finish/swarm-demo-cut/README.md §2). Pure: which on-screen
// sources a live Swarm round may show. Adventure is untouched — every rule returns "admit"
// outside a live Swarm run.
import { isSwarmRuleset } from '../systems/survivalSwarm.js';

export const SWARM_CALLOUT_MAX = 3;          // visible at once
export const SWARM_CALLOUT_WORDS = 3;        // words per callout

const FIGHT_SOURCES = new Set(['swarm-callout', 'boss', 'danger', 'round']);
// Words a spectator cannot read. A callout carrying any of these is dropped, not rewritten.
const JARGON = /\b(snag|messy|window|logged|mass|tonn|winch|strain|payload|ride|budge|shunted)\b|\d+\s*t\b/i;
// "×7" is allowed (a count); a bare score-like number is not.
const BARE_NUMBER = /(^|\s)\d{2,}(\s|$)/;

export function isSwarmGlass(state) {
  const run = state && state.run;
  return !!(run && run.kind === 'survival' && run.phase !== 'inactive' && isSwarmRuleset(run.ruleset));
}

export function swarmGlassAdmits(state, { source = '' } = {}) {
  if (!isSwarmGlass(state)) return true;
  return FIGHT_SOURCES.has(String(source));
}

/** The callout as shown, or null when it breaks the budget. */
export function swarmCalloutText(text) {
  const line = String(text || '').replace(/\s+/g, ' ').trim();
  if (!line || JARGON.test(line) || BARE_NUMBER.test(line)) return null;
  const words = line.split(' ').filter((w) => !/^[—–-]$/.test(w));
  if (words.length > SWARM_CALLOUT_WORDS) return null;
  return line.toUpperCase();
}
```

**Step 4:** run the test → PASS. **Step 5:** commit `swarm: one screen policy for a live round`.

### Task 2: chatter, news and comms stay off the Swarm glass

**Files:** `src/ui/comms.js` (top-right feed; consumes `comms:popup`), `src/ui/captions.js`
(top-center ambient line), `src/ui/hudAttention.js` (`admitReceipt`), `src/ui/toasts.js`.

1. Test first (`test/swarm-glass-surfaces.test.mjs`): call `admitReceipt({ text: 'Cargo recovery
   notice: bounty after the spill.', kind: 'info', state: swarmState })` and expect
   `{ admit:false, reason:'swarm-glass' }`; same call with an Adventure state keeps today's
   result. Add the same pair for a `kind:'stunt'` jargon line ("CLEAN SNAG 93") → refused in
   Swarm.
2. In `admitReceipt`, first line after the empty check: `if (isSwarmGlass(state) && !swarmGlassAdmits(state, { source: channel || kind })) return { admit: false, reason: 'swarm-glass' };`
   Stunt receipts in Swarm must also pass `swarmCalloutText`.
3. In `comms.js` and `captions.js`, find the handler that renders an incoming popup/caption and
   return early when `isSwarmGlass(state)` and the source is not a fight source. Read how each
   module gets `state` (most receive it at mount); do not import a global.
4. Toasts: the world's "Landmark identified" toast (`src/systems/world.js` emits it) and
   `discoveryPlate.js` ("NEW CODEX ENTRY") must not render in Swarm — gate in the UI renderers.
5. Verify the voice path too: if a bark plays audio (`barkDirector:voice`), find the audio
   consumer and mute non-fight voice in Swarm the same way. Boss barks (`capitalBoss`) stay.

**Look check:** live round 1 for 60 s → zero lines in the top-right feed, zero top-center
ambient lines, zero codex/landmark plates. Screenshot at 10 s, 30 s, 60 s.

### Task 3: the left jargon stack and Line diagnostics

**Files:** `src/ui/stuntCallout.js` (IMPACT LOGGED, CLEAN SNAG, RIDE, ARENA: SHUNTED stack),
`src/ui/masslineHud.js` ("MASS 16 · SWINGS LOOSE", "MASS 48672 · WON'T BUDGE", "LINE · Wasp /
Release read uncertain · wait / Line details", payload/strain plate, "LINE I · 261.7 T / 20 T").

- In Swarm, `stuntCallout` sends its moments to the Swarm callout lane (Plan 7 owns the look)
  only when `swarmCalloutText()` accepts the text; otherwise it draws nothing. "IMPACT LOGGED —
  n" never draws in Swarm.
- In Swarm, `masslineHud` shows **only**: the rope itself, the release diamond, and a single
  plain word at the target when it matters (`GRAB`, `TOO HEAVY`). No mass numbers, no payload
  plate, no detail panel, no telemetry line.
- Test: mount each module against a Swarm state and an Adventure state with the same input;
  assert the Swarm DOM contains none of `MASS`, `LOGGED`, `SNAG`, `T /`, `STRAIN`; assert the
  Adventure DOM is unchanged (snapshot today's text first).

### Task 4: the enemy detail card and incoming hints

**Files:** `src/ui/targetPanel.js` ("Wasp · FIGHTER · LIGHT · HOSTILE · SENT AFTER YOU · CLOSE ·
DETAIL"), `src/ui/hud.js` ("INCOMING Sidestep or send it back").

- In Swarm the target card does not mount. The aimed target keeps its in-world ring only.
- "INCOMING" hint lines become a single red edge chevron per threat (reuse the existing offscreen
  marker drawing in `hud.js`); no sentence.
- Test both gates as in Task 3.

### Task 5: the Swarm readout (top-left box) becomes the top-center chain

The current top-left box shows `CRUCIBLE · RICOCHET FOUNDRY / ROUND 01 / HOSTILE SHIPS 13/15 /
SCORE 0 · CR 779 · LV 1 / +10 CR`. Find its owner (`grep -rn "HOSTILE SHIPS" src/ui`).

- Replace with a top-center block: huge chain number (the `swarmChain` value), under it a thin
  round progress bar (killed/quota), under that `ROUND 3` in small caps. Credits move to the
  shop screen only. Remove "SCORE 0" from the round (score shows on Run Over).
- Size: chain number ≥ 64 px at 1280×800; progress bar ≤ 6 px tall, ≤ 280 px wide.
- Test: mount → contains the chain and round; does not contain `SCORE`, `CR`, `LV`.

### Task 6: power bar as icons (coordinate — files were in flight)

The power list (`DRIVE F8 / PULL · DRAWS IN 1 / SHOVE · PUSHES AWAY 2 / …`) is drawn by the
ORRERY cluster (`src/ui/orrery/flightCluster.js`, `power-railLayouts.js`, `hudAdapter.js`).
Those files were being edited by other work on 2026-11-05 — read `NOW.md` and the live diff, and
take this task only when they are free or with the owner's agreement.

- In Swarm, the rail draws six icons in a horizontal row along the bottom center, each with its
  key number and a radial cooldown fill. No words, no `DRIVE F8` row.
- Hover/focus still exposes the name for accessibility (`aria-label`).

**Plan 1 done when:** all new tests green; `node --test test/crucible-swarm-*.test.mjs` green;
before/after screenshots of round 1 at 5 s / 30 s / 60 s show only the README §2 persistent set
plus ≤3 callouts of ≤3 words; Adventure flight screenshot unchanged.

---

## Plan 2 — Fair credit

**Player outcome:** the chain and every "PILE-UP"/"DOUBLE" callout only ever reflect something
the player caused. Sitting still never earns a number.

**Observed (2026-11-05):** in round 1, ship at rest, no input: `CHAIN 9 COLLISION`, `PILE-UP ×2`,
`ARENA: SHUNTED ×9`, `+12 SHUNTED`, with `HOSTILE SHIPS 15/15` (no ship had died).

**What is already right:** the Brood engine separates credited from environmental deaths
(`creditedCount` vs `environmentalCount` in `swarmBrood.flushKillsFrom`, with `rockCredited`,
`movCredited`, `creditUntil` windows). So the leak is elsewhere. Candidates, in order:

1. `swarmJuice._onBroodKills` builds the pile-up window from `count`; check it ignores receipts
   whose `count` is 0 (environmental-only receipts still arrive with `removedCount > 0`).
2. `stuntCallout.js` "ARENA: SHUNTED ×n" / "+12 SHUNTED" — an arena-machinery stunt counter that
   may count any body the arena shoves, not the player's.
3. A chain caption labelled `COLLISION` in the Swarm readout — find its writer
   (`grep -rn "COLLISION" src/ui src/systems/swarm*.js`) and check what feeds it.
4. `rockCredited[r]` being set for rocks the player never touched (e.g. arena-authored moving
   rocks or plates initialised as credited).

**Allowed paths:** `src/systems/swarmChain.js`, `src/systems/swarmJuice.js`,
`src/systems/swarmBrood.js` (credit flags only), `src/ui/stuntCallout.js`, the readout owner found
in Plan 1 Task 5, `test/swarm-fair-credit.test.mjs` (new).

### Task 1: reproduce in a test

Build the smallest fixture that starts a Swarm round 1 (copy the setup from
`test/crucible-swarm-chain.test.mjs` and `test/crucible-swarm-arena.test.mjs`), steps the sim
600 ticks with **no player input**, and records every `swarm:announce`, `swarm:killPopup`,
`run:awardRequested` and chain change on the bus.

```js
test('a round with no player input awards nothing and announces nothing', () => {
  const { bus, state, step } = startSwarmRound({ seed: 2438149869, wave: 1 });
  const seen = [];
  for (const ev of ['swarm:announce', 'swarm:killPopup', 'run:awardRequested']) bus.on(ev, (p) => seen.push([ev, p]));
  step(600);
  assert.deepEqual(seen, []);
  assert.equal(currentChain(state), 0);
});
```

Run it; it must FAIL in a way that names the leaking event. If it passes, the leak is in a UI
owner (candidate 2/3) — reproduce there by mounting the owner and replaying the recorded bus.

### Task 2: fix at the owner that leaked

- Brood receipts: chain and juice consume only `count` (credited); a receipt with `count === 0`
  produces no popup, no window entry, no announce.
- UI shunt counters: show only when the shunt was caused by a player body or a body the player
  threw/towed within `BROOD_CREDIT_WINDOW_S` (reuse that constant; do not invent a second window).
- Ship kills (`entity:killed`): the chain already reads the killer; verify that an enemy killed
  by another enemy's shot or by arena machinery the player did not trigger does **not** step the
  chain — add that case to the test.

### Task 3: the positive cases still pay

Same fixture, scripted player input: shove a Wasp into a rock (chain +1, popup), bomb a Brood
cluster (pile-up announce when ≥5 credited in the window), throw a body with the Line into the
pack within 3 s (credited). Assert each.

**Plan 2 done when:** both tests green; `node --test test/crucible-swarm-chain.test.mjs
test/crucible-swarm-*.test.mjs` green; a live round 1 idled for 30 s shows chain 0 and no
callouts; a live shove-into-rock shows the chain step and a callout.

---

## Plan 3 — One press to the fight

**Player outcome:** from launching the game, the owner presses **SWARM** on the title and is
fighting in under 15 s warm; the first-run prompts never appear again on this machine.

**Allowed paths:** `src/data/swarmDemoProfile.js` (new), `src/ui/screens/mainMenu.js`,
`src/ui/screens/motionAsk.js`, `src/ui/accessibility.js` ("First light" prompt),
`src/ui/screens/crucible.js` (only to reuse its launch function — do not restyle it),
`src/ui/crucibleLaunch.js`, the title splash owner (`grep -rn "CLICK OR PRESS ANY KEY" src`),
`test/swarm-demo-route.test.mjs` (new).

### Task 1: the demo profile (pure data)

```js
// src/data/swarmDemoProfile.js — the run the title's SWARM button starts
// (design/program/finish/swarm-demo-cut/README.md §3.1). One frozen record; every Swarm owner
// that tunes the demo reads it through run.profile === SWARM_DEMO_PROFILE.id.
export const SWARM_DEMO_PROFILE = Object.freeze({
  id: 'demo',
  ruleset: 'swarm',
  arenaId: 'helios_core',          // Ricochet Foundry — see Plan 4 Task 6 for the look fix
  stakeId: 'contender',            // 750 cr, 100% pressure — the tuned stake
  starterBuildId: 'ricochet_runner', // Hornet; confirm the id in the Ship & Kit data
  bossWave: 5,                     // Plan 8
  openArmoryBeforeRound1: false,   // straight into the fight
});
```

Test: the record is frozen; `bossWave` is an integer < 10; `starterBuildId` exists in the
starter-build table; `arenaId` exists in `survivalArenas`. Confirm the real ids by reading
`src/ui/screens/crucible.js` (starter builds list) and `src/data/survivalArenas.js`.

### Task 2: carry the profile into the run

Find where the run envelope is created from the launch setup (`crucibleLaunch.js` →
`createRunState` / `runSession`). Add `profile` as an optional, validated, saved field
(`'demo'` or absent). Test: launching with the demo profile yields `run.profile === 'demo'`;
launching from Crucible yields no profile; `validateRunState` accepts both.

### Task 3: the SWARM button

On the title (`mainMenu.js`) add **SWARM** as the second item, under CONTINUE/NEW GAME, same
style as its neighbours. Pressing it launches `SWARM_DEMO_PROFILE` directly through the same
launch path Quick play uses (`launchCurrent` in `crucible.js` — extract the minimum shared launch
function rather than duplicating it). With `openArmoryBeforeRound1:false` the run starts in round
1, not the armory.

### Task 4: first-run prompts show once

The splash ("CLICK OR PRESS ANY KEY TO BEGIN"), the motion ask and "First light" each record a
per-machine "seen" flag in the settings/profile store they already use (not the save). On later
launches they do not appear; Settings → Access still reaches every option.

**Look/route check:** fresh profile → splash, motion, First light appear once → title → SWARM →
fighting. Relaunch → title directly → SWARM → fighting. Time launch-click → first controllable
frame with the pane visible; record it. Screenshot the title with the new button.

**Plan 3 done when:** tests green; route check passes twice; time recorded in the commit body.

---

## Plan 4 — A readable swarm

**Player outcome:** from across the room a watcher can tell the player, the swarm, the dangerous
ships, and the things you can throw — and the swarm visibly fills the screen.

**Allowed paths:** `src/render/broodPresentation.js`, `src/data/swarmBrood.js` (family colours
only; population numbers only in Task 5), `src/render/camera.js` / `src/render/cameraGlide.js`
(Swarm framing only), `src/render/feel.js` (flash cap), the enemy ring/role-mark owner
(`grep -rn "role" src/render/*marker* src/ui/hud.js`), `test/swarm-readable*.test.mjs`.

### Task 1: Brood you can see

- Body scale ×1.5 (`buildBroodBodyGeometry(scale)` — pass the scale from one constant
  `BROOD_DRAW_SCALE = 1.5`; collision radii stay unchanged — this is draw size only).
- Each family gets one saturated emissive colour from a fixed table; families must be mutually
  distinguishable for common colour-vision deficiencies (pair colour with silhouette stretch the
  family table already has). Suggested set: acid green, hot pink, electric orange, violet,
  white-gold. Never cyan or gold (the player's colours) and never red (full-ship hostiles).
- Death pop: a short bright additive burst at the body (reuse the existing instanced spark/VFX
  pool — no new pool), ≤ 0.25 s.
- Test (pure): the family colour table has one entry per family, no duplicates, none within a
  hue distance of the player's cyan/gold.

### Task 2: full ships read as the dangerous ones

Hot red-orange rim on hostile full ships in Swarm (reuse the existing faction rim/IFF material
path; Swarm overrides the hue). Role mark above each: a small glyph per role from
`SWARM_ROSTER[].role` (mass, pressure, reach, disruptor, support, elite, anchor, control). Glyphs
are shapes, not letters; ≤ 14 px at 1280×800.

### Task 3: "you can throw that"

Bodies the Line can grab and move (light enemies, loose rocks, cargo, boss chunks) get a faint
white outline while within Line range. Read range and "can move" from the existing Line target
scoring (`src/combat/masslineTargetScoring.js`) — do not compute a second answer. Outline only
for the ≤ 8 nearest eligible bodies (no per-frame scan of everything — reuse the scoring pass's
own candidate list).

### Task 4: spectator camera

- Swarm default framing: zoom out so a ~1.6× larger area is visible than today's Swarm framing,
  keeping the player's hull ≥ 28 px long at 1280×800. Measure today's framing first.
- Punch-in only on: pile-up announce, boss entrance, boss death. ≤ 0.5 s in, ease back ≤ 0.6 s.
- Today the camera pushed in during the Line move and stayed: in Swarm, Line moves do not change
  zoom.
- Reduced motion: no punch-in; framing unchanged.

### Task 5: a bigger swarm (gated)

Today `SWARM_BROOD_MIN = 100`, `SWARM_BROOD_MAX = 400`, full at wave 21. For the demo profile,
raise wave 1–5 Brood to fill the screen (proposal: 160 → 300 across waves 1–5). **Only** land
this if the laptop A/B (Rule 3) shows the frame interval does not get worse in waves 1–5; record
both runs. If it does get worse, land Tasks 1–4 alone and write the measured cost in the commit.

### Task 6: the flash cap

The bomb flash covered ~40% of the screen. Cap every full-screen or large additive flash in Swarm
to ≤ 15% of screen area and ≤ 0.2 s hold (`feel.js` moment beats + the bomb VFX owner). Test:
the pure beat resolver returns radius/duration within the cap for the biggest bomb.

### Task 7: the arena matches its picture

The menu shows Ricochet Foundry as an enclosed, red-lit industrial room; the round plays in open
space beside a large flat painted Saturn. Either (a) bring the arena's own authored props,
lighting and backdrop into the round (preferred — the room plates already exist per
`survivalArenas.kitVerbWeights` notes) and hide the ringed-planet backdrop in this arena, or
(b) re-shoot the menu image from the real round. Choose (a) unless it costs frame time.

**Plan 4 done when:** tests green; round 1 and round 4 screenshots (before/after) show Brood
clearly visible as coloured shapes, ships with red rims and role marks, outlined throwables, the
whole swarm in frame, no flash > 15%; a 3-person "what is that?" check works from the screenshot
alone (write the three answers in the commit body).

---

## Plan 5 — The shape of a round

**Player outcome:** each round is 60–90 s of escalating pressure that ends cleanly — no hunting
for the last enemy.

**Allowed paths:** `src/data/swarmMode.js` (demo-profile tuning only), `src/systems/swarmArena.js`,
`src/systems/survivalWave.js` (last-enemies rule only), `src/ui/hud.js` (pointer drawing reuse),
`test/swarm-round-shape.test.mjs` (new).

### Task 1: last three come to you

When ≤ 3 hostile ships remain in the quota and none is on screen: each gets an edge pointer
(reuse the offscreen marker), and its doctrine switches to direct pursuit of the player (reuse the
`pack_pursuit` doctrine stamp in `swarmDoctrineStamp`). Test: fixture with 3 remaining enemies
parked 400 units away → within 8 s of sim time each is within 200 units of the player.

### Task 2: arrivals you can see

Groups enter from the gates (`GATES` in `swarmMode.js`) as visible clusters: a brief gate flare
(reuse existing telegraph VFX) 1 s before each group. One gate per group; never all gates at once
on waves 1–3.

### Task 3: round title

"ROUND 3" center-screen for 1.2 s at round start (≤ 2.5 s with fade); skip on reduced motion
(show it statically in the readout instead).

### Task 4: tune waves 1–5 for the demo profile

Target per wave (demo profile only): length 60–90 s with a competent player; wave 1 teaches
shooting and one shove; wave 2 adds Reaver Pirates; wave 3 adds a dense Brood tide; wave 4 adds
Choir Zealots; wave 5 is the boss (Plan 8). Use the existing pure planner
(`src/data/waveRecipeSimulator.js`) to estimate, then confirm by playing. Record actual wave
lengths from two live runs in the commit body.

**Plan 5 done when:** tests green; two live demo runs never require hunting; wave 1–4 lengths in
range.

---

## Plan 6 — Pick one

**Player outcome:** between rounds the screen offers three big, exciting cards; one click picks
and fits; the shop takes ~10 s; the 107-item catalog is still reachable behind "Browse all".

**What exists:** `offerDraft()` (`src/data/survivalDraft.js`) already returns three seeded offers
with reroll support. In Swarm its pool is authored cards (`SURVIVAL_DRAFT_OFFERS` +
`SWARM_DRAFT_OFFERS`, ~42 verb cards) **plus the generated catalog** (`swarmCatalogOffers`, the
stat-part rows). The armory screen (`src/ui/screens/crucibleDraft.js`) shows the catalog.

**Allowed paths:** `src/data/survivalDraft.js` (a pool option only), `src/data/swarmDraft.js`
(blurbs/icons only), `src/ui/screens/crucibleDraft.js`, its stylesheet under `styles/`,
`test/swarm-pick-one.test.mjs` (new).

### Task 1: an authored-only pool

Add an option `pool: 'authored'` to `offerDraft` input that skips `swarmCatalogOffers`. Test:
with `pool:'authored'`, every returned offer has `catalog !== true` and a verb in the authored
set; without the option the result is byte-identical to today (determinism).

### Task 2: the card layout

The between-round screen opens on **three cards** side by side, each ~360×480 at 1920×1080:
large icon, one-word verb ("FORK"), one plain sentence (the authored `blurb`; rewrite any blurb
that a spectator cannot read — keep "no percentages, no +stat"), and a looping preview (an
animated SVG schematic of the effect is enough: e.g. Fork = one shot splitting in two). Under the
cards: **Reroll (R)** with price, **Repair** with price, **Browse all** (opens today's screen as
a sub-view), **Launch round N**. Click a card → it fits (auto-slot via `fits`, falling back to
replacing the weakest number card) → card animates into the ship schematic → Launch is focused.

### Task 3: the snowball weighting

From round 3, when the player owns a verb that is half of a combo (Plan 9 table), one of the three
offers is its partner if legal (seeded, deterministic). Test with a fixed seed.

### Task 4: legendaries as the rare fourth row

`Domino` and `Graviton Heart` (`src/systems/swarmLegendaries.js`) appear as a rare golden card in
the three (≤ 1 per run before round 5), never as a catalog row.

**Look check:** `node scripts/ui-bench.mjs --shot=crucible-draft --walk` before/after; open every
PNG; a live round 1 → shop → pick → round 2 loop timed under 15 s from clear to launch.

**Plan 6 done when:** tests green; the walk passes; the live loop works with keyboard only and
mouse only.

---

## Plan 7 — The payoff ladder

**Player outcome:** every kill feels good; multi-kills feel better; a pile-up is a show-stopping
moment.

**Allowed paths:** `src/systems/swarmJuice.js`, `src/ui/swarmJuiceHud.js`, `src/render/feel.js`
(hit-stop beat only), the Swarm audio cue owner (`grep -rn "swarm:announce" src/audio`),
`test/swarm-payoff.test.mjs` (new).

| Event (credited only — Plan 2) | Picture | Sound | Words |
|---|---|---|---|
| Kill | small pop at the body | short click | none |
| 2–4 in 1 s | bigger burst | click pitched up one step per kill | `DOUBLE` / `TRIPLE` / `QUAD` |
| ≥ 5 from one cause in 1 s (**pile-up**) | 0.15 s hit-stop, shake (respect the shake slider), camera punch (Plan 4) | low boom + rising sting | `PILE-UP!` |
| Chain milestone (existing `SWARM_CHAIN_MILESTONES`) | chain number pulses | chime | none |

- Hit-stop: a sim-time freeze is forbidden (determinism); implement as a presentation-only
  time-scale on the render/VFX clock for 0.15 s. Reduced motion → no hit-stop, no shake.
- At most one pile-up presentation per 1.5 s; a second inside the window extends the text count
  only.
- All words go through `swarmCalloutText` (Plan 1).
- Test: feed the juice owner scripted credited receipts; assert the announce kind and that a
  `count:0` receipt yields nothing.

**Plan 7 done when:** tests green; a recorded live pile-up (short screen capture into
`.devshots/swarm-demo-cut/plan7/`) shows the freeze, the punch and one `PILE-UP!` line.

---

## Plan 8 — The wave-5 boss

**Player outcome:** at wave 5 of the demo run the Iron Maw arrives with ceremony, is beaten by
throwing things into it, and dies into chunks the player keeps using as ammunition; the run ends
on a victory screen.

**Allowed paths:** `src/data/swarmMode.js` (`isSwarmBossWave`/`swarmBossFor` profile option),
`src/systems/swarmArena.js`, `src/systems/capitalBossRuntime.js` (death → chunks only),
`src/data/encounters/capital-boss/iron-maw.js` (callout text only), the boss name-card UI owner
(`grep -rn "capitalBoss" src/ui`), `src/ui/screens/crucible.js` (victory variant of Run Over),
`test/swarm-demo-boss.test.mjs` (new).

### Task 1: boss at wave 5 on the demo profile only

`isSwarmBossWave(wave, run)` and `swarmBossFor(wave, run)` accept the run; when
`run.profile === 'demo'` the boss wave is `SWARM_DEMO_PROFILE.bossWave` and the row is
`iron_maw`. Without a profile: byte-identical to today. Test both.

### Task 2: entrance

2 s name card ("IRON MAW" large, one subtitle line ≤ 6 words), camera punch (Plan 4), Brood
population on this wave held at the minimum so the boss reads. The existing intro bark plays as
voice/caption through the `boss` source (Plan 1 admits it).

### Task 3: readable phases

Weak plates (`rudder_plate`, `bow_plate`) glow while they are the current target. Each act shows
one 3-word callout: act I `CROSS ITS BOW`, plate shed `RIP ITS RUDDER`, ballast phase
`THROW THE BALLAST`. Replace the authored `lesson` sentences on screen with these; keep the
sentences for the Run Over screen.

### Task 4: death into ammunition (new thing #2)

On death the hull breaks into 4–6 large chunks spawned as ordinary throwable physical bodies
(reuse the wreck/debris body path the game already uses for hull bursts — search
`hull burst` / `wreck` spawners; do not write a new physics body type). Chunks inherit the hull's
velocity with outward separation, carry the Plan 4 throwable outline, and live until the run
ends. Test: fixture kills the boss → n chunks exist, each grabbable by the Line scoring.

### Task 5: victory screen

Clearing wave 5 on the demo profile opens the Run Over screen in a victory variant: headline
`IRON MAW DOWN`, the same stats layout, "Run it again" focused (Enter), "Keep going" (continues
the endless ladder from wave 6), "Main menu".

**Plan 8 done when:** tests green; one live demo run reaches and beats the boss using at least one
thrown chunk or ballast; screenshots of the entrance, a plate shed, the chunks, and the victory
screen.

---

## Plan 9 — Combo cards (new thing #1)

**Player outcome:** owning two specific verbs unlocks a named super-card; picking it visibly
transforms the build.

**Allowed paths:** `src/data/swarmEvolutions.js` (new, pure data), `src/data/survivalDraft.js`
(offer the evolution when legal), `src/ui/screens/crucibleDraft.js` (golden card variant),
the runtime owner each evolution reuses, `test/swarm-evolutions.test.mjs` (new).

### Task 1: the table (existing parts only)

```js
// src/data/swarmEvolutions.js — two owned verbs unlock one named card. Every effect is an
// existing module or legendary; an evolution re-tunes or combines, it never adds a system.
export const SWARM_EVOLUTIONS = Object.freeze([
  { id: 'bolas',      name: 'Bolas',      needs: ['snarl', 'whip'],     blurb: 'Tied enemies swing as one heavy mass.' },
  { id: 'meteor',     name: 'Meteor',     needs: ['ram', 'burner'],     blurb: 'Your hull at full burn breaks whatever it hits.' },
  { id: 'storm',      name: 'Storm',      needs: ['relay', 'fork'],     blurb: 'Every split shot arcs to the next enemy.' },
  { id: 'black_hole', name: 'Black Hole', needs: ['gravity_payload', 'tractor'], blurb: 'Your hits drag the swarm into one ball.' },
]);
```

For each, the implementer writes down in the file header exactly which existing module/legendary
values it combines (e.g. Black Hole = Graviton Heart's well attached to tagged targets). If an
evolution cannot be built from existing parts, drop it — do not invent a system.

Tests: every `needs` id exists in the authored draft pools; no evolution shares both needs with
another; the offer appears only when both are owned and only once per run.

### Task 2: presentation

Golden card variant in the pick-one screen with both parent icons merging into one; on pick, a
2 s in-round flourish the first time it fires (`BOLAS!` via the callout lane).

**Plan 9 done when:** tests green; each landed evolution has a 5–10 s capture showing its effect
in a live round.

---

## Plan 10 — Demo rehearsal (and new thing #3)

**Player outcome:** a full demo run, played the way the owner will play it, looks and feels
finished.

1. Fresh profile on the laptop, pane visible: title → SWARM → waves 1–5 → Iron Maw → victory →
   Run it again. Record the screen.
2. Score it against README §2 minute by minute: every frame where a spectator would ask "what is
   that?", any jargon, any idle stretch > 10 s, any flash, any moment the player is credited for
   nothing. Write findings into `.devshots/swarm-demo-cut/plan10/REHEARSAL.md`.
3. Fix material findings in the owning plan's files.
4. Spend **new thing #3** only on the single biggest remaining gap, with the owner's OK, in the
   smallest form that closes it.
5. Repeat until one full run has no finding.

**Plan 10 done when:** one recorded full run with an empty findings list, kept as the demo
reference capture.
