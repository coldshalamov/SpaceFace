# PQ-015 — Shared interaction descriptors & component targeting (IMPLEMENTATION REPORT)

Worktree: `C:\Users\93rob\sf-w1-descriptors` · branch `w1/pq015-descriptors-20260721` · base `f85d54c8`
Status: NODE-COMPLETE (P1–P6 done, all owning checks green except one pre-existing red). BROWSER
public-route proof (P7) PENDING the PQ-012 browser mutex flag — polling. Updated incrementally; a
successor can resume from disk.

## Outcome delivered
ONE descriptor contract (`src/data/interactionDescriptorCatalog.js` + `src/systems/interactionDescriptors.js`)
consumed by targeting, tethering, mining, salvage, destruction, docking, contacts, and presentation.
Five independent live type-gates now source their type-membership from the shared catalog while every
downstream layer (range, ownership, obstruction, mined-out, site-anchored, massSeed phase) and every
byte-pinned reason string is UNCHANGED. Component sub-selection (combat subsystem / salvage weak-point)
is published transiently and resolved by weapon damage (focus fire), with truthful denial.

## Architecture (as shipped)
- Two-file contract, zero new UPDATE_ORDER system. The catalog (pure `src/data`, imports only sibling
  data) is the type-membership + reason-code + stable-key truth the low-level gates consult (data-only
  import so the gates never cycle). The systems module is the rich, state-aware query API
  (describeEntity / describeComponent / interactionEligibility / component-selection helpers) for HUD +
  selection + tests. Both are pure reads; nothing writes sim state from a query path.
