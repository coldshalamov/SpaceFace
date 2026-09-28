# IMPORT ledger — 20260928 owner-side import (devin-w3-vm-latche, board §1C row 26)

Quiet-latch render/sim wave E — the remaining quiet-latch vein folders the earlier
latch waves left. Landed this pass:

| Folder | Commit | Check |
|---|---|---|
| `seam-markers-quiet-hide-latch` | `32a171444` | dynamic-buffer-ranges 24/24 + trail-streak-instancing + vfx-additive-single-pass + `check:thruster:propulsion-family` 68/68 |
| `status-attached-quiet-empty-latch` | `ed26d8d5b` | focused `status-attached-vfx` 4/4 (DONE-named `inf-045-target-contour.test.mjs` does not exist on this checkout) |
| `tumble-body-language-quiet-skip` | `7e5af81ee` | pitch/tumble battery 42/42 (hand-merged onto master's newer `updateShipPitchPresentation` signature) |
| `trail-emit-idle-drive-walk` | `4d4813380` | trail/thruster battery 74/74 (hand-merged) |
| `npc-job-signatures-quiet-sleep-latch` | `8def07219` | focused 4/4 (hand-merged; the row-20/24 trap cleared once sibling latch resets + fatlist refactor were both on master) |
| `projectile-trails-quiet-empty-latch` | `a58d7807e` | focused 4/4 |
| `overlay-quartet-quiet-empty-latch` | `4bf905096` | focused 6/6 (the row-22 deferral resolved — its #122 dependency landed above) |
| `speed-lines-quiet-idle-latch` | `3cdf60fc0` | focused latch 3/3 + named 9-file battery 29 pass/0 fail |

Already on master before this pass (verified by marker/commit, no re-import):

- `sanctuary-empty-quiet-latch` — `892cb7150`
- `pending-detonations-quiet-empty-latch` — `a98e4cd99`
- `countermeasures-quiet-empty-latch` — `180372926` (+ sibling-contract hardening
  `cf3f8272f`); focused `countermeasures-quiet-empty-latch` 8/8 on master
- `pirate-disengage-empty-quiet-latch` — `5a90fb13b` (+ hardening `f758ba0ca`)
- `pirate-parley-empty-quiet-latch` — `c3ef771e2` (+ hardening `f758ba0ca`)
- `salvage-unstable-quiet-empty-latch` — `47af49265`
- `tactical-ai-quiet-latch` — `371c52dcb`
- `tumble-states-quiet-latch` — `833ca50f0` (incl. `impulseProvenanceGeneration`
  wake in `src/combat/impulseKernel.js`)

Skipped this pass:

- `poi-scan-all-identified-quiet-latch` — sole src hunk edits `src/systems/world.js`,
  which is under a live foreign claim this pass; left untouched for that lane.

Merge notes:

- `tumble-body-language-quiet-skip`: patch predates master's two-argument
  `updateShipPitchPresentation`; only the pitch-presentation epoch + vfx wake hunks
  were ported, master's signature/behavior preserved.
- `trail-emit-idle-drive-walk` and `npc-job-signatures-quiet-sleep-latch`:
  hand-merged onto drifted `vfx.js` reset lines / `npcJobsRuntime` fatlist-era
  dispatch; `+` insertions preserved, master's newer resets kept.
- `countermeasures-quiet-empty-latch` apply was aborted mid-3way on discovering the
  package already landed hardened; tree restored clean, nothing re-applied.

Every `*-quiet-latch` vein folder is now dispositioned across waves A–E: landed,
verified already-on-master, or recorded as skipped-with-reason. Remaining
`*-skip`/HOLD/report folders belong to rows 27/28/30 or the HOLD list — untouched.

# IMPORT ledger — 20260928 owner-side import (devin-w2-vm-latchb, board §1C row 23)

Quiet-latch vein B (`combat-*` / `weapon-*` / `bombs-*` / `bomb-*` / `quarks-*` /
`wave-presenter-*` / `bounty-hunt-*` / `midflight-*` / `well-distortion-*` /
`wreck-wisps-*`). Landed this pass:

| Folder | Commit | Check |
|---|---|---|
| `combat-prephysics-quiet-residual` | `b6b1cc24c` | focused combat battery 101/101 |
| `combat-postphysics-quiet-latch` | `d2144d2a9` | focused 38/38 |
| `combat-postphysics-quiet-skip` | `8cdcea557` | focused 106/106 (test contract widened) |
| `weapon-ribbon-quiet-live-skip` | `72fb13a88` | focused 57/57 |
| `weapon-light-quiet-live-skip` | `5f04e0f57` | focused 98/98 |
| `weapon-discharge-quiet-active-skip` | `d8998d4a7` | focused 36/36 |
| `well-distortion-quiet-empty-latch` | `c63314bbc` | focused 51/51 |
| `quarks-quiet-empty-update` | `04d700449` | quarks 26/26 + vfx-techniques 10/10 + debris-sling |
| `weapon-presenter-composite-quiet-latch` | `351d6ab84` | focused 26/26 |
| `wreck-wisps-quiet-irrelevant-latch` | `a267379e2` | latch 4/4; named 7-file suite 12/13 (sole red pre-existing at HEAD → D89) |
| `bomb-presentation-quiet-empty-latch` | `64b8a0869` | focused 9/9 |

Already on master before this pass (verified, no re-import):

- `combat-prephysics-quiet-latch` — `d1aaaace5` + `2b1874f53`
- `combat-outcome-quiet-latch` — `df8e5f3b9`
- `combat-actions-advance-quiet-skip` — `2a71dc877`
- `combat-status-subsystem-quiet-skip` — `8d192bfe1`
- `combat-subsystem-key-cache` — `f698dc20d`
- `combat-table-pose-incremental` — `39d58e4f5`
- `weapons-npc-quiet-latch` — `3c24a1ee9` (D62 carry-note already folded in at that
  commit; ledger row D62 retired this pass — `_tickLock(e, dt, state)` is live at
  `src/systems/weapons.js:776`)
- `bombs-empty-quiet-latch` — `cfc932285`
- `bounty-hunt-empty-quiet-latch` — `45a2e0897` (+ hardening `cf3f8272f`,
  republish `24294629b`)
- `combat-kernel-profile-reuse` — fully superseded on master: `statusChanged`-gated
  trailing `syncCombatantBounds` (`src/combat/kernel.js:267`), `coolCombatHeat`
  cooling from the `runtime.heatDissipationPerTick` stash (`kernel.js:422`), the
  stash stamped/backfilled in `runtime.js:73-96,182`, and the postPhysics ensure
  skip subsumed by the fresh-cache skip landed in `8cdcea557`. No re-export needed.

Skipped this pass:

- `midflight-wave-hull-decode` — measured miss on the remote host by its own
  DONE.md (hitch callbacks 253→279, game speed 42.5%→30.8%, peak admission
  11→22 ms); ships no patches. Deliberate non-import.

Merge notes:

- `combat-prephysics-quiet-residual`, `combat-postphysics-quiet-skip`: hand-merged
  onto the newer latch/sorted-cache structures the earlier combat packages left;
  the postphysics test was updated to the widened skip contract (postPhysics may
  now skip on a tick-fresh sorted cache even when the prePhysics latch is disarmed).
- `quarks-quiet-empty-update`: gate additionally checks `flow.live` — a live
  force-transport burst must never be frozen by the ordinary-family latch.
- `weapon-presenter-composite-quiet-latch`: adapted for `heavyImpacts.live/dirty`
  (post-export pool) and for `quarks._quietEmpty` arming on zero-dt frames
  (simTime-frozen frames still record an empty observe); test drain loop advances
  `state.simTime` to match the current `dt<=0` update guard.
- `wreck-wisps-quiet-irrelevant-latch`: boundary-reset hunk re-applied onto the
  current `sector:enter`/`game:newGame`/`save:loaded` flag lists (drifted since
  export).
- `bomb-presentation-quiet-empty-latch`: latch additionally requires no live
  aftermath parcels (`flow.count`) or particles; test drawCall/children-count
  assertions updated from `== 1` to `>= 1` for the multi-pool pipeline.

Stale board note for the next lane: §1C row 29 (`VM-WEAPONS-D62`) is satisfied —
`weapons-npc-quiet-latch` landed at `3c24a1ee9` with the carry note applied.

# IMPORT ledger — 20260928 owner-side import (devin-w2-vm-latchd, board §1C row 25)

Latch-wave-D batch (docking-*/customs-*/opening-plan-*/undock-host-*/catch-nets-*/
npc-job-signatures/loot-magnet/law-heat/bark-director) processed on master.

Landed this pass:

| Folder | Commit | Check |
|---|---|---|
| `docking-cradle-quiet-skip` | content swept into `726c821e8` (sibling vfx amend; original commit `0bcb475f9` orphaned) | focused 2/2 |
| `loot-magnet-quiet-empty-latch` | src restored+landed by latchc in `30d61a3dc` after a shared-tree checkout wiped my unstaged apply (incl. my hand-merged reset-line insertions); test `2ec74a6d9` | focused 4/4 |
| `docking-corridor-far-quiet-latch` | `c61cfc085` | focused 6/6; corridor suite 48/51 = bare-master failure set |
| `bark-director-quiet-latch` | `6e46f9722` | focused 3/3 |
| `opening-plan-complete` | `c654be977` | focused 23/23 |

Already on master before this pass (verified, no re-import): `law-heat-telegraph-quiet-skip`
(`546f75f78`), `catch-nets-empty-quiet-latch` (`61724111f`), `docking-corridor-publish-scratch`
(`977ed0b85`), `customs-scan-cone-scratch` (`dec9613bc`), `npc-jobs-id-list-cache` (`f59b91b49`).

Skipped this pass:

- `npc-job-signatures-quiet-sleep-latch` — still the documented trap, now wider: the vfx.js
  reset-line hunk still needs sibling resets (`_statusAttachedQuiet*`/`_tumbleBodyQuiet*`/
  `_trailEmitQuiet*`/`_wreckWispsQuiet*`), and on top of that the `_sleepNpcJobSignatures`/
  `sub.npcJobSignatures` dispatch region plus `npcJobsRuntime` `_ensureState`/`_byId` hunks have
  drifted under the fatlist typed-index refactor. Needs sibling latches first / re-export.
- `customs-cones-empty-quiet-latch` — master's `78fd174b3` empty-payloads early-out now covers the
  dominant empty case and sits *before* the patch's census-tail arm, so the latch can never arm and
  its own test would fail. Subsumed by the early-out; re-export only if a residuals profile still
  shows the census cost (arm would need to live inside the early-out branch).
- `undock-host-*` — no folder exists on disk or on `origin/vm-drop`; board-list name only.

Shared-tree notes: `docking-corridor-far-quiet-latch` and `bark-director-quiet-latch` were
hand-merged around post-export drift (`_manifestCache`, `_manifestFor`, `_onVictimKilled`) — all
`+` insertions preserved verbatim. Stray root `artifacts/` payload from the loot-magnet patch
removed — identical copies live in the job folder. See latchc's ledger above for their side of
the mid-flight sweep.

# IMPORT ledger — 20260928 owner-side import (devin-w2-vm-latchc, board §1C row 24)

Quiet-latch vein C (`field-force` / `fields-*` / `energy-*` / `flight-*` / `gas` /
`momentum-sink` / `far-*` / `asteroid-field-*` / `track-pulse` / `flyby-focus` /
`optic-lattice` / `continuous-plume-profile`). Landed this pass:

| Folder | Commit | Check |
|---|---|---|
| `fields-idle-quiet-latch` | `26b4e5ff9` | latch 5/5 + fields regression 53/53 |
| `field-force-quiet-empty-latch` | `86f3beac9` | latch 3/3 |
| `far-empty-quiet-latch` | `902e0b536` | latch + far-actor suite 21/21 |
| `optic-field-resident` | `50cc3f2b7` | optic-focused suite 19/19 |
| `optic-far-quiet-latch` | `2f520206e` | 21/21 |
| `asteroid-field-interact-still-quiet-latch` | `4aa43250d` | 6/6 |
| `flyby-focus-empty-quiet-latch` | `b85654a83` | 10/10 |
| `flight-propulsion-scratch` | `76c03a7d6` | flight suite 55/55 |
| `continuous-plume-fleet-quiet-asleep` | `e654a81d4` | plume/VP-220 suite 78/81 |
| `energy-bolt-quiet-begin-commit` | `f410f490f` | weapons/vfx suite 51/53 |
| `energy-quiet-hide-latch` + `energy-quiet-relevant-skip` + `gas-quiet-empty-latch` | `30d61a3dc` | gas latch 4/4, vfx-field-geometry-sleep 3/3 |

Merge notes:

- `optic-far-quiet-latch`: its `asteroidField.js` source hunks were folded into the preceding
  `50cc3f2b7` commit during the partial-apply sequence; `2f520206e` carries the test.
- `fields-idle-quiet-latch`: hand-merged over master's newer seed-lock/inside-ring fields work;
  quiet fast-return additionally gated on empty `_wellBodies` so deferred well drains still run.
- `field-force-quiet-empty-latch`: hand-merged over master's `particles` subsystem; latch gated
  on `particles.live` so a live release burst is never frozen.
- `optic-field-resident`: intentionally moves Ceres optic lattices from live `entityList` into
  `state.world.asteroidField.rocks` until decode-disc approach. Six older tests asserting the
  live-entity contract were adapted to field records (`field.rocks`/`byId`, `opticStructureId`,
  `opticCell`, `opticMaterial`); behavioral assertions preserved.
- `flight-propulsion-scratch`: master already carried the equivalent optimization
  (`bodySnapshotInto` out-param + `stepPropulsion` packet buffers); landed the residual
  stepTorch `coolRuntime` call-site — the only remaining `{ ...runtime }` spread.
- `energy-quiet-relevant-skip` depends on `energy-quiet-hide-latch` (`_energyQuietHidden`
  comment/reset context) — applied in that order.
- `gas-quiet-empty-latch`: reset-line hunks keyed on ~10 sibling latches absent on master
  (statusAttached/tumbleBody/trailEmit/projectileTrails/overlayQuartet/wreckWisps/
  npcJobSignatures) — context-only drift, not a functional dependency. Hand-merged additively:
  `_gasQuietEmpty` init + `= false` in the three boundary-reset handler lines.

Shared-tree incidents this pass (named, not unpicked, per AGENTS.md):

- `76c03a7d6` index-wide commit swept two foreign staged files
  (`src/render/weapons/shieldBubblePresentation.js`, `test/shield-bubble-quiet-latch.test.mjs`
  — devin-w2-vm-head/#159 work); noted in its commit body.
- During devin-w2-vm-latchd's mid-merge window a `git checkout` accident reverted their
  UNSTAGED `loot-magnet-quiet-empty-latch` apply in `vfx.js`. It was reconstituted additively
  from the remote patch (constructor + reset lines + update latch; their untracked
  test/artifacts left for them). Those restored hunks rode along in `30d61a3dc` — named there.
- An amend race rewrote a sibling vfx+docking commit's message; corrected at `726c821e8`.

Already on master before this pass (verified by marker/commit, no re-import):

- `flight-dormant-skip` — `2beba5609`
- `momentum-sink-quiet-empty-latch` — `546f75f78`
- `fields-npc-plan-cadence` — `95501f84f` + `50298eba1`
- `far-query-row-scan` — `b535d8a0b` (+ `test/far-query-row-scan.test.mjs`)

Not found on disk (vein names from the brief with no matching package folder):
`track-pulse`; literal `optic-lattice` — the optic-lattice vein was served by
`optic-field-resident` + `optic-far-quiet-latch` above.

Baseline: `check:baseline` 15/16. The `pq020-ceres-topology` red is the pre-existing,
ledger-owned D83 `structuralCostDigest` drift (Forge merge; adjudicate-then-re-pin owned by
graphics/forge lane — do-not-silently-re-record). The optic-resident import legitimately
changes Ceres live-entity census and may shift that digest further; flagged for the owning
lane, pin untouched.

Focused-suite non-blocking reds seen but not caused by these imports (verified by
revert-rerun): `kestrel-production-thruster-bind` 3 fails (plume visuals, sibling churn);
`vfx-mach-tracers`/`weapon-source-identity` 2 fails (Mach-tracer/wake, sibling churn).

# IMPORT ledger — 20260928 owner-side import (devin-w2-vm-head, board §1C row 19)

Digest head-of-queue batch. Most of the named list was already on master (the #166–#170 head
packages landed 2026-09-24; the #160–#163 registry latches landed earlier too). Landed this pass:

| Folder | Commit | Check |
|---|---|---|
| `perf-heap-sample-gate` (#165) | `747b49e2e` | focused 38/38 (`test/perf-counters.test.mjs`) |
| `shield-bubble-quiet-latch` (#159) | swept into foreign commits `726c821e8` (renderer.js + module) + `76c03a7d6` (test file) — content verified on HEAD | focused latch 6/6; ship-aux suite 13/14 (1 pre-existing: `vfx-shield-shell-and-field-material` GLSL pin expects `iPivot.z`, source has `floor(iPivot.z)` — stale test, unrelated) |
| `sync-entity-lod-retain` (#157) | `0ce3ff965` | focused 23/23 |

#159 merge note: `git apply --3way` conflicted on one hunk — master's fallback-bubble block had
drifted to a freeze-aware `presFrameDt` decay + inline `shouldPresentShieldBubble`. Resolved
keeping BOTH: the patch's extracted module/latch, and master's freeze contract via a new optional
`frameDt` arg on `updateEntityShieldBubblePresentation` (null = patch's shipped `now`-derived dt;
tests exercise that path unchanged).

Already on master before this pass (verified by marker/commit, no re-import):

- `render-package-digest-zero-copy` (#166) — `98477e85c`
- `embedded-ktx2-single-copy` (#167) — `57761c64e`
- `glb-body-in-place` (#168) **incl. `patches-after-167`** — `42217a40a` (the +8 hunk into
  `embeddedKtx2Textures.js` is inside that commit; `parser.glbBodySliceRange` present at
  `embeddedKtx2Textures.js:151`)
- `shader-readiness-no-isprogram` (#169) — `a0824bc3d`
- `retail-gltfloader-vendored-alias` (#170) — `69f471d89`
- `combat-outcome-quiet-latch` (#163) — `df8e5f3b9`
- `difficulty-director-quiet-latch` (#162) — `c7067ccc9`
- `ai-encounter-quiet-latch` (#161) — `a2584c946`
- `faction-presence-quiet-latch` (#160) — `3b6f2c20f`

Skipped this pass:

- `hull-integrity-quiet-latch` (#164) — its only src hunk edits `src/ui/views/hullIntegrity.js`;
  `src/ui/**` is the ORRERY-claimed lane (same boundary as the row-21/22 `hud-*`/`massline` skips).
  Left for a UI-owning sitting.
- `radar-contacts-still-layer` (#158) — src hunk edits `src/ui/radar.js`; ORRERY-claimed. Left for
  a UI-owning sitting.
- `radar-asteroid-still-layer` (#156) — same `src/ui/radar.js`; ORRERY-claimed. Left for a
  UI-owning sitting.

# IMPORT ledger — 20260928 owner-side import (devin-w2-vm-latcha, board §1C row 22)

Quiet-latch vein A (`hud-*` / `classify-*` / `decode-runway-*` + `overlay-quartet`). Most of the
vein is stale against current master: `selectClassifyEntities` has been rewritten since the VM
exported (discovery-authority walk, `discoverWu`, `entityPresenceRadius`, coherent hash cache),
and every patch keyed on the old catch-up walk or runtime init block fails `git apply` on content,
not whitespace. Landed this pass:

| Folder | Commit | Check |
|---|---|---|
| `classify-physics-partition-cache` | `05f3b71e0` | focused 75/75 (7-file activity/physics set) |
| `classify-normalize-pins-small-n` | `c14767a78` | focused 35/35 |

Already on master before this pass (verified, no re-import): `flyby-focus-empty-quiet-latch`
(`b85654a83` — nearest match for the brief's `classify-flyby-ui-empty`).

Skipped this pass:

- `hud-credits-pulse-no-reflow`, `hud-glag-transform-cache`, `hud-objective-plate-cache`,
  `hud-screen-transform-cache`, `hud-settext-cache` — every patch edits `src/ui/hud.js`;
  `src/ui/**` is the ORRERY-claimed lane (same boundary as `massline-settext-cache` row 21).
  Left for a UI-owning sitting.
- `classify-closed-form-index` (#37), `classify-signature-prune-membership` (#38),
  `classify-signature-record` (#45), `classify-rock-body-context` (#48),
  `classify-pinfacts-cache`, `classify-closed-form-scan`,
  `classify-rock-visit-quiet-retain` (#127), `classify-frame-quiet-retain` (#128),
  `classify-early-quiet-latch` (#138), `classify-flying-rock-retain` (#141) — context drift
  vs current `src/world/activityRuntime.js` (the catch-up walk the patches re-key was
  rewritten; the #127→#128→#138→#141 retain chain also stacks on the missing earlier
  packages). Non-trivial; needs re-export against current master. `classify-closed-form-scan`
  is superseded by `classify-pinfacts-cache` regardless — re-export the combined one.
- `decode-runway-empty-far-quiet-latch` — `presentationSources.js` hunk fails (context
  drifted); `farActorTable.js` is also in the row-24 sibling's claimed paths. Needs re-export.
- `decode-runway-top2-select` — `renderer.js` hunk fails; `src/render/renderer.js` was also
  mid-merge (unmerged UU index state) this pass — foreign operation in flight. Needs re-export.
- `overlay-quartet-quiet-empty-latch` (#123) — its `vfx.js` hunks stack on #122
  `projectile-trails-quiet-empty-latch` fields (`_projectileTrailsQuietEmpty`,
  `_projectileTrailsQuietIndexVersion`, `_seamMarkersWereRelevant`) not on master; #122 sits
  in the row-23 sibling vein. Re-try after the sibling lands, else needs re-export.

# IMPORT ledger — 20260928 owner-side import (devin-w1-vm-prestep1, board §1C row 20)

Sim/preStep batch landed on master. Landed this pass:

| Folder | Commit | Check |
|---|---|---|
| `prestep-movables-trust` | `379b834ce` | focused 29/29 |
| `stamp-near-work-awake-cache` | `cde7e2c6b` | focused 96/96 |
| `stamp-near-work-budget-early-exit` | `0df8e3f87` | focused 93/93 |
| `lifetime-sweep-quiet-clocks-skip` (#143) | `657bb7a4a` | focused 7/7 |

Already on master before this pass (verified, no re-import): `combat-table-pose-incremental`
(`39d58e4f5`), `npc-field-role-cache` (`e59537847`), `npc-jobs-id-list-cache` (`f59b91b49`).

Skipped this pass:

- `npc-job-signatures-quiet-sleep-latch` — vfx.js hunks edit the `sector:enter`/`newGame`/`save:loaded`
  reset lines that depend on sibling latch packages not yet on master (statusAttached/tumbleBody/
  trailEmit/lootMagnet/wreckWisps resets); current lines also carry newer `_explosionRupture` /
  `_resetMonofilamentBlade` resets. Needs the sibling latches imported first (or a re-export).
- `lifetime-corpse-lane-compact` — master's `lifetimeSweep` corpse compact was restructured to
  `corpseIndices` + batch `_removeEntitiesAtIndices`; the patch's fail-open path revives the old
  per-corpse loop. Needs re-export against current master (adapted to the batch path).
- `registry-step-dispatch` — fails on 3/4 files vs current master (catchupPolicy head,
  authoritativeSystemManifest, sim-clock-catchup test).

`stamp-near-work-flag`, `-gate`, `-incremental`, `-prepared`, `-skip`, `-tap`, `-contract`, `-dense`
do not exist on `origin/vm-drop` or master — never shipped.

# IMPORT ledger — 20260928 owner-side import (devin-w1-vm-prestep2, board §1C row 21)

Sim/cache batch landed on master. Landed this pass:

| Folder | Commit | Check |
|---|---|---|
| `far-query-row-scan` (after-cell-key patch; master's `1bb1b818a` keys are numeric) | `b535d8a0b` | focused 18/18 |
| `emergent-hot-spatial` | `d22de0301` | focused 5/5 |
| `event-trace-thrust-sanitize` | `6f02ea568` | focused 6/6 (patch's root `artifacts/` payload excluded — identical copies live in the folder) |
| `gamepad-idle-clean-skip` | `e60ce713b` | focused 21/21 (patch file is one trailing line short of its last hunk header; applied `--recount`, result verified complete and syntax-clean) |

Already on master before this pass (verified, no re-import): `far-actor-cell-key`
(`1bb1b818a` — its residual `ensureFarActorTable` legacy string-key migration hunk + focused
test were **not** hand-merged), `alloc-journal-churn` (`650ce5a32`, src + test).

Skipped this pass:

- `prestep-movables-trust`, `lifetime-sweep-quiet-clocks-skip`, `npc-field-role-cache`,
  `npc-jobs-id-list-cache` — row-20 folders per the devin-w1-vm-prestep1 NOW.md claim; landed or
  verified on master there. Not re-imported here (non-overlap).
- Board-listed names that are not folders resolved to real packages: `emergent-hot-spatial-index`
  → `emergent-hot-spatial`, `event-trace-priority-cache` → `event-trace-thrust-sanitize`,
  `gamepad-idle-quiet-latch` → `gamepad-idle-clean-skip`, `far-actor-scan-columnar-cache` → the
  `far-actor-*` pair above. `lifetime-quiet-policy-clock-gate` → nearest lifetime package is
  `lifetime-corpse-lane-compact`, which needs a re-export (see row-20 ledger).
- `massline-settext-cache` — its only patch edits `src/ui/masslineHud.js`; `src/ui/**` is the
  ORRERY-claimed lane and out of scope for this import batch. Left for a UI-owning sitting.

# IMPORT_DIGEST report — 20260926c (post-#168; **#170 ship** retail-gltfloader-vendored-alias)

Master tip: **`97c88f92b`** (fetched; unchanged). No restack needed. No vm-drop package has been imported since dz.

## #170 pass — make the retail bundle load the loader #168 patched

- **How retail resolved GLTFLoader.** `npm run dist` → `scripts/build-bundle.mjs` (one esbuild call, no plugins,
  and no alias before #170) → electron-builder ships `build/web/**`. Bare specifiers resolved through npm
  `three@0.184.0`'s `exports` (`./addons/*` → `./examples/jsm/*`).

  Both GLTFLoader import sites are literal dynamic imports:
  - `renderPackageLoader.js:907` (render packages)
  - `assetLoader.js:816` (whole ships and parts)

  Retail therefore bundled the stock npm loader. The dev importmap loads `vendor/addons/`. **The #168 build's
  retail JS was byte-identical to master's.**
- **Version check.** On bare master, `vendor/addons/loaders/GLTFLoader.js`, its utils imports, the meshopt decoder
  and `three.core.js` are all **byte-identical** to npm r184. After #168, the loaders differ only by #168's hunks.
  There is no other behavioral difference.
- **SHIP #170.** `scripts/lib/retailBundleAliases.mjs` maps `three/addons/loaders/GLTFLoader.js` to the vendor copy,
  and `build-bundle.mjs` passes `alias: retailBundleAliases(ROOT)`. Everything else, `three` included, stays on npm,
  so there is still one THREE instance. A 4-test file:
  - pins the alias;
  - checks that the importmap agrees;
  - proves the retail resolution bundles the vendored loader with the #168 markers;
  - fails if vendor and npm three ever become different revisions.
- **Proof** (the real `build-bundle.mjs` esbuild call captured with a loader hook):
  - The retail `GLTFLoader-*` chunk now comes from `vendor/…/GLTFLoader.js` and contains `glbBodyRange` /
    `glbBodySliceRange`.
  - The other 1 258 modules have identical output bytes.
  - Size: JS **+1 286 B**, gzip −63 B, 166 → 165 files.
  - Identity through the retail chunks themselves (loader + meshopt + production embedded-KTX2 plugin, before
    vs after bundle): **259/259 render packages + 936/936 other GLBs identical**, and the body is never
    materialized. The same holds on the #167 stack. The mutation check gives DIFF.
  - Suite (#168's 96 files + packaging/loader/render-package set): **717/754 vs master 709/746, identical
    failure set** (36 + 1 pre-existing).
- **Import order:** after #168. With #167: #166 → #167 → #168 → `glb-body-in-place/patches-after-167` → #170.
  #169 is independent. `git apply --cached` is clean on #168, the 26c stack, 26d, `vm-work/stack-20260924u` and
  bare master.

### Owner decisions surfaced this pass

- **The retail build is broken on master (pre-existing, independent of #170).** `build-bundle.mjs` aborts in the
  render-package projection: 54 of 259 packages have `runtime` tables that no longer match
  `renderPackageRuntimeTable`. The cause is material roles (hull → signal) since `a1cc1c66d` "Tell lamps and bare
  metal apart…". So `npm run dist`, `check:bundle` and `check:m6:packaging` cannot finish today. Refreshing the
  tables changes shipped material roles, which is a picture call. List:
  `retail-gltfloader-vendored-alias/artifacts/logs/master-runtime-table-drift.json`.
- **Dev-only vendor patches besides GLTFLoader.** The two `vendor/three.module.js` `SpaceFace:` fixes (empty shadow
  sampler depth texture, and destroyed-program readiness) still do not reach retail. The vendored KTX2Loader CSP
  patch is already covered in retail by `configureCspSafeKtx2Loader`. The vendored postprocessing addons are older
  upstream copies, used only by the asteroid interior preview. Aliasing `three` itself is a larger, separate call;
  the same alias map would carry it.

### Scratch

- #168 + #170: `vm-work/hillclimb-20260926e` @ `2121e9a48`
- #167 + #168 + after-167 + #170: `vm-work/hillclimb-20260926f` @ `3ce58c5a6`
- Both are in `/workspace/spaceface-scratch/master-20260924u`. They are local only and were not pushed; the patch
  is in the package.

## Previous digest header (20260926b)

# IMPORT_DIGEST report — 20260926b (post-#167; **#168 ship** glb-body-in-place + **#169 ship** shader-readiness-no-isprogram)

Master tip: **`97c88f92b`** (fetched; unchanged). No restack needed. No vm-drop package has been imported since dz.

## #168/#169 pass — admission / hitch pole 1 (opening + streaming)

This pass took the two poles the last digest had filed as owner/vendor side. It fixed both with in-repo patches
that keep the picture identical. Import order: **#166 → #167 → #168 → `glb-body-in-place/patches-after-167` →
#169**. Every order and subset was checked with `git apply --cached`, including on top of
`vm-work/stack-20260924u`.

- **SHIP #168 `glb-body-in-place`.** The vendored GLTFLoader no longer copies the GLB BIN chunk out of the fetched
  buffer inside the synchronous `parse()` (`GLTFBinaryExtension` `data.slice`). The body is a range on the
  caller's GLB:
  - meshopt sources are viewed in place;
  - plain bufferViews (KTX2/PNG images, uncompressed accessors) are sliced straight off it. Those copies are kept,
    because they are cached, Blob-ed or transferred, and a view would pin the GLB;
  - `body` is materialized lazily only if something else asks for it.

  Results:
  - **Identity:** everything handed downstream is identical across all **259** render packages and the 936 other
    tracked GLBs (KTX2 buffers, PNG Blobs, bufferViews, attributes/indices, nodes). The body is never
    materialized. Mutation checks fail as they should.
  - **Sync parse block, 10 largest packages:** 112 → 15 ms, **−97.6 ms**, **7.32× median / 6.71× floor**
    (7.59× / 7.16× on #167). Whole parse 1.43×.
  - **Kestrel package:** −19.4 ms on its frame (15×).
  - **All 259 packages:** −166 ms.
  - **Live from-launch:** `GLTFBinaryExtension` lane 147.2 / 43.9 / 46.6 → 0.6 / 8.5 / 1.4 ms; bursts up to
    20.2 ms removed.

  The "~147 ms loadBufferView" was the KTX2 image-view slices; #167 already removes that copy. #168 adds a small
  after-167 patch so #167's direct slice also reads the range.
  **Owner decision:** the retail bundle resolves `three/addons` from node_modules, so it only gets this cut if the
  bundle aliases the vendor loader.

- **SHIP #169 `shader-readiness-no-isprogram`.** The bloom readiness waits (`drain` and `checkProgramsReady`) no
  longer make the 1-per-2-s `gl.isProgram()` handle recheck. Each recheck waited for the whole GPU link queue, and
  in flight the drawables it guarded were already hidden. Dead handles are now read non-blocking from
  `isReady() === null` (WebGL answers null for a handle the context does not own), alongside the context-loss
  generation and destroy().

  Results (12 master vs 6 patched from-launch runs):
  - in-flight isProgram **0.42–4.9 s per 30 s → 0 in every run**;
  - in-flight GL wait median **~4.2 s → ~0.18 s**;
  - largest in-flight block median **~1.9 s → ~76 ms** (7/12 master runs had a 1.7–3.8 s freeze);
  - blocks >50 ms: 11 → 1;
  - launch-to-flight and pre-flight GL wait at parity.

  **Owner decision:** this reverses an owner-tuned safety recheck. A silently forgotten handle is now bounded by
  the existing 20 s deadline instead of ~1–2 s. It has never been observed, and the pinned test was replaced.

- **Cost map of the "~5.1 s bloom readiness / shadow-sweep links"** (pre-flight, 6 bare runs):
  - driver / GPU-process link waits (`getProgramParameter` at first-use touch draws + isProgram): **1.0–10.6 s**;
  - native submits: 20–35 ms;
  - three's JS program build: 36–78 ms;
  - SpaceFace readiness JS: **1–8 ms**.

  CPU-side JS is under 0.1 s. Poll cadence, key dedupe (three already dedupes by cacheKey) and LINK_STATUS
  avoidance all have negligible ceilings. Before flight, removing the recheck only moves the wait into first-use
  (`ab169x-nocheck`), which is soft-GPU link time. The opening shadow-sweep / `rehearseScenePass` measured
  0.003–0.12 s this pass, so it is not a pole now.

- **Focused suite (96 files: the #167 list plus every GLTFLoader, bloom and readiness test):**

  | Build | pass / total |
  |---|---|
  | #168 | 688/725 |
  | #169 | 686/723 |
  | bare master | 684/721 |

  The **failure set is identical** (36 fail + 1 cancelled, the same pre-existing set as #166/#167).

### Holds / misses this pass

- **#169 pending-age gate (recheck only after 8 s pending): MISS.** Soft-GPU link queues keep programs pending
  more than 8 s, so single isProgram blocks stayed at 3.4 s. Superseded by the null-detection variant.
- **Pre-flight shader admission on soft-GPU: no VM cut.** It is driver link time, and it moves rather than shrinks.
  Real-hardware numbers need the owner iGPU.
- **Keeping bufferView copies as views: HOLD by design.** Geometry arrays would pin the entire GLB, KTX2 bytes
  included, for the life of the geometry. That is a memory regression.

### Largest remaining costs → next poles (ranked)

1. three render CPU (`drawPreparedFrame` ~55 ms/s + `updateMatrixWorld` ~10.6 ms/s). **Owner side** (batching).
2. Opening first-use link waits at the touch draws (soft-GPU driver time, 1–10 s pre-flight). **Owner/GPU:** fewer
   program keys, or real-HW parallel compile.
   - One observed residual: a first-use COMPLETION_STATUS read inside an in-flight opening touch draw can block
     (~0.8 s once in 6 runs). This is the owner's touch design.
3. Per-image KTX2 slice (the one copy #167 leaves, because KTX2Loader transfers it). Removing it needs a
   transcoder-worker protocol change (hand the whole body once). **Vendor/owner.**
4. sg02 carry decision (~1.35–1.45×). **Owner.**
5. Gamepad poll gating / tether preview. Held.

VM-side opening/streaming CPU work is now **largely exhausted**. What remains is driver link time or owner design.

### Scratch

- #168: `vm-work/hillclimb-20260926b` @ `03c406090`
- #167 + #168 + after-167: `vm-work/hillclimb-20260926c` @ `619537c2e`
- #169: `vm-work/hillclimb-20260926d` @ `ef721f941`

All in `/workspace/spaceface-scratch/master-20260924u`. Untouched master: `/workspace/spaceface-scratch/bare-20260926`.

## Previous digest header (20260926a)

# IMPORT_DIGEST report — 20260926a (post-#165; **#166 ship** render-package-digest-zero-copy + **#167 ship** embedded-ktx2-single-copy)

Master tip: **`97c88f92b`** (fetched; unchanged since digest 20260924ea). No restack needed, and no vm-drop package has been imported since dz.

## #166 pass — summary (NEW)

A new pole: main-thread copies of streamed GLBs. In a bare-master 45 s profile
(10–30 s flight window) every streamed render package was copied **three times**
on the main thread:

| Copy | Where | Cost |
|---|---|---|
| Digest-worker copy | `renderPackageDigest.js` `view.slice()` | 204 ms / 60 bursts in the heavy-streaming run |
| Vendor GLB body copy | `GLTFLoader.js:1885`, `GLTFBinaryExtension` | ~214 ms |
| Embedded-KTX2 second copy | `embeddedKtx2Textures.js:103` | ~200 ms / 52 bursts |

`loadBufferView` adds another ~147 ms of vendor copies. No earlier vm-drop
package touches renderPackageDigest, renderPackageLoader or embeddedKtx2.

- **SHIP #166 `render-package-digest-zero-copy`.** The fetched buffer is
  transferred to the digest worker, which transfers it back with the hex. No
  copy on either thread.
  - Live 45 s interleaved A/B (3+3 runs): main-thread digest lane
    **11.7 / 17.7 / 10.7 → 1.1 / 0.8 / 0.8 ms**. Median ~14.6×, floor ≥9.7×.
    The 2–9 ms per-package bursts are gone.
  - Isolated lane: ~6× at 1 MB, ~26× at 4 MB, ~39× at 8 MB, ~57× at 16 MB.
  - Fallbacks: a lost worker triggers a re-fetch; an error reply is hashed on
    the calling thread.
- **SHIP #167 `embedded-ktx2-single-copy`.** A plain KTX2 bufferView is sliced
  once, straight off the GLB body, instead of bufferView slice + `slice(0)`.
  - Bytes are identical across all 259 render packages.
  - Lane 1.9–2.1× at 1–8 MB, floor 1.39× at 16 MB.
  - Real-GLB parse of the 10 most KTX-heavy packages: **55.6 ms median
    removed** (52–75 ms; ≈0.29 ms/MB of KTX2; ≈5.6 ms per heavy package;
    whole parse 1.12–1.17×).
  - Embedded KTX2 is 502.6 of 695.5 MB of all render packages.
  - Not separable in the quiet 45 s live windows, which streamed only small
    packages. This is a heavy-admission hitch cut.
- **Focused suite (67 files):** patched 395/424, bare master 389/418. The
  **identical pre-existing failure set** (28 fail + 1 cancelled) appears on
  bare master, e.g.:
  - packaged-Electron closure
  - Kestrel V6
  - opening remaster identity
  - faction kits
  - refinery promotion
  - render-package pool admission (323–343)
  - "all 74 release bodies"
  - PQ-131.06 conduit

  Earlier-noted bare failures still stand: loop-orchestration-perf 2,
  m1-player-tell-hud 1, performance-lifecycle-manifests 1,
  civilian-freighter-recovery 8, pq-141-03-ambush-flee-spill 1.

### Holds this pass

- **sg02 Rapier call diet** (priority 1): retained RawVector setters plus a
  skip of wakeUp/isSleeping on never-sleep bodies. Poses are bit-identical
  over 2400 mixed ticks, but it is **below bar**:

  | Measurement | Result |
  |---|---|
  | Node owner bench | 1.19× |
  | In-page | 1.09–1.13× |
  | Live | ~0–8 µs/tick (noise) |

  Getters (~260 ns each, allocating) can only be removed by the excluded
  prestep carry. **HOLD:** `sg02-rapier-call-diet-hold/`.
- **Early-flight tacticalAI** (priority 2): the #164 0–10 s spike (~0.95
  ms/tick) was a one-off combat/capital-boss scenario. Fresh reruns give
  ~3–10 ms/s on both stack and bare, and `_contactBaseFor` is already cached
  per tick. **Not a pole.**
- **radar.draw residual** (priority 3): bare ~97 ms/30 s at 10 Hz. The
  remaining retain angles need the unimported #156/#158 still-layers, and the
  animated glyphs carry picture risk. **SKIP.**
- Thin: `assetResidentBytes` (~13 ms/30 s), `canonicalizeSurfaceProgramFamilyKey`
  (~15 ms/30 s), `prefersReducedMotion`/`updateObjectiveKey` (a few µs).

### Largest remaining costs → next poles (ranked)

1. three render CPU (`drawPreparedFrame` ~55 ms/s + `updateMatrixWorld` ~10.6 ms/s). **Owner side** (batching).
2. Bloom `checkProgramsReady` → `isProgram` / shadow-sweep program links, ~5.1 s of main thread in the first 15 s. Admission pole, **owner/GPU side**.
3. Vendor GLTFLoader copies: GLB body `data.slice` (~214 ms) + `loadBufferView` (~147 ms) per heavy streaming window. **Owner/vendor side.** A local plugin could hand geometry views as subarrays, but that changes the vendor cache semantics.
4. sg02: getters need the carry decision; diet + carry is estimated at ~1.35–1.45×. **Owner decision.**
5. Gamepad poll gating and tether acquisition preview. Held (input/gameplay risk).

VM-side portable sim work is **nearly exhausted**. The registry latch vein is
done, sg02 glue sits below bar without the carry, and the tacticalAI spike does
not reproduce. What remains big is owner-side: render CPU batching, program-link
admission, vendor loader copies, and the sg02 carry decision.

## Previous digest header (20260924ea)

IMPORT_DIGEST report — 20260924ea (post-#163; **#164 ship** hull-integrity-quiet-latch + **#165 ship** perf-heap-sample-gate)

Master tip: **`97c88f92b`** (fetched; unchanged since #161 / digests 20260924dx / dy / dz). No restack; no vm-drop package imported since dz.

## #164 pass — summary (NEW)

- **Registry latch vein exhausted.** survivorPod has 0 promoted pods in the
  live game (helios_prime, 4 payloads). survivorPod, scanner, bulletTime,
  fieldDepletion and masslineThreats are all ≤~0.44 µs/tick warmed. None is
  packaged. **Do not keep mining per-system registry.step latches.**
- I re-profiled the whole quiet frame and the admission poles on bare master
  and on the full digest stack (local `vm-work/stack-20260924u`, #31–#163 on
  `97c88f92b`). Fresh cost map:
  `hull-integrity-quiet-latch/artifacts/cost-map-164.md`.
  - Stack settled sim: ~0.86 ms/tick (bare master ~1.23).
  - Idle: 70.1% (bare 54.8%).
  - Long tasks: 4 (bare 12).
- **SHIP #164 `hull-integrity-quiet-latch`:** skips the settled HUD
  `updateShipCondition` DOM compare pass.
  - In-page median **21.2×** tight / **10.1×** per-frame, floor **≥8.6×**
    (5 isolated Electron runs, JIT-warmed).
  - ~55 µs/frame removed. Live profile 0.83 → ~0.1 ms/s.
  - Live-change path at parity.
- **SHIP #165 `perf-heap-sample-gate`:** `performance.memory` is read only
  while Tier-1 counters are live. **~52 µs/frame** removed (50–61 across
  5 runs). Live profile `get memory` 0.68 → 0.00 ms/s.
- Focused am-verify: **455/459**. The same 4 failures occur on untouched
  master:
  - `loop-orchestration-perf` 2
  - `m1-player-tell-hud` 1
  - `performance-lifecycle-manifests` 1

  Core suites (hull-integrity, perf-counters, hud-flight-attention,
  presentation-runner) are **121/121**. Previously noted bare-master failures
  are unchanged: `civilian-freighter-recovery` 8 and
  `pq-141-03-ambush-flee-spill` 1.

### Largest remaining measured costs (full stack, settled, soft-GPU)

| # | owner | cost | kind |
|---:|---|---:|---|
| 1 | three render CPU (`drawPreparedFrame`) | ~55 ms/s (+ scene `updateMatrixWorld` ~10.6 ms/s) | presentation (pole 3 batching) |
| 2 | physics sg02 | ~0.21 ms/tick; JS glue in `_stepFixed` ~0.08 ms/tick (≈9 RawVector-allocating Rapier getter/setter calls per body per tick) | portable sim |
| 3 | early-flight tacticalAI (0–10 s) | ~0.95 ms/tick (`liveFramesFor` → `entityContacts` / `_contactBaseFor` + classify) | portable sim spike |
| 4 | opening shadow-sweep program links (`rehearseScenePass`) | ~1.0 s once at ~10–15 s | admission pole 2 (fewer keys; soft-GPU) |
| 5 | flightV3 / tacticalAI settled / fields | ~80 / ~76 / ~48 µs/tick | portable sim |
| 6 | gamepad `getGamepads` every tick | ~13 µs/call | input |
| 7 | radar.draw residual / tether acquisition preview | 2.8 ms/s / ~72 µs per 12.5 Hz refresh | HUD |

## Stack refresh

Portable scour branch `vm-work/hillclimb-20260924t` @ bare `origin/master`
`97c88f92b` + #160 + #161 + #162 + #163 (`/workspace/spaceface-scratch/hillclimb-20260924p` tip
`f3008ec52`). Prior #162 scratch tip `4d137d720` remains on the same branch
lineage. Stacked WIP remains on `vm-work/hillclimb-20260924o` @
`2911f4458` (trust-sleep — not packaged) `/workspace/spaceface-scratch/hillclimb-20260924h`.
No restack needed (master tip unchanged). Profile cite remains
`settled-45s-stacked-20260924ac` (+ `settled-20s-stacked-20260924ad`
cross-check; Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–162 | (unchanged — see digest 20260924dy / dx / dw / …) |
| 163 | `combat-outcome-quiet-latch` (~2.05× @30k / ~2.38× @100k median; ≥1.80× floor quiet flee-scan) |
| **164** | **`hull-integrity-quiet-latch`** (21.2× tight / 10.1× per-frame median; ≥8.6× floor; ~55 µs/frame) |
| **165** | **`perf-heap-sample-gate`** (~52 µs/frame `performance.memory` read removed while Tier-1 off) |
| **166** | **`render-package-digest-zero-copy`** (live digest lane ~14.6× median, ≥9.7× floor; 2–9 ms per-package bursts removed) |
| **167** | **`embedded-ktx2-single-copy`** (lane 1.9–2.1×, floor 1.39×; −55.6 ms per 10 heaviest packages; bytes identical) |

Including already-packaged but **not yet on master** (do not re-ship).
**20260928 update:** `combat-table-pose-incremental` (~4.78×), `stamp-near-work-awake-cache`,
`stamp-near-work-budget-early-exit`, `prestep-movables-trust`,
`lifetime-sweep-quiet-clocks-skip` (#143), `npc-field-role-cache` and
`npc-jobs-id-list-cache` are **now on master** (see the import ledger above). Remaining:
customs cones / sanctuary /
combat pre+postPhysics (#145–#155), classify flying-rock / frame / early
parked latches, `sync-entity-views-closure-gate`, `micromotion-settled-skip`,
`hull-scorch-quiet-live-skip`, `countermeasures-quiet-empty-latch`,
`overlay-quartet-quiet-empty-latch`, weapon-light / rcs-impulse / ribbon /
arcade-structural / distortion / quarks / discharge / presenter-composite,
`radar-asteroid-still-layer` (#156), `sync-entity-lod-retain` (#157),
`radar-contacts-still-layer` (#158), `shield-bubble-quiet-latch` (#159),
`faction-presence-quiet-latch` (#160), `ai-encounter-quiet-latch` (#161),
`difficulty-director-quiet-latch` (#162), `combat-outcome-quiet-latch` (#163), **`hull-integrity-quiet-latch` (#164)**, **`perf-heap-sample-gate` (#165)**, etc.

### SKIP / hold (unchanged + this pass)

Carry forward all holds from digest 20260924dz / dy / dx / dw / dv / du / dt / ds / dr / dq / dp / do / … / da / cz.

**#164 pass — NEW:**
- **SHIP #164** hull-integrity quiet latch and **SHIP #165** heap-sample gate
  (presentation-thread HUD / perf residuals, not soft-GPU fps).
- **scene-matrix-retain** (dirty-compare replacement for
  `scene.updateMatrixWorld`) — **HOLD.**
  - Node microbench: 1.17–1.33× (floor ~1.0–1.23×).
  - In-page: 1.59× only *without* external-world-write validation. With the
    16-element validation that correctness requires (detach, standalone world
    update, re-add), it is **0.66×** (slower than stock).
  - Note: the Scene has `matrixWorldAutoUpdate=false`.
- **sg02 prestep kinematic carry** (reuse post-step linvel/angvel/yaw in
  `_captureExpectedKinematics`): ceiling hack only ~1.2–1.3× on the owner
  step (~60 µs/tick for 11 craft). **HOLD.** The real lever is a Rapier
  getter/setter diet (see next poles).
- survivorPod (0 live promoted pods) / scanner / bulletTime / fieldDepletion /
  masslineThreats: ≤~0.44 µs. **Thin; latch vein exhausted.**
- Gamepad `getGamepads` every tick (~13 µs/call): event-gated polling risks
  input behavior. **HOLD / next pole.**
- Tether `_refreshAcquisitionPreview` (~72 µs per refresh at 12.5 Hz) +
  masslineHud preview DOM: gameplay-rich receipt logic. **HOLD.**
- Opening shadow-sweep link burst (~1 s): pole 2 program-key reduction, not a
  VM latch. **HOLD (owner-GPU).**

**#163 pass:**
- **registry.step NEW shipped:** combatOutcome quiet-latch (#163) — 4-tick shipLike flee-scan.
- Fresh ungated scour (probe-162c ranks after combatOutcome): masslineThreats ~0.60 µs cold → ~0.16 µs warmed (no-tether inactive early-out already; thin — not packaged), survivorPod ~0.44 µs (promotedByPoint walk + causal tick; next candidate), scanner ~0.44 µs, bulletTime ~0.42 µs (flag path; thin), fieldDepletion ~0.39 µs — **all below ~0.5 µs abs; not packaged this pass**.
- Pre-existing bare-master failures noted (not caused by #163): `civilian-freighter-recovery` 8 fail, `pq-141-03-ambush-flee-spill` 1 fail.
- mining / sectorSim / encounterDirector / economy / fair-aiPorts / packCombat / stampNear / lifetime / classify / trust-sleep / law / traffic / bandRadio / quiet-VFX / pickup magnet-skip / objective idle — **not retried** (held).

**#162 pass — NEW:**
- **registry.step NEW shipped:** difficultyDirector quiet-latch (#162).
- mining settled abs ~0.26 µs (after heat/noise cold) — **thin; not packaged**.
- sectorSim quiet-skip vs ensureState ~1.09× — **below bar; not packaged**.
- encounterDirector early ~0.4 µs thin (1 Hz) — **held** (unchanged).
- fair-aiPorts / packCombat pose-incremental / stampNear / lifetime — **not
  rediscovered**.
- classify / trust-sleep / law / traffic / bandRadio / flying residual /
  quiet-VFX / pickup far-idle magnet-skip / objective idle deepen —
  **not casually retried** (held).
- syncEntityViews updater residuals / closure-gate / micromotion / LOD /
  shield-bubble / factionPresence / aiEncounter — **not rediscovered**.
- economy 5 s cadence quiet residual ~0.1 µs — **thin**.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.
Cross-check `settled-20s-stacked-20260924ad`.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after …+#162; fair-aiPorts held; packCombat only if not pose-incremental / single-dirty; **imported packCombat/stampNear/lifetime not yet on master** |
| 269 | `classifyWorld` | residual after …+#141; **flying residual over parked ~1.3×**; flying-early-latch held; NPC/disc-admission still thin |
| 202 | `syncEntityViews` | residual after …+#157+#159; closures / microMotion already packaged — hunt fresh pickup/ordnance/infra **updater** residuals only if abs clears thin band; asteroid settled + render-entity-frame retain held |
| 186 | `prepareFrame` | residual after …+#126 (quiet-VFX floors still held; many quiet-live pools packaged, not on master) |
| 132 | `hud.frame` | residual after #156+#158; objective idle deepen thin; further HUD NEW only if ≥1.5× |
| 111 | `preStep` | **trust-sleep held (bare-master ~1.24×)**; remasure after packCombat+stampNear imports |

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| **164** | **`hull-integrity-quiet-latch`** | Settled HUD DOM compare pass skipped; in-page 5 isolated Electron runs: tight **21.2×** median (floor 11.4×), per-frame **10.1×** (floor 8.6×), live-change parity; 6000-frame picture-identity test; focused **455/459** (4 pre-existing bare-master); am-verify `ae3f81c0f` |
| **165** | **`perf-heap-sample-gate`** | `performance.memory` read gated on Tier-1: **~52 µs/frame** removed (50–61); live profile `get memory` 0.68 → 0.00 ms/s; am-verify `330d70d7a` |
| **166** | **`render-package-digest-zero-copy`** | zero-copy worker digest lane: live main-thread digest 11.7/17.7/10.7 → 1.1/0.8/0.8 ms per 45 s (~14.6× median, ≥9.7× floor); isolated 6–57× @1–16 MB; am-verify `27e34501e` |
| **167** | **`embedded-ktx2-single-copy`** | one slice off the GLB body per embedded KTX2: bytes identical ×259 packages; lane 1.9–2.1× (floor 1.39× @16 MB); −55.6 ms per 10 heaviest packages; am-verify `1203c460c` (both `24a2d1557`) |
| 163 | `combat-outcome-quiet-latch` | Quiet flee-scan latch median **~2.05×** (30k) / **~2.38×** (100k warmed), floor **≥1.80×** (5×11 isolated @ N=40); dirty-wake ok (11 wake events + membership + 0.5 s rescan); focused **70/70**; am-verify `8a6d29ada` |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| hull-integrity `updateShipCondition` settled DOM pass | **SHIP #164**: 21.2× / 10.1× per-frame, floor ≥8.6× |
| presentationRunner per-frame `performance.memory` read | **SHIP #165**: ~52 µs/frame removed |
| scene-matrix-retain (`updateMatrixWorld` dirty compare) | **HOLD**: 0.66× with required validation (1.59× unsafe) |
| sg02 prestep kinematic carry | **HOLD**: ~1.2–1.3× ceiling |
| survivorPod / scanner / bulletTime / fieldDepletion | **thin** ≤0.44 µs (latch vein exhausted) |
| gamepad poll gating / tether acquisition preview | **HOLD** (input / receipt behavior risk) |
| combatOutcome 4-tick shipLike flee-scan quiet-latch | **SHIP #163** — ~2.05–2.38× / ≥1.80× floor |
| fresh ungated scour after combatOutcome (masslineThreats / survivorPod / scanner / bulletTime / fieldDepletion) | ≤~0.6 µs abs, mostly already early-out in production — **not packaged** |
| difficultyDirector settled quiet-latch (prior pass) | SHIP #162 — ~2.98× / ≥2.43× floor |
| mining quiet early-out | settled abs ~0.26 µs thin — **not packaged** |
| sectorSim skip _ensureState between model steps | ~1.09× — **below bar** |
| encounterDirector early/1 Hz path | early ~0.4 µs thin — **held** |
| economy quiet residual (5 s cadence) | ~0.1 µs thin — **not packaged** |
| fair-aiPorts / packCombat / stampNear / lifetime / classify / trust-sleep / law / traffic / bandRadio | **not casually retried** (held) |
| syncEntityViews updater / closure-gate / micromotion / LOD / shield-bubble / factionPresence / aiEncounter rediscovery | **not rediscovered** |
| pickup far-idle magnet-skip / objective idle deepen | **held** (below bar / thin abs) |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

The per-system registry.step latch vein is **exhausted**. Prefer thick poles:

1. **sg02 physics JS glue / Rapier getter diet** (~0.08 ms/tick of ~0.21):
   batch `translation()` / `rotation()` / `linvel()` / `angvel()` reads per
   body via one raw-set pass or cached scratch vectors, and skip redundant
   setter round-trips in `_stepFixed` and `_captureExpectedKinematics`.
2. **Three render CPU / batching (pole 3)** ~55 ms/s plus scene
   `updateMatrixWorld` ~10.6 ms/s. scene-matrix-retain held at 0.66× once
   made safe. A real win needs owner-side static-subtree
   `matrixAutoUpdate=false` authoring, not a VM traversal replacement.
3. **Early-flight tacticalAI spike** (0–10 s, ~0.95 ms/tick): ai.stack
   `liveFramesFor` → `entityContacts` / `_contactBaseFor`. Look at contact
   base reuse across stack frames within a tick.
4. **Opening shadow-sweep program links** (~1 s once; pole 2 fewer program keys; owner-GPU).
5. Gamepad `getGamepads` poll gating (~13 µs/tick): only with
   `gamepadconnected`-driven arming, which carries input-behavior risk.
6. radar.draw residual (2.8 ms/s) / tether acquisition preview (~72 µs @12.5 Hz).
7. Carry-forward holds from dz: classify flying residual ~1.3×;
   syncEntityViews updater residuals; prepareFrame quiet-VFX floors;
   trust-sleep ~1.24× (remeasure after imports); and the rest of the list
   below.

### Carry-forward (dz next-poles list, unchanged)

1. registry.step after …+#163 — combatOutcome shipped; next ungated abs: survivorPod promotedByPoint/causal tick (~0.44 µs), scanner (~0.44 µs) — only if ≥1.5× with solid floor. fair-aiPorts held; packCombat only if not
   pose-incremental or single-dirty / further HUD NEW only if ≥1.5×. After owner
   imports pose-incremental + stampNear + lifetime, remeasure bare-master
   preStep before retrying trust-sleep. Hunt other ungated systems with abs
   clearing thin band (combatOutcome **shipped #163**; mining left thin;
   sectorSim held ~1.09×; encounterDirector early thin).
2. syncEntityViews residual after #157+#159 — fresh pickup/ordnance/infra
   **updater** residuals only if abs clears thin band (not closure-gate
   rediscovery); applySnapshotPose hold ~0.85×; asteroid settled ~1.14× +
   render-entity-frame retain ~1.21× held; pickup far-idle magnet-skip ~1.35× held.
3. classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127+#128+#138+#141
   — flying vs parked residual ~1.3×; NPC/ship visit deepen still thin ~1.08×;
   disc-admission visit-retain thin ~1.12×; **flying-early-latch held ~1.3×**.
4. prepareFrame residual after #13+#44+#46+#47+#51–#126 (quiet-VFX floors
   held; many quiet-live pools packaged awaiting import — do not rediscover).
5. Soft-GPU fps is not a KPI.
6. environmentalMachinery far (held ~0.87×).
7. Deferred/held: hazards far; asteroid-field **empty** ~1.22×; zoneAt;
   lifetimeSweep no-movable / compact-skip / pose-rematch / sleeping-clocks /
   **quiet-compact-skip floorMin 1.30×**;
   **flying-early-latch ~1.3×**; asteroid-motion settled; render-entity-frame
   unchanged retain; projectile-evidence surface-cadence deepen ~1.0×;
   weapons quiet residual deepen ~1.3×; spatial all-sleeping sync (needs awake-set);
   impulseCharges empty; updateDockRange far; tether-web empty VFX;
   lawSecurity quiet residual after cones+sanctuary ~0.5–1.0 µs thin;
   ai/aiPorts isolation-only sketches (classify-inflated);
   **preStep trust-physicsSleeping bare-master ~1.24×**;
   **bandRadio ~2.2 µs thin**; traffic classify-inflated;
   **classify flying residual over parked ~1.3×**;
   **objective idle deepen ~0.37 µs thin**;
   **pickup far-idle magnet-skip ~1.35×**;
   **encounterDirector early ~0.4 µs thin** (1 Hz already);
   **mining settled ~0.26 µs thin**;
   **sectorSim ensureState-skip ~1.09×**.

## Scratch

- #164/#165 scratch branch: `vm-work/hillclimb-20260924u` @ `c87319ee5` (pushed) / `/workspace/spaceface-scratch/master-20260924u`
- Full-stack profiling worktree (local only, not pushed): `vm-work/stack-20260924u` / `/workspace/spaceface-scratch/stack-20260924u`

- Portable scour branch: `vm-work/hillclimb-20260924t`
- Prior portable worktree: `/workspace/spaceface-scratch/hillclimb-20260924p` @ `f3008ec52` (#163; unchanged)
- Prior #162 scratch tip: `4d137d720`; #161: `cc826f487`
- Stacked WIP (trust-sleep only; not packaged): `vm-work/hillclimb-20260924o`
  @ `2911f4458` / `/workspace/spaceface-scratch/hillclimb-20260924h`
- Master tip: `97c88f92b`
