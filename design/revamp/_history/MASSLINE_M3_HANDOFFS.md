# MASSLINE M3 — Handoff prompts for the deferred items

Written 2026-07-12 by the M2 implementation agent. Each prompt below is SELF-CONTAINED: it can be
pasted verbatim to a fresh agent with no other conversation context. Prompts A–E are independent
of each other; Prompt F is flight-lane-owned and CONDITIONAL. Prompt G runs A–E as one pass.

Every prompt embeds the same safety preamble because agents won't see this header. The repo
artifacts they lean on (design doc, ledger, checks) all exist in the tree.

---

## PROMPT A — Bomb propulsion ergonomics + tech pacing (§5.2)

You are implementing "bomb propulsion" for SpaceFace at `C:\Users\93rob\Documents\GitHub\SpaceFace`
(top-down 2D Newtonian three.js space game; native ES modules; dev server `node server.js`).

READ FIRST (all in-repo): `design/revamp/MASSLINE_PHYSICS_IDENTITY.md` (the M2 design decisions +
dial registry), the `### M2 MASSLINE PHYSICS IDENTITY — DONE (2026-07-12)` entry in
`design/revamp/STATUS.md`, and `scripts/check-massline2.mjs` (the wave's contract check — your
model for fixtures and invariants).

THE FEATURE (from the original design brief, Robin's own spec): an alternative boost — drop
explosive charges BEHIND the ship that detonate and propel it forward massively. Dual-use by
design: propulsion burst AND damage to pursuers AND emergency getaway. Robin wants it as a
LATER unlock, "when someone gets used to the massline and the regular boost" — respect that
pacing via the tech tree, not the starting kit.

WHAT ALREADY EXISTS (verified during M2):
- `src/systems/impulseCharges.js` — sticky radial impulse bombs already ship: lobbed from the
  player nose along the aim direction (`aimDir`, :32), stick to ship/drone/asteroid, detonate on
  the `chargeDetonate` verb, consume `cmdty_impulse_charge` cargo per throw, blast impulse routed
  through `helpers.combatPhysics.applyImpulse({entityId, impulse:{x,z}, point, reason, tick})`
  (`_applyBlastImpulse`, :371) and damage through the combat kernel. Friendly fire is ON — so
  riding your own blast may ALREADY propel you. VERIFY THIS FIRST (fixture: player + armed charge
  behind, detonate, assert player received impulse); the remaining work may be pure ergonomics.
- Inputs (`src/systems/input.js`): `chargeThrow` = KeyY (pilot/classic) / KeyQ (helm);
  `chargeDetonate` = KeyR. Both edge-triggered on `state.input.actions.*`. NOTE: the header
  comment in impulseCharges.js saying "detonate on F" is stale — bindings are authoritative.
- Data: `src/data/impulseCharges.js` (`IMPULSE_CHARGES`, `MASSLINE_COMBOS`);
  `mod_charge_rack` in `src/data/modules.js` (`impulseChargeCapacity: 8`).
- Green checks that pin current behavior: `npm run check:impulse:authority`,
  `npm run check:impulse:massline-combos`.
- Tech gating precedent: modules use `requiresTech: 'tech_drive_tuning'` etc. (see
  `mod_cloak_mk2` in `src/data/modules.js`); tech UI `src/ui/screens/techTree.js`, blueprints
  `src/data/blueprints.js`.

BUILD:
1. A "drop-behind" ergonomic so the propulsion use is one gesture, not a 180° turn: design the
   input yourself (every letter key is bound — see the M2 key audit in the design doc §2; viable
   patterns: contextual reuse of `chargeThrow` while reverse/brake is held = drop aft with
   near-zero relative velocity; or a hold-vs-tap split like the shipped F-key idiom). The dropped
   charge should arm fast and either detonate on the existing R verb or support an
   auto-detonate-at-standoff option (dial).
2. Make the self-propulsion honest and tuned: the blast's existing radial impulse + falloff should
   give a strong forward kick at safe standoff (~2–3 ship radii), real damage closer (risk/reward),
   and it must hurt pursuers in the cone. Add dials at the top of the file per the M2 convention.
3. Tech pacing: gate the drop-behind ergonomic (NOT the existing charge system) behind a mid/late
   tech row (`requiresTech` on a new or existing tech id) + a `MASSLINE2_FLAGS.bombPropulsion`
   flag (see constraints). Starting kit unchanged.
4. One onboarding hint via `onboarding.js` `_showHint('bombPropulsion', '…')` (pattern: the three
   massline hints added in M2, flag-gated, lazily-materialized key — zero schema churn).
5. Audio: a drop cue. Add recipe to `src/data/audioRecipes.js`, map in `AUDIO_CUE_TO_RECIPE`
   (`src/audio/audioSystem.js:241+`), AND add the cue id to `EMITTED_CUES` in
   `scripts/check-audio-identity.mjs` — Check 6 fails on any emitted cue id not in that contract
   (M2 hit this).

HARD CONSTRAINTS (non-negotiable, same as M2):
- Feature flags: extend `MASSLINE2_FLAGS` in `src/data/featureFlags.js` (flat camelCase key,
  default `IS_BROWSER` — OFF headless, ON live; read via `massline2Flag('bombPropulsion')` at
  call time, never cached).
- Golden safety: `scripts/sf-sim.mjs:279-298` hand-builds a curated 13-system list (includes
  weapons/physics/combat/cargo/economy — NOT impulseCharges... verify: impulseCharges IS in
  UPDATE_ORDER but check the curated list yourself; if it IS in the harness list, every behavior
  branch must be flag-gated). `npm run check:sim:compare` output must stay BYTE-IDENTICAL —
  capture it to a file before you start and diff after.
- NEVER write `state.timeScale` anywhere, including in check scripts — a repo-wide writer audit
  (`check:time-effects`) scans `src/**` and `scripts/check-*|probe-*`.
- New runtime state under `state.massline2.*` (unsaved, outside the sim-snapshot whitelist).
  No save-schema changes (check:save-schema is ALREADY RED from someone else's WIP — do not run
  `generate-save-schema --write`, it would sweep foreign drift in).
- ENV GREMLIN: `git add -N <file>` every new file immediately or it may be deleted.
- CONCURRENT TREE: many modified files belong to other agents (assets, render/bloom.js,
  gameState.js, station screens). Touch only your surface.
- Pre-existing reds you will see and MUST NOT chase: `check:proof-ritual` (71≠80 offset),
  `check:overnight:playable` (market.js banner), `check:save-schema` (scenario drift),
  `check:massline` aggregate red only via its `check:47a:scavenger-threat` child.

VERIFY: extend `scripts/check-massline2.mjs` with a section (drop-behind places the charge aft;
self-impulse received ≥ dial value at standoff; flag-off inertness), run
`npm run check:massline2 check:impulse:authority check:impulse:massline-combos check:sim:compare
check:audio-identity check:time-effects check:onboarding` (all green except the listed
pre-existing reds; sim:compare byte-identical). Perform one non-vacuous control (temporarily break
your own gate, watch your check fail, restore, record). Append a `### M3-A BOMB PROPULSION` entry
to `design/revamp/STATUS.md` in house style (what/where/validation/control/no-regression floor).

Browser sanity (optional but valued): hidden preview tabs suspend rAF entirely and the new-game
gate loops `await nextFrame()` forever. Workaround (documented in M2): boot via launch.json server
`spaceface`, `SF.bus.emit('game:new')`, then shim
`window.requestAnimationFrame = cb => setTimeout(cb,16)`, force `SF.state.mode='flight'` +
`SF.timeEffects.clear('runtime:loading')`, and burst-step `for(i=0;i<N;i++) SF.registry.step(1/60)`
(setInterval is 1Hz-throttled in hidden tabs). Real `KeyboardEvent`/`MouseEvent` dispatches drive
input.js. `helpers.worldToScreen` returns x:null until a real camera frame exists — don't chase it.

---

## PROMPT B — Cloak × customs/scan interaction (§4.2 refinement)

You are refining the M2 cloak for SpaceFace at `C:\Users\93rob\Documents\GitHub\SpaceFace`
(top-down 2D Newtonian three.js game; native ES modules). READ FIRST:
`design/revamp/MASSLINE_PHYSICS_IDENTITY.md` §8, the M2 entry in `design/revamp/STATUS.md`, and
`src/systems/cloak.js` (the shipped system).

CURRENT STATE (verified in M2): the cloak honestly gates TACTICAL perception at the single AI
seam — `entityContacts` in `src/systems/aiPorts.js` skips the player contact when
`cloakHidesPlayerFrom(state, self, player)` (exported for tests) says the observer is outside
`state.massline2.cloak.radius`. Customs was deliberately LEFT UNGUARDED because it is not vision:
- Customs scans = `economy.runScan` (`src/systems/economy.js:912`), triggered by bus events
  `sim:jumpGate`, `jump:start`, `patrol:proximity` (subscriptions at `economy.js:301-303`).
  It scans the CARGO HOLD (math in `src/economy/customsRisk.js`) — there is no scan cone.
- `patrol:proximity` is emitted by the patrolScan encounter script
  (`src/systems/encounterScripts.js:248`) when its scripted proximity phase fires.
- A DICE-ROLL evasion rating already exists: `scannerCloak` 0..1, max-folded from
  `mods.scannerCloak` in `src/systems/ships.js` (~:217,237), plus `hiddenCargoPct`. The M2 cloak
  is PHYSICAL stealth; these are smuggling utilities. They must compose, not fight.

DESIGN TASK (yours to solve, then implement): make the physical cloak matter to customs without
breaking the smuggling career's existing dice. Recommended shape (improve if you can): a
patrol whose scripted scan fires while the player is cloaked AND the patrol entity is OUTSIDE the
live detection ring simply cannot initiate the scan (physically honest: it cannot see a ship to
hail); inside the ring, the scan proceeds and existing scannerCloak/hiddenCargo dice apply
unchanged. Decide and document what jump-GATE scans do (fixed infrastructure sensors — arguably
unavoidable; if you keep them unavoidable, say so in the ledger as a design ruling).

IMPLEMENTATION CONSTRAINTS:
- `economy` IS in the sf-sim curated harness list (`scripts/sf-sim.mjs:279-298`) — any edit to
  `economy.runScan` MUST be behind `massline2Flag('cloak')` (from `src/data/featureFlags.js`;
  IS_BROWSER default = OFF headless). `encounterScripts.js` is NOT in the harness — an
  emission-side gate there is the lower-risk seam. Choose one seam, not both.
- Read cloak state ONLY from `state.massline2.cloak` (`{available, active, energy, radius}`).
  Distance test per observer, like `cloakHidesPlayerFrom`.
- Never write `state.timeScale` (repo writer audit). New state under `state.massline2.*` only.
  `git add -N` new files immediately. Don't touch other agents' WIP (render/bloom.js,
  gameState.js, station screens, assets are foreign).
- Checks that pin this area and must stay green: `check:customs-prompt`, `check:customs-signature`,
  `check:economy:smuggling-authority`, `check:pirate-parley`, `check:encounter-director`,
  `check:massline2`, and `check:sim:compare` BYTE-IDENTICAL (capture before/after).
- Pre-existing reds — do not chase: `check:proof-ritual`, `check:overnight:playable`,
  `check:save-schema`, `check:massline` (via `check:47a:scavenger-threat`).

VERIFY: add a `scripts/check-massline2.mjs` section (cloaked + patrol outside ring at scan moment
→ no `contraband:scanned`; inside ring → scan fires and scannerCloak math untouched; flag-off →
byte-identical behavior). One non-vacuous control (invert your distance test; watch it fail;
restore). Append `### M3-B CLOAK CUSTOMS` to `design/revamp/STATUS.md` with the jump-gate ruling
recorded explicitly.

---

## PROMPT C — Bullet-time audio treatment (§3.6 completion)

You are adding audible time-dilation to SpaceFace at `C:\Users\93rob\Documents\GitHub\SpaceFace`.
READ FIRST: `design/revamp/MASSLINE_PHYSICS_IDENTITY.md` §5, the M2 STATUS.md entry, and
`src/systems/bulletTime.js` (the shipped system: hold CapsLock → `timeEffects.set(
'player:bullet-time', {scale:0.35})`, meter at `state.massline2.bulletTime`, events
`bulletTime:start` / `bulletTime:end` on the bus, enter/exit one-shot cues already exist:
`massline.bulletTimeIn/Out`).

VERIFIED FACTS about the audio stack (M2 recon — trust these, then re-verify lines):
- `src/audio/` has ZERO coupling to `state.timeScale` today. Slow-mo is currently silent.
- `playbackRate`/`rate` usages are per-cue pitch only (`synth.js:144,146,211`;
  `audioSystem.js:814,909,981,1270`).
- Buses are chosen per recipe id substring in `getBusForRecipe` (`audioSystem.js:349`) →
  engine/ambient/combat/ui/comms. Continuous loops exist and are contract-pinned:
  `_ensureContinuousSources` must call `_ensureEngineHum`/`_ensureBrakeHiss`/`_ensureTetherHum`
  (asserted by `check:audio-identity` at scripts/check-audio-identity.mjs:432-435).
- A priority-duck mechanism exists (`src/audio/cuePriorityBus.js`, `PRIORITY_DUCK_DB=-8`,
  `_updatePriorityDuckGains` applied per frame — asserted at :455).
- `check:audio-identity` also asserts: master peak headroom ≤ -6dBFS (`maxPeak <= 0.501187`,
  :201), voice cap 12, exactly 5 settings volume sliders (:334), and every emitted `audio:cue` id
  present in its `EMITTED_CUES` contract (:352 — M2's massline.* entries are there; add any new id
  you emit).

BUILD (feel-first; the game's audio is 100% procedural WebAudio, no assets):
- On `bulletTime:start`: sweep a master-ish lowpass (a filter node on the engine/ambient/combat
  buses — NOT the ui/comms buses, menus must stay crisp) down to ~900–1400Hz over ~120ms, drop
  continuous-loop playbackRates slightly (~0.85), and duck music a few dB. On `bulletTime:end`:
  mirror back over ~150ms. Subscribe to the events; do not poll `state.massline2` per frame if the
  events suffice (audio already subscribes to dozens of events in `audioSystem.js:483+`).
- Respect `settings.audio` volumes and mute; the effect must be inert when the master is muted and
  must not add a 6th slider (or update the Check-5 assertion + settings UI together if you decide
  a "slow-mo audio" toggle is warranted — then also `check:settings-profile`).
- Audio is render-phase (Tier A): READING `state.timeScale` is allowed (renderer.js already reads
  it at ~:1512) — but never WRITE it (repo-wide writer audit, `check:time-effects` scans src/**).
- Keep node allocation pooled/idempotent: filters created once in the ensure path, not per event.

HARD CONSTRAINTS: flags — gate on `massline2Flag('bulletTime')` reads (from
`src/data/featureFlags.js`); `check:sim:compare` byte-identical (audio isn't in the harness, but
capture/diff anyway per M2 discipline); `git add -N` new files; don't touch foreign WIP; do not
chase the pre-existing reds (`check:proof-ritual`, `check:overnight:playable`, `check:save-schema`,
`check:massline` via scavenger-threat).

VERIFY: `npm run check:audio-identity check:cue-priority-bus check:first-hour-audio
check:critical-signature-captions check:time-effects check:massline2 check:sim:compare` green
(minus pre-existing). Non-vacuous control: temporarily point your filter at the ui bus too, show
whichever assertion/behavioral check you add fails, restore. Headless audio is hard to hear —
add a contract test (filter frequency target reached after bulletTime:start; restored after end)
using the fixture style in `test/time-effects.test.mjs`/`scripts/check-massline2.mjs`. Append
`### M3-C BULLET-TIME AUDIO` to `design/revamp/STATUS.md`.

---

## PROMPT D — Settings UI: release-assist row + new-verb rebind visibility

You are finishing the M2 settings surface for SpaceFace at
`C:\Users\93rob\Documents\GitHub\SpaceFace`. READ FIRST: `design/revamp/MASSLINE_PHYSICS_IDENTITY.md`
§4 (assist modes) + §2 (input map), the M2 STATUS.md entry, and `src/systems/masslineThrow.js`
(`releaseAssistMode(state)` reads `state.settings.gameplay.masslineReleaseAssist` with fallback
`'arm'`; valid values `'arm' | 'snap' | 'off'`).

BUILD:
1. A Gameplay-tab row in `src/ui/screens/settings.js` for "Massline release assist" with the three
   values (labels roughly: "Auto-release on solution (default)", "Snap window on manual release",
   "Off — raw physics"). Persist by writing `state.settings.gameplay.masslineReleaseAssist` through
   whatever setter idiom the surrounding rows use (match the file's local conventions exactly).
2. CRITICAL SCHEMA RULE: do NOT add a default for this key to `defaultSettings()` in
   `src/core/gameState.js`. The save-schema doc is generated from a fresh-state fixture;
   `check:save-schema` is ALREADY RED from someone else's WIP drift, and you must not run
   `generate-save-schema --write` (it would launder foreign drift into the committed doc). The
   lazily-materialized key + read-with-fallback pattern is the M2 convention and already works.
3. Rebind visibility: M2 added verbs `bulletTime` (CapsLock) and `cloak` (Backquote) to
   `VERB_BINDINGS` in `src/systems/input.js` (they flow into `DEFAULT_BINDINGS`/all schemes and
   are exported via `DEFAULTS`; `src/ui/screens/settings.js:102` imports those as
   `DEFAULT_BINDINGS`). Verify both appear in the Controls rebind list with readable labels; add
   labels/ordering if the list is curated rather than generated. While there, confirm `throwArm`
   does NOT appear as a rebindable key row (it is RMB-contextual, not a key) — suppress it if the
   generator picked it up.
4. Optional polish if cheap: a one-line hint under the row pointing at the in-game indicator
   ("the diamond pulses white when the window opens").

CONSTRAINTS: gate nothing on flags here EXCEPT hiding the row when `massline2Flag('enabled')` is
false (import from `src/data/featureFlags.js`) so flag-off builds show no dead setting. Never
write `state.timeScale`. `git add -N` new files. Foreign WIP is present in the tree (station
screens, gameState.js, render files) — touch only settings.js/input.js-adjacent surface. DO NOT
edit `src/systems/flightV3.js`, `src/data/flightTuning.js`, `src/core/flight/propulsionKernel.js`.

VERIFY: `npm run check:settings-profile check:controls-discoverability check:massline2
check:save-schema` — settings/controls/massline2 green; save-schema must show the SAME
pre-existing failure signature as before your change (scenario-field drift only — capture its
output before/after and diff; zero massline/settings additions in the delta). Also
`check:sim:compare` byte-identical. Non-vacuous control per house style. Append
`### M3-D RELEASE-ASSIST SETTINGS` to `design/revamp/STATUS.md`. If you can drive the headless
browser (see the rAF-shim recipe in the M2 STATUS entry), flip the setting at runtime and assert
`releaseAssistMode` behavior switches (masslineThrow auto-cut stops when 'off').

---

## PROMPT E — Throw-indicator smoothness under bullet time

You are polishing the M2 release-timing indicator for SpaceFace at
`C:\Users\93rob\Documents\GitHub\SpaceFace`. READ FIRST: `design/revamp/MASSLINE_PHYSICS_IDENTITY.md`
§4, the M2 STATUS.md entry, and `src/ui/masslineHud.js` (the whole surface — ~250 lines).

THE PROBLEM (measured/reasoned in M2): `masslineHud` updates its DOM from the SIM tick
(UPDATE_ORDER, late). Under bullet time the sim runs at 0.35× → the indicator repositions at
~21Hz exactly when the player is staring at it hardest. Render-phase systems are HARDCODED in
`registry.renderUpdate` (render, vfx, feel, ui — see `src/core/registry.js`); there is no plug-in
render hook for arbitrary systems, and the repo bans idle rAF loops in UI modules (command-deck
contract).

RECOMMENDED FIX (start here; improve if you find better within constraints):
1. CSS interpolation: give `.ml2-mark` a `transition: transform 60ms linear` so the browser tweens
   between sim-rate `translate3d` updates. Cheap, no architecture change. MUST respect reduced
   motion: the repo convention is `settings.video.motionReduce` (feel.js gates on it) and the sf-*
   primitive layer honors `prefers-reduced-motion` — disable the transition under either signal.
2. Predictive placement: `state.massline2.throw.solution.timeToSolution` and the payload's angular
   rate are already mirrored — lead the diamond's position by half an update interval so the tween
   lags less. Keep it subtle; the color ramp (`rampColor`) is the primary read.
3. If (1)+(2) still read steppy in a real session, the sanctioned escalation is a small
   `frame(frameDt, state)` method on masslineHud invoked from `ui.frame` — but that means touching
   `src/ui/uiRoot.js`/`hud.js`, which carry three-anchor layout contracts (`check:station-shell`,
   `check:ui-identity`, HUD checks) — read `hud-three-anchor` context in the STATUS ledger first
   and keep the call one line.

CONSTRAINTS: no new rAF loops; no `state.timeScale` writes (reads are fine — it's presentation);
gate visible behavior on `massline2Flag('enabled')` as the module already does; `git add -N` new
files; don't chase pre-existing reds (`check:proof-ritual`, `check:overnight:playable`,
`check:save-schema`, `check:massline` via scavenger-threat); foreign WIP in tree — touch only
masslineHud.js (+ uiRoot.js single line only if escalating).

VERIFY: `npm run check:massline2 check:ui-a11y check:wcag-contrast check:sim:compare` (byte-
identical) green. For the visual claim, use the headless recipe from the M2 STATUS entry (rAF
shim + burst-step + real CapsLock KeyboardEvent) and assert the transition style is present on the
marks and absent under `settings.video.motionReduce = true`. Append `### M3-E INDICATOR
SMOOTHNESS` to `design/revamp/STATUS.md`.

---

## PROMPT F — FLIGHT-LANE items (CONDITIONAL — do not run while BP-07 is active)

PRECONDITION — CHECK BEFORE ANY EDIT: these items belong to the flight-feel lane
(`src/systems/flightV3.js`, `src/data/flightTuning.js`, `src/core/flight/propulsionKernel.js`,
and flight-adjacent `src/core/flightDynamics.js`). During M2 another agent owned that lane
(BP-07). Confirm it is finished: look for a BP-07 completion entry in `design/revamp/STATUS.md`
and run `git log --oneline -5 -- src/systems/flightV3.js src/data/flightTuning.js` to see if work
landed/stopped. If ownership is unclear, STOP and report instead of editing.

You are implementing the two flight-side halves of the M2 massline wave at
`C:\Users\93rob\Documents\GitHub\SpaceFace`. READ FIRST: the "Flight-lane coordination notes" in
the M2 STATUS.md entry, `design/revamp/MASSLINE_PHYSICS_IDENTITY.md` §4/§8, and
`design/FLIGHT_PHYSICS_SPEC.md`.

ITEM 1 — Speed-governor exemption for physics-earned velocity (§4.1): the assisted governor
currently treats thruster max as the ceiling. Slingshot exits should be allowed to EXCEED it and
decay gently rather than hard-clamp. Signals already provided by the massline side (do not
re-derive): `state.player.tether.slingshot` / `slingshotT` (tetherGameplay grants a ~1s window on
cuts ≥1.4× maxSpeed) and `massline:selfSling` bus events (`{bonusDv, exitSpeed, exitAngle}` from
`src/systems/masslineThrow.js`). Suggested model: while tagged, governor target =
max(normal ceiling, currentSpeed × e^(-t/τ)) with τ a tuning dial — control feel intact, earned
speed spectacular. Robin's ruling from the brief: keep the cap on thruster-GENERATED speed;
physics-earned velocity is the exemption.

ITEM 2 — Cloak drift ease (§4.2): while `state.massline2.cloak.active` AND no thrust input,
ease linear damping / lateral assist toward Newtonian so coasting dark feels like committing to a
ballistic arc. The mode-tuning scalars live in `src/core/flightDynamics.js` (`MODE_TUNING`,
`linearDragScale` / `lateralAssistScale`, ~:78-108). Robin's note: the inhibitor "is a bit
strong" — a MODEST ease (not full Newtonian) as a cloak-state modifier, never a global change.

FLIGHT-SIDE GOLDEN WARNING: flight V3 has its OWN golden — `check:sim:v3` /
`check:sim:v3:compare` against `test/47a.telemetry.v3.expected.json`. Both items MUST be inert
headless: gate on `massline2Flag(...)` (IS_BROWSER default, `src/data/featureFlags.js` — add
`slingExemption` / `cloakDrift` keys) or on the runtime signals (which never fire in the replay
tape) — prove it with a before/after byte-diff of BOTH `check:sim:compare` and
`check:sim:v3:compare`.

VERIFY: `npm run check:flight:v3 check:flight check:cruise check:autopilot check:juice
check:sim:v3:compare check:sim:compare check:massline2` green (minus documented pre-existing
reds: `check:proof-ritual`, `check:overnight:playable`, `check:save-schema`, `check:massline` via
scavenger-threat). Add a governor-exemption section to `scripts/check-massline2.mjs` OR a
flight-side check per lane convention. Non-vacuous control + `### M3-F FLIGHT HALVES` STATUS.md
entry with the dials (τ, drift-ease scalars) recorded.

---

## PROMPT G — All deferred items in one pass (A+B+C+D+E; F excluded)

You are implementing massline wave M3 for SpaceFace at `C:\Users\93rob\Documents\GitHub\SpaceFace`
— every item the M2 wave deliberately deferred, EXCEPT the flight-lane halves (those are
lane-owned; see PROMPT F in `design/revamp/MASSLINE_M3_HANDOFFS.md` and leave them alone).

READ FIRST, in order: `design/revamp/MASSLINE_PHYSICS_IDENTITY.md` (design decisions + dials),
the `### M2 MASSLINE PHYSICS IDENTITY — DONE (2026-07-12)` entry in `design/revamp/STATUS.md`
(architecture, seams, verification recipes, pre-existing reds), `scripts/check-massline2.mjs`
(your fixture/invariant model), and `src/data/featureFlags.js` (the MASSLINE2_FLAGS block).

THE FIVE WORK ITEMS — full specs are PROMPTS A–E in `design/revamp/MASSLINE_M3_HANDOFFS.md`
(same directory as the design doc). Read all five specs before coding; they contain the verified
seams (file:line), the contract-check landmines, and per-item acceptance criteria. Summary:
- A: bomb-propulsion ergonomics (drop-behind charge, self-impulse verified/tuned, tech-tree
  pacing, flag `bombPropulsion`) over the shipped `src/systems/impulseCharges.js`.
- B: cloak × customs (patrol scans can't initiate from outside the detection ring; jump-gate
  ruling documented; scannerCloak dice untouched) — economy.runScan is IN the sim harness, so
  emission-side gating in encounterScripts.js is the lower-risk seam.
- C: bullet-time audio (bus lowpass sweep + loop rate drop + music duck on bulletTime:start/end;
  headroom/voice/slider assertions in check:audio-identity are landmines).
- D: settings row for `masslineReleaseAssist` ('arm'|'snap'|'off') WITHOUT touching
  `defaultSettings()` (save-schema is red from foreign WIP — never regenerate it), + verify the
  CapsLock/Backquote verbs show in the rebind UI.
- E: indicator smoothness under bullet time (CSS transform transition + predictive lead;
  reduced-motion respected; no new rAF).

EXECUTION ORDER (cheapest risk first, shared files touched once): D → E → B → C → A.
Shared-file collision points you'll hit more than once — edit them coherently, not per-item:
`src/data/featureFlags.js` (new flags for A/B), `scripts/check-audio-identity.mjs` EMITTED_CUES
(A/C cues), `scripts/check-massline2.mjs` (new sections for A/B/D-behavior/E-style),
`design/revamp/STATUS.md` (ONE combined `### M3 MASSLINE DEFERRED SET — DONE` entry at the end,
plus per-item bullets).

GATE AFTER EVERY ITEM (cheap, targeted — this is the M2 discipline that kept the wave clean):
after each item run only its named checks from its spec section, plus `node --check` on touched
files. Run the EXPENSIVE full sweep ONCE at the end:
1. `npm run check:sim:compare` — BYTE-IDENTICAL to a capture you take BEFORE any edit (this is
   the golden gate; the documented trace-count report inside it is pre-existing).
2. `npm run check:massline2` (with your new sections) + one non-vacuous control per NEW check
   section (break the gate, watch it fail, restore, record in the ledger).
3. The M2 regression set: combat, core-combat-loop, controls-discoverability, settings-profile,
   sg06:registry-init, sg06:live-registry, pirate-disengage, onboarding, cargo-jettison-copy,
   module-risk, mass-delta, handling-profile, balance, audio-identity, cue-priority-bus,
   first-hour-audio, critical-signature-captions, presentation, sg02:tether, time-effects,
   flyby-focus, customs-prompt, economy:smuggling-authority, encounter-director.
4. Known pre-existing reds — expect and DO NOT chase: `check:proof-ritual` (B1 offset 71≠80),
   `check:overnight:playable` (market.js banner), `check:save-schema` (scenario drift — your
   after-output must diff-match the before-output), `check:massline` aggregate (red only via its
   `check:47a:scavenger-threat` child).

UNIVERSAL CONSTRAINTS (repeated because they are absolute): every flag defaults `IS_BROWSER`
(OFF headless) and is read at call time via `massline2Flag()`; new runtime state under
`state.massline2.*` only (unsaved, unsnapshotted); NEVER write `state.timeScale` anywhere
including check scripts (repo-wide writer audit); `git add -N` every new file the moment you
create it (the environment deletes untracked files); the tree carries other agents' WIP
(gameState.js, render/bloom.js, station screens, assets) — touch nothing outside your item specs;
do not edit `src/systems/flightV3.js`, `src/data/flightTuning.js`,
`src/core/flight/propulsionKernel.js`, or `src/core/flightDynamics.js`.

Browser verification recipe (hidden preview tabs suspend rAF; the new-game gate awaits rAF
forever): start server `spaceface` from `.claude/launch.json`; `SF.bus.emit('game:new')`; shim
`window.requestAnimationFrame = cb => setTimeout(cb,16)`; force `SF.state.mode='flight'` and
`SF.timeEffects.clear('runtime:loading')`; drive with synchronous bursts
`for(let i=0;i<N;i++) SF.registry.step(1/60)`; dispatch real KeyboardEvent/MouseEvent for input;
`helpers.worldToScreen` yields x:null without a live camera frame — verify screen-fixed DOM and
state instead.

FINAL REPORT MUST LIST: every new dial + value, every new flag, the jump-gate design ruling (B),
per-item check evidence, the sim:compare byte-diff statement, and anything you deliberately left
for an M4.