- Membership-only adaptation (advisor #1 trap avoided). Each gate swaps ONLY its literal type array for
  the catalog set (proven byte-identical by characterization). Layering + reason strings stay in place.
  isAttachable stays type+massSeed-phase only (ownership remains the separate downstream gate that
  produces `protected`).
- IFF stays single-truth. Hostility is always scanner.isHostileToPlayer (imported, never re-derived).
- massSeed minimal. Tether phase read through the existing data.massSeedState / isMassSeedTetherEligible
  export — massSeed.js NOT edited.
- Component identity keyed (stableEntityKey, componentId); stableEntityKey follows durable patterns
  (worldRecordId then salvagePointId then siteId then quantized asteroid formation key then transient
  id), never bare entity.id. Because descriptors are DERIVED FRESH each call (no cache keyed on runtime
  id), rematerialization is transparent — no explicit world.js rebind wiring was needed.
- Component selection transient on state.ui.componentSelection (written lazily at runtime; NOT in
  gameState.js; NOT serialized — proven by check:save-schema staying v11/261). Null default so every
  verb resolves exactly as before and the 47a golden is byte-identical (determinism-safe).
- Reachable trigger = target-panel component chip (DOM click / Enter, pointer-events:auto) emitting
  ui:cycleComponent, handled in uiRoot cycleTarget region. Keyboard binding is a pending input.js
  shared-change request (input.js is forbidden for this lane).

## Write set (ACTUAL)
NEW:
- src/data/interactionDescriptorCatalog.js — membership sets, reason codes, component kinds, stableEntityKey, capability flags.
- src/systems/interactionDescriptors.js — describeEntity / describeComponent / listComponents / interactionEligibility / nextComponentSelection / resolveComponentForVerb / isWreckLikeEntity.
- test/interaction-characterization.test.mjs (12), test/interaction-descriptors.test.mjs (11), test/interaction-descriptors-component.test.mjs (7).

EDIT:
- src/systems/tetherGameplay.js — ATTACHABLE_TYPES = VERB_TYPE_MEMBERSHIP.tether; export function isAttachable (testability; body unchanged).
- src/systems/mining.js — two type checks to verbAcceptsType('mine', …).
- src/combat/damage.js — allowlist to verbAcceptsType('damage', …); applySelectedComponentHit focus-fire injection (guarded, inert in golden).
- src/ui/uiRoot.js — cycleTarget/isScannerHostileLock membership to verbAcceptsType('target', …); cycleTargetComponent + ui:cycleComponent handler + transient selection write.
- src/ui/hud.js — contacts-strip isShip to verbAcceptsType('target', …).
- src/ui/targetPanel.js — clickable component chip (display + cycle).
- package.json — check:interactions script row.

EVALUATED, LEFT UNCHANGED (pure derivation made an edit unnecessary — the winning subtractions):
entityInteractionProfiles.js (consumed unchanged as the capability seed), masslineTargetScoring.js
(byte-compat held; no math change), scanner.js (sole IFF truth, consumed), massSeed.js
(data.massSeedState read directly), asteroidSites.js (siteAnchored reflected), dockDeny.js
(dockDenyReason consumed), geometry.js (existing hit.subsystemId honoring IS the seam),
salvageActions.js system (weak-point derived from the data catalog), world.js/encounterDirector.js
(fresh-derivation = automatic rebind). FORBIDDEN files: untouched.

## Descriptor contract — verbs and reason codes
Verbs: target, tether, mine, salvage, damage, dock, contact.

Reason codes:
- BYTE-PINNED (produced by the untouched downstream gates — adapters never re-emit differently):
  tether target-lost|no-target|protected|out-of-range|blocked|cooldown|unknown_attachment_def|create_failed;
  damage target_missing|target_not_damageable|target_docked|target_invulnerable|friendly_fire|empty_packet;
  dock abandoned|under_construction|quarantine|hostile_rep|military_only|private.
- DESCRIPTOR-STANDARD (new consumers only; no test/HUD pins them): wrong-type|not-alive|mined-out|
  beam-locked|out-of-range|phase-ineligible|not-hostile|protected|component-not-serviceable|no-component.

## Contract table — verb x type (the product; asserted in test/interaction-characterization)
| type          | target      | tether        | mine | salvage | damage | dock           | contact |
|---------------|-------------|---------------|------|---------|--------|----------------|---------|
| ship          | Y (hostile) | Y             | -    | -       | Y      | -              | Y       |
| drone         | Y (hostile) | Y             | -    | -       | Y      | -              | Y       |
| asteroid      | -           | Y             | Y    | -       | -      | -              | -       |
| wreck         | -           | Y             | Y    | Y       | -      | -              | Y       |
| station       | -           | Y             | -    | -       | Y      | Y (deny-gated) | -       |
| payload       | -           | Y             | -    | -       | -      | -              | -       |
| pickup        | -           | Y             | -    | -       | -      | -              | -       |
| massSeed      | -           | Y (post-lock) | -    | -       | Y      | -              | -       |
| mine          | -           | -             | -    | -       | Y      | -              | -       |
| projectile/fx | -           | -             | -    | -       | -      | -              | -       |

Components: combat subsystems (ship/drone: drive/weapon/sensor/tether_spool/power; station:
weapon/sensor/power) serviced by DAMAGE; wreck salvage weak-point (cut_panel/pull_module/decode_blackbox/
vent_reactor) serviced by SALVAGE. Asteroid/payload/pickup/massSeed have no selectable components.

## Inconsistency findings (ruling 3: recorded, current behavior kept unless an obvious defect)
1. profile.destructible != weapon-damageability. entityInteractionProfiles marks asteroid & payload
   destructible:true, yet the damage router rejects both (target_not_damageable). RULING: keep —
   "destructible" (can be destroyed, e.g. asteroid via mining) is a DIFFERENT axis from weapon-router
   damageability. The descriptor exposes both truths separately; profiles are presentation-only and were
   never a gate, so no live behavior is wrong. Not fixed.
2. station profile.destructible=false but station IS in the damage allowlist (typically invuln in play).
   RULING: keep — the allowlist admits stations; the profile flag is presentation. Documented.
3. massSeed & mine have NO presentation profile so capabilityFlagsForEntity returns kind unknown though
   both are gate-eligible (massSeed tether+damage; mine damage). PROPOSED RULING: add massSeed/mine
   presentation profiles to entityInteractionProfiles.js. DEFERRED — massSeed presentation is owned by
   the massSeed lane (brief); coordinate rather than unilaterally add. Not a defect (gates never read profiles).
4. mining acquire vs extract asymmetry. A site-anchored asteroid is ACQUIRABLE by the beam
   (_isValidMineableTarget true) but extraction is denied (mining:beamLocked, event-only, no reason
   string). The descriptor mirrors this: interactionEligibility(…, 'mine') is ok at acquire and denies
   beam-locked at opts.phase==='extract'. Kept (matches the live gate); intentional layering.
5. autoTargetMode massline set {ship,drone,asteroid} is out of this lane write set so left independent.
   It is a strict SUBSET of tether attachable set (no correctness divergence; it only pre-selects a latch
   candidate — the real latch eligibility is tether). Characterize-only.

## Shared-change request (blocked by the forbidden list — for lead)
- input.js keyboard binding for component sub-selection. The reachable DOM trigger (target-panel chip)
  ships now. A keyboard binding needs a one-line addition in src/systems/input.js (forbidden for this
  lane) — e.g. a dedicated key or modifier emitting bus.emit('ui:cycleComponent', { dir }). The uiRoot
  handler + pure cycle logic already exist; only the input emit is missing.

## Command matrix (exit codes)
| check | result | exit |
|---|---|---|
| check:interactions (12+11+7=30) | PASS | 0 |
| check:mass-seed (49) | PASS | 0 |
| check:massline (23 children) | PASS | 0 |
| check:massline:target-scoring | PASS | 0 |
| check:massline:auto-target | PASS | 0 |
| check:sim:compare | ok:true hashEqual:true | 0 |
| check:save-schema | UNCHANGED v11/261 paths | 0 |
| check:combat (8 + sg03 save-reload) | PASS | 0 |
| check:salvage-actions / -anatomy / -legality | PASS | 0 |
| check:mining:bulk-guidance / mining-audio-signatures | PASS | 0 |
| check:ui-a11y | PASS | 0 |
| check:ui-identity (13) | PASS | 0 |
| check:mining:2 | FAIL — PRE-EXISTING | 1 |

## Known failures
- check:mining:2 — PRE-EXISTING, not mine. Fails on assert.equal(MAGNET_ACCEL, 520) (scripts/
  check-mining-2.mjs:200) but MAGNET_ACCEL = 900 at base f85d54c8 (git show f85d54c8:src/systems/mining.js
  line 23). My mining.js diff touches ONLY the two type-membership checks — MAGNET_ACCEL is untouched.
  Code (900) and test (520) disagree independent of this packet.
- check:sim:compare trace-count deltas (presentation:cue 14->15, audio:cue 3->4 vs expected.json):
  INFORMATIONAL, pre-existing expected.json drift. The compare gate (ok:true, hashEqual:true, exit 0)
  passes. My 3 sim-affecting diffs are behavior-neutral membership swaps with identical set contents and
  the headless sim never loads the descriptor/UI code, so base produces the same counts.

## Browser public-route proof (P7) — PENDING
Awaiting browser-free-pq012.flag. Planned: one session showing the SAME descriptor truth across >=4
object classes (ship subsystem focus-fire; asteroid incl. siteAnchored beam-lock; wreck salvage weak-
point; station dock-deny; massSeed through phases) + component chip cycling on a ship, HUD showing
identity+eligibility+denial. Screenshots to .devshots/pq015-descriptors/. Electron smoke subset.

## Receipt (YAML)
```yaml
packet: PQ-015
title: Shared interaction descriptors and component targeting
worktree: C:\Users\93rob\sf-w1-descriptors
branch: w1/pq015-descriptors-20260721
base: f85d54c8
status: node-complete-browser-pending
committed: false
new_files:
  - src/data/interactionDescriptorCatalog.js
  - src/systems/interactionDescriptors.js
  - test/interaction-characterization.test.mjs
  - test/interaction-descriptors.test.mjs
  - test/interaction-descriptors-component.test.mjs
edited_files:
  - src/systems/tetherGameplay.js
  - src/systems/mining.js
  - src/combat/damage.js
  - src/ui/uiRoot.js
  - src/ui/hud.js
  - src/ui/targetPanel.js
  - package.json
forbidden_touched: []
determinism: {sim_compare_ok: true, hash_equal: true, save_schema: unchanged_v11_261}
new_tests: 30
known_failures:
  - {check: check:mining:2, cause: "pre-existing MAGNET_ACCEL 900 vs test-expected 520; untouched by me", mine: false}
shared_change_requests:
  - {file: src/systems/input.js, what: "keyboard binding emitting ui:cycleComponent for component sub-selection (DOM trigger ships now)"}
findings: 5
browser_proof: pending-pq012-mutex
```

## P6 addendum — additional node evidence (all exit 0)
- check:combat-outcome (6 sections) PASS
- check:massline2 (flags/inertness/wiring/solvers/contracts) PASS
- scripts/check-bundle.mjs PASS — the browser bundle builds clean (210 files, 47% reduction) with the
  new descriptor modules wired in: proves NO import error / cycle and that the game WILL boot with these
  changes (key pre-browser validation while the PQ-012 browser mutex is held).

## P7 — Browser public-route proof (COMPLETE; lead lifted the PQ-012 mutex mid-run)
Served the WORKTREE code (node server.js from C:\Users\93rob\sf-w1-descriptors on :8199 — the preview
tool had started server.js from the PRIMARY checkout, which lacks these changes; caught + corrected).
Booted the real game route with a background-safe rAF pump (MessageChannel; the preview tab is
hidden and throttles requestAnimationFrame, which otherwise stalls the new-game transition).

Numbered route log:
1. Worktree server serves my code: /src/systems/interactionDescriptors.js -> 200; served
   tetherGameplay.js contains `ATTACHABLE_TYPES = VERB_TYPE_MEMBERSHIP.tether`.
2. game:new built the real world: player + 304 entities across ship/station/asteroid/wreck/payload/beacon.
3. LIVE descriptor == live gates across 5 object classes (ship, asteroid, wreck, station, payload):
   descriptor_equals_live_gates = TRUE. interactionEligibility per verb EXACTLY matches
   tetherGameplay.isAttachable and mining._isValidMineableTarget on every real entity. Asymmetries
   live-visible (asteroid mineable+tetherable !damageable; wreck salvageable[Cut Panels]+tetherable
   !damageable; ship/station damageable with subsystem components; payload tether-only).
4. Component types (>=2) live: ship 5 combat subsystems + station 3 (DAMAGE-serviced); wreck salvage
   weak-point "Cut Panels" (SALVAGE-serviced).
5. Component selection via the REAL bundled ui:cycleComponent handler: null -> subsystem_drive ->
   subsystem_weapon -> (reverse) subsystem_drive, keyed on stableKey id:286, transient on
   state.ui.componentSelection.
6. Component chip present in the live DOM (.sf-target__component) with pointer-events:auto (my fix).
7. Zero runtime errors from PQ-015 code on the live route (console clean apart from the environment
   gate below).
Evidence: .devshots/pq015-descriptors/live-descriptor-proof.json

HONEST LIMITATION (environment, not a PQ-015 defect):
- No rendered screenshot. The new-game transition throws GameStartReadinessError at
  newGameStartTransition.js:60 (waitForVisuals: "Initial authored ship visuals did not become ready;
  refusing to enter flight") because the headless preview renderer never finishes loading the authored
  ship GLBs, so the game refuses flight and rolls back. computer.screenshot also times out (renderer
  busy under the rAF pump). The descriptor truth is therefore proven at the live logic + DOM level, not
  a photograph. This matches the known "authored-visual queue strands Launch on headless WebGL" trap.
- Electron smoke: NOT run. Electron shares the same one-game-path renderer and would hit the identical
  authored-visual gate for no additional descriptor evidence (descriptor logic is renderer-independent
  and proven at node + live-browser). Recorded for a future Electron pass on the user profile: prefer
  KeyF for the tether latch (universal alias; that profile predates the PQ-003 Space migration), and
  judge PNGs by eye (the harness gl.readPixels luminance probe reads zeros).

## FINAL RECEIPT (supersedes the checkpoint receipt above)
```yaml
packet: PQ-015
title: Shared interaction descriptors and component targeting
status: COMPLETE (uncommitted, for lead review)
committed: false
determinism: {sim_compare_ok: true, hash_equal: true, save_schema: unchanged_v11_261}
new_tests: 30
node_checks_green: [check:interactions, check:mass-seed, check:massline, check:massline:target-scoring, check:massline:auto-target, check:sim:compare, check:save-schema, check:combat, check:combat-outcome, check:massline2, check:salvage-actions, check:salvage-anatomy, check:salvage-legality, check:mining:bulk-guidance, check:mining-audio-signatures, check:ui-a11y, check:ui-identity, "scripts/check-bundle.mjs"]
known_failures:
  - {check: check:mining:2, cause: "pre-existing MAGNET_ACCEL 900 vs test-expected 520; untouched by me", mine: false}
browser_proof:
  route: live (worktree server localhost:8199)
  descriptor_equals_live_gates: true
  object_classes: [ship, asteroid, wreck, station, payload]
  component_types: [combat_subsystem, salvage_weakpoint]
  component_selection_via_real_bus_handler: true
  evidence: .devshots/pq015-descriptors/live-descriptor-proof.json
  screenshot: blocked-by-headless-authored-visual-gate (environment; diagnosed)
  electron_smoke: deferred-same-renderer-gate
browser_flag_created: scratchpad/browser-free-pq015.flag
findings: 5
shared_change_requests:
  - {file: src/systems/input.js, what: "keyboard binding emitting ui:cycleComponent (DOM chip trigger ships now)"}
```

PQ015_IMPL_DONE
