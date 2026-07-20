# Graphics Overhaul Integration Checkpoint

**Checkpoint date:** 2026-07-19

**Status:** GRAPHICS CLOSEOUT PROMOTED TO `master`; FOCUSED-GREEN CHECKPOINT, FINAL ACCEPTANCE PENDING

**Current combined master revision:** `b235f062`

**Earlier unified promotion:** `ee9e0ab3`, hardened through `f0b3b154`

**Unified integration revision:** `a752702b` on `codex/unified-integration-20260719`

**Graphics donor revision:** `e3ad1caf` on `codex/graphics-integration-20260718`

**Graphics closeout commits:** `bd79f2ba`, `5219491d`, `98e1e429`, `1de8a861`, `5863331c`

**Performance synthesis donor:** `99cad5b5`, integrated by `b235f062`

This is the durable resumption and promotion record for the multi-day graphics overhaul. It records
what the current integration tree actually presents, what has only structural evidence, what has
been visually rejected, and how to promote the final tree without importing oversized historical
asset intermediates. It does not promote any `M0-M6` or roadmap row by itself.

## 1. Integration safety and current topology

The graphics closeout is promoted; final cross-lane acceptance is not. Claude's paused
Atlas/map/travel work through `1905cac8`, performance checkpoint `1bdde6c8`, and graphics checkpoint
`e3ad1caf` were first reconciled in the clean unified worktree and promoted as `ee9e0ab3`. The later
closeout added exact golden receipts and rock maps (`bd79f2ba`), truthful authored runtime coverage
(`5219491d`), the durable long-term architecture and Helios donor ruling (`98e1e429`, `1de8a861`),
and gate wiring (`5863331c`). Merge `cbdf1589` places that coherent graphics slice on `master`.

The reviewed performance closure is now synthesized without overwriting graphics semantics in
`partsLibrary.js`, `renderer.js`, or `spaceBackground.js`. CPU integration proof is green; the
browser/Electron/GPU performance matrix must still be rerun on this final combined tree.

The final integration tree has no file over 100 MiB. Its largest tracked asset is the sanitized
Helios source GLB at about 79.7 MB. The runtime release GLB is about 79.1 MB. Re-check these facts in
the promotion worktree rather than assuming this snapshot remains current.

OpenCode's `SpaceFace-oc-helios-golden` full replacement is rejected as a merge source. The audit found
zero of its 30 texture hashes identical to the current accepted payload; it is an older/heavier map
set, not a drop-in copy. Its release shortcut deletes `LOD1`, `LOD2`, and
`SOCKET_Structure_Core`, leaving roughly 1.02 million triangles active at every distance. Do not
cherry-pick its loader, manifest, or asset replacement.

One scratch technique is retained, not accepted: a Blender batching experiment reduces 777 glTF
primitives to 45 while preserving three LODs, twelve semantic roles, and the core socket. It remains
about 228 MB / 1.64 million triangles, lacks normal-route captures and measured runtime benefit, and
loses authored anisotropy in glTF export. Rebuild the batching idea against the accepted station,
author genuinely reduced LOD geometry, and require matched approach/undock plus draw-call,
residency, and frame-time evidence before promotion.

## 2. Player-visible outcomes in the integration tree

| Vertical | Current truth | Acceptance boundary |
|---|---|---|
| Starter ship | Borrowed Time / Kestrel V5 is the live New Game and Continue ship. The authored root mounts without a retained fallback, visible box, or proxy swap. Its five consolidated live surfaces retain 17 semantic material identities and 33 textures. | Browser and hardware Electron route evidence exists. The normal gameplay frame, not the Blender source, is decisive. |
| Thrusters and RCS | Hitch/Kestrel uses a throttle-responsive white-hot core, directional inner plume, turbulent sheath, vapor layer, and directional RCS. The implementation is pooled and reports zero per-frame plume/RCS allocations. Reduced-motion still communicates thrust. | Browser motion and fixed scenarios plus hardware Electron cruise/RCS captures passed. Spector state capture and durable asset classification remain open. |
| Presentation stability | Authored ships/stations no longer present blue-clay boxes before replacement. `5219491d` extends the fail-closed admission contract and authored bounds behavior beyond the starter; hidden off-camera assets may stream after flight handoff, but they publish no unrelated primitive identity. | Focused admission tests pass. Natural stations, rocks, wrecks, NPCs, instances, LOD/HLOD, save/Continue, and context recovery still need one motion-based stability packet. |
| Background | The accepted substrate restores black negative space and deterministic stars. Full-screen blue haze and rejected ribbon/card-like deep-field overlays are absent. Celestial layers remain behind gameplay. | This is a de-hazed foundation, not final authored deep space. Localized nebular/debris/tidal structure still needs an authored pass and matched browser/Electron review. |
| PBR substrate | Semantic authored roles are bound during asset load. Incomplete assets receive bounded role-specific base-color, normal/bump, roughness, metallic, and AO fallback maps rather than a single shiny-plastic response. Kestrel, Helios, and the representative geology role have dedicated profiles. | A procedural fallback is compatibility coverage, not a substitute for asset-specific UVs, authored maps, bevels, material slots, and normal-route visual approval. |
| Semantic palette routing | Blender/glTF materials can explicitly preserve native PBR color through `spacefacePaletteTint`; authored geology, warning paint, signals, glass, radiators, docking, service, ceramic, rubber, and repair roles no longer inherit an indiscriminate hull tint. Hull, accent, drive, and structural machinery remain palette-addressable. | Focused sharing/tint tests pass. Each newly authored family still needs a normal-route value and identity review. |
| Helios | The existing three-LOD production geometry is retained and now carries deterministic, function-specific PBR maps for coated hull, armor, structural metal, machinery, radiators, docking contact, service paint, markings, and windows. Blanket palette tint, fake hull emissive, bulk clearcoat, and double-sided bulk materials are removed. Controlled post-public-launch browser/Electron frames prove the exact authored trade hub is visible and materially consistent on both routes. | Accepted as a surface-quality checkpoint in the controlled game camera. Natural approach/undock motion, transform continuity, mip-transition review, and measured station-specific performance remain open. The full OpenCode replacement is rejected; only its batching concept survives as an unimplemented experiment. |
| Seamed/graffiti landmarks | The old two-material gray/cyan procedural GLBs have been replaced by Blender-authored V3 assets with three LODs, explicit geology/mechanical/warning identities, recessed fracture seats, non-emissive survey hardware/paint, and six complete PBR roles each. The live browser presents exactly 8,340/9,876 LOD0 triangles after batching and retains every reviewed texture role. | Close/default/far browser frames passed controller visual review, including a visible mineral seam and `P-9` prospector history. Electron parity remains open. These remain non-colliding, non-mineable world dressing and do not change mining ownership. |
| Representative rock | `place_asteroid_rock_a` is authored and routed, its accidental unmasked molten emission is suppressed, and the geology profile has substantially higher/nonuniform roughness and normal variation than station metal. The closeout adds exact base-color/normal/ORM maps, a deterministic rock-surface library, and early preload of the final material state. | Mining-distance browser/Electron framing and positional-stability proof remain required. Mining/drillability semantics belong to the mining owner and must not be rewritten by graphics integration. |
| Combat/world effects | Data-driven weapon families, directional impact receipts, pooled effect substrates, phased destruction schedules, non-ball projectile geometry, mine/impulse identity, sticky charge orientation, and wreck identity are integrated. Ordinary implementation no longer depends on one generic colored circle or blue-box fallback. | Focused geometry/lifecycle/coverage tests are not final visual acceptance. Each weapon family and destruction scale still needs current firing/flight/impact/motion/dense/accessibility Electron/GPU capture and defect-driven repair. |
| Receipt gate | `check:graphics:asset-receipts` pins exact Helios, rock A, Wasp-candidate, and RCS source hashes, byte sizes, and triangle counts, and is now part of `check:art`. | Receipt closure proves artifact identity, not visual quality. Wasp remains unclassified/accessory-only until its live route and performance win. |
| Startup presentation | New Game and Continue paint a real loading presentation instead of leaving the previous screen frozen. The first authored Kestrel is admitted before off-camera world assets stream. A static V5 portrait avoids a second competing WebGL preview during launch. | Isolated hardware Electron reaches flight in 3.00 s for New Game and 3.10 s for Continue, with loading feedback in 1.4-7.7 ms. The 10-13 s case reproduces only under software SwiftShader, where the loader still paints in 30-45 ms. The remaining bottleneck is the critical first GPU/driver submission, not off-camera streaming. |

## 3. Current evidence and focused gates

Evidence is local under `.devshots/` and ignored unless a later release packet deliberately promotes
a compact, hash-bound manifest. A clean clone does not contain these images or videos.

Key evidence:

- Kestrel: `.devshots/k0-kestrel/normal-routes.json`,
  `.devshots/k0-kestrel/electron-route.json`, and
  `.devshots/graphics/kestrel-v5-live/live-capture.json`.
- Thrusters: `.devshots/graphics/thruster-acceptance/report.json`,
  `.devshots/graphics/thruster-acceptance/electron-route.json`, fixed scenario PNGs, and the WebM
  motion capture in the same directory.
- Startup: `.devshots/perf/integrated-new-game-final.json`,
  `.devshots/perf/integrated-continue-final2.json`, and the isolated hardware/software reports under
  `.devshots/perf/startup-subagent-before-*`, with matching loading/flight PNGs.
- Helios-sector route parity: `.devshots/helios-living-pocket/evidence.json` and the matching browser
  and Electron PNGs. Both use the public New Game/Launch handoff, then controlled station framing,
  and require the authored `place_station_trade_hub` center to be visible with no title/menu overlay.
  The accepted iteration-2 standalone close/game-camera views, tangent sanitation receipt, promotion
  receipt, and validator reports are under `.devshots/graphics/helios-surface-v3-candidate/`.
- Geology landmarks: `.devshots/graphics/geology-landmark-live/capture-report.json` plus the six
  close/default/far PNGs. Both assets retained one root/hull and zero world, hull, or fixed-camera
  pixel movement across 240 frames; the final contact sheet is
  `.devshots/graphics/geology-landmark-live/contact-sheet-final.png`.
- Visual stability: the latest `npm run check:visual-stability` output at this checkpoint reports
  360 frames, 45 warmup frames, 315 inspected frames, and zero failures.
- Khronos validation: both Helios source and release GLBs report zero errors. Each reports 60 warnings
  because the locally installed validator does not recognize the KTX2 image format/transfer-function
  values; the KTX2-aware SG-04 gate passes. Both source geology GLBs report zero errors and zero
  warnings. Their KTX2 release GLBs report zero errors plus 36 equivalent format-recognition warnings
  each; the repository's KTX2-aware SG-04 release gate passes both assets.

The following focused gates passed in the integration tree:

```powershell
npm run check:graphics:asset-receipts
npm run check:kestrel:normal-routes
npm run check:kestrel:electron-route
npm run check:thruster:electron-route
node scripts/check-thruster-vfx-pack.mjs
node scripts/check-sg08-render-vfx.mjs
node scripts/check-vfx-trail-bind.mjs
node --test test/vfx-additive-single-pass.test.mjs test/vfx-settings-runtime-truth.test.mjs test/vfx-save-restore-destroy.test.mjs
npm run check:vfx-sleep
python scripts/check-m4-surface-foundry.py
python scripts/check-helios-surface-export-contract.py
node scripts/check-authored-place-runtime-upgrade.mjs
node scripts/check-station-archetype-glb-load.mjs
node scripts/check-station-archetype-wiring.mjs
node scripts/check-ship-material-sharing-contract.mjs
node scripts/capture-geology-landmarks-live.mjs
npm run check:asset-status
npm run check:asset-reachability
npm run check:assets:live
npm run check:visual-stability
npm run check:flight:clean
npm run check:launch-policy
npm run check:sim:compare
```

The receipt gate was rerun after `cbdf1589` promotion and passed with these exact artifacts:

| Asset | Bytes | Triangles | SHA-256 |
|---|---:|---:|---|
| Helios | 79,717,896 | 1,664,738 | `94CB9DC727D606DF2F7C32F2C0FFB274EE6A572A8FA7BD40836D721563D1A578` |
| Representative rock A | 1,970,132 | 1,977 | `E99971402AB9A4A7335DBBFA44C582A9596357225BD3336A2914B192677DEFDA` |
| Wasp candidate | 12,797,604 | 11,526 | `FDFD7C76C793C5BE9593E9C095BADE0708C36163086F181FF08BDDFBE5173E5A` |
| RCS source | 238,516 | 1,040 | `EBB28EEC748A46086B52B96E4C870ABFD98F7E38AD256591837356F934D94934` |

Focused authored-admission, runtime LOD policy, surface-tint, rock-surface, projectile-family,
impulse-charge, runtime visual coverage, no-blue-box fallback, and wreck-identity tests passed before
promotion. These checks establish integration behavior; they do not replace the missing motion and
hardware evidence below.

The final `check:flight:clean` run passed all generated/simulation checks and five strict desktop plus
mobile browser runs with no page errors or non-probe console warnings.
`check:sim:compare` also exited successfully with uninterrupted/reload hash equality. Its report still
lists pre-existing expected-envelope trace/count differences; those remain explicit program debt and
were not re-recorded by this graphics branch.

`node scripts/check-parts-manifest.mjs` remains inherited-red across the broader catalog at this
checkpoint (2,970 passing checks, 218 failures, 88 diagnostics). Neither rebuilt geology asset has a
failure. Their diagnostics are the expected historical-profile size notice, new Blender/texture-owner
records, and additional semantic material roles. Do not weaken the new assets or rewrite unrelated
catalog entries merely to make that broad pre-existing count green.

## 4. Rejected or incomplete evidence

- An early 2026-07-19 `capture-helios-living-pocket` browser image was invalid: it showed the title
  composition even though the old harness reported flight state. The repaired harness follows the
  public `Space -> New Game -> Launch` route, requires authored player/station admission plus zero
  visible title/menu surfaces, uses isolated owned Electron ports/profile, and verifies that the
  Helios station center is in frame. The first new surface iteration was also rejected because its
  micro-normal and roughness fields read as cloudy sandpaper metal. Iteration 2 reduced stochastic
  energy while preserving panel, seam, hatch, radiator, and docking structure; its matched browser
  and Electron frames are accepted for this checkpoint.
- Deep-field background attempts that read as ribbons, faceted cards, beads, or screen-wide values
  were removed rather than rounded up as improvement.
- The representative `place_asteroid_rock_a` has a strong source/runtime contract but does not yet
  have the required accepted mining-distance browser/Electron contact sheet. Helios has accepted
  controlled browser/Electron surface frames but still needs natural approach/undock motion. The
  seamed and graffiti world-dressing landmarks now have accepted browser evidence but still need
  Electron parity.
- The performance closure base tip `99cad5b5` is integrated at `b235f062` without losing semantic
  PBR/admission, rock preload, relative-velocity prefetch/precompile, or Atlas velocity/background
  behavior. All 167 performance-modified and 49 graphics/PBR/VFX tests pass on the combined tree.
  Literal-frame-target, exact-worktree, three-run, and residency-evidence gates are integrated through
  `280cafb0`. A later narrow fleet audit proved that live ships still used ship-local static batches;
  its first scene-pool activation candidate failed closed during pipeline admission and was rejected.
  The repaired candidate remains isolated until its 10/25/50-ship rerun survives review. Fresh long-soak,
  floor-GPU, memory, dense-combat, autosave, and combined graphics/performance measurements remain
  required before claiming the M6 performance exit.
- Combat VFX has structural implementation and lifecycle evidence, but no full visual-family
  acceptance packet yet.
- The current background has a better black-space/value foundation but lacks final localized
  authored phenomena and matched Electron/performance proof.
- `node scripts/check-asteroid-motion.mjs` is inherited red at merge base `91d88d74`: its hard-coded
  assertion expects 20 live fields while the sector data exposes 47. The graphics branch changes
  only palette/fog values in `src/data/sectors.js`, not field cardinality. Reconcile the checker with
  Claude's final spatial-truth data during promotion; do not delete fields or edit a golden to hide
  the mismatch.

## 5. Remaining work, ordered by player-visible return

1. **Close natural-route station/geology motion.** Keep the accepted Helios iteration-2 surfaces,
   then capture natural approach/undock wide and close in browser and Electron; capture
   `place_asteroid_rock_a` at mining distance and repeat the accepted seamed/graffiti views in
   Electron. Inspect scale, mips, draw state, target readability, and transform continuity. The
   stable OpenCode donor has no superior material payload and regresses distance rendering.
2. **Visually accept or repair combat VFX.** Record kinetic, rail, plasma, beam, and missile muzzle,
   flight, shield hit, hull hit, and dense combat; then small/ship/capital destruction through time.
   Reject balls, generic circular flashes, primary rings, identical puffs, strobing beams, and
   bloom-only identity. Add pooling/lifecycle and Spector receipts.
3. **Author localized space structure without reintroducing haze.** Retain real black space and add
   localized, composed nebular, dust, tidal, debris, planet, and anomaly structures with stable
   parallax. Sector identity must change composition, landmarks, density, and local illumination,
   not tint the same field.
4. **Apply the PBR multiplier across frequent assets.** Work manifest asset by asset through common
   NPC ships, station families, common rocks, wrecks, mining machinery, containers, and beacons.
   Give each functional material its own physical scale, roughness band, normal response, wear logic,
   bevel treatment, and authored material role; do not clone Kestrel's textures across the fleet.
5. **Finish/classify fleet heroes and donors.** Resolve Wasp and Pelican source/export candidates.
   Preserve only candidates that survive normal-route and performance comparison.
6. **Close startup and release parity.** Treat hardware Electron's 3.00-3.10 s route as the current
   baseline. Optimize the protected critical opening-frame GPU submission only with measured renderer
   evidence; do not defer already-required first-frame content or relabel invisible post-flight
   streaming as the bottleneck. Run dense-combat overdraw, residency/memory soak, accessibility,
   browser/Electron parity, and target/floor-hardware acceptance.

## 6. Promotion record

1. Claude's final dirty `master` state was captured in commits `cdca6433`, `e9bc19d5`, and
   `1905cac8` without reading or importing `design/program/_review/`.
2. The performance checkpoint `1bdde6c8`, graphics checkpoint `e3ad1caf`, and Claude snapshot were
   combined in `codex/unified-integration-20260719`.
3. Background/bloom, sector palette, renderer, and VFX overlaps were resolved by preserving true
   black negative space, restrained two-level bloom, localized depth, continuous pooled plumes,
   and actuator-truth RCS while retaining the new map/travel coordinate and velocity contracts.
4. The unified tree passed the focused map, Atlas, travel, VFX, bloom/background, asset, flight,
   visual-stability, and launch-policy gates listed above. The timing-sensitive flight benchmark
   passed alone at 1.02 ms/tick for 240 ships and 0.38 ms/tick for the physics/flight case.
5. The frozen Claude state was first committed on `master` as `ec6ee835`; the verified unified tree
   was then promoted as merge commit `ee9e0ab3`. The tracked result matched `a752702b` exactly.
6. Late performance commits `abcd81be`, `d9162ebd`, and `45090dd5` were integrated after promotion;
   `f0b3b154` repaired their context-resource and route-evidence gaps and passed the live recovery
   probe.
7. Graphics closeout `bd79f2ba` and `5219491d` closed exact artifact receipts, common-rock maps,
   authored admission, semantic PBR routing, runtime visual-family identity, authored bounds, rock
   preload, and impulse-charge orientation. `98e1e429`/`1de8a861` recorded the long-term plan and
   Helios donor decision; `5863331c` added the receipt gate to `check:art`.
8. Merge `cbdf1589` promoted that closeout to `master`; `21d82428` committed the Atlas/camera evidence
   repair, and `b235f062` integrated the reviewed performance synthesis.
9. This promotion is a coherent playable checkpoint, not a claim that combat-family, background-
   authoring, asset-family PBR, long-soak performance, or release parity is complete.

## 7. Worktree cleanup after promotion

Do not delete a worktree because its folder name looks stale. For each worktree, record dirty paths,
untracked files, branch tip, unique commits, and patch equivalence to final `master`.

- Promotion is complete. Nine clean or patch-equivalent promotion/helper worktrees were removed,
  including the unified, Claude snapshot, background, Kestrel, startup, and superseded integration
  checkouts.
- Twelve Wave-2 context, implementation, review, and survey worktrees were removed after confirming
  their product commits were already reachable or patch-equivalent and their only dirty files were
  `CONTEXT-*`, `REVIEW-*`, or `SURVEY-*` process notes.
- Three prompt/return-only orchestration checkouts were removed while their product branches were
  retained. The unregistered `SpaceFace-orch-codex-helios` copy was hashed against Git history and
  moved out of the GitHub directory to a recoverable Temp quarantine; its only unknown product
  content was an obsolete game-state variant and was correctly rejected.
- `SpaceFace-graphics-overhaul` retains substantial dirty Blender/source assets and remains protected.
  The full Helios-golden replacement is rejected; its useful production builder is already on master.
  Graphics-closeout, Helios, Depth, Kimi, and four small orchestration satellites were removed after
  merge, rejection, donor commit, or branch/tag/hash-archive preservation. Only master, the protected
  Blender/source worktree, and the active performance repair remain registered.
- Delete a branch only after its accepted product result is reachable from final `master`, every
  valuable dirty/untracked file has been deliberately preserved or rejected, and its worktree is
  clean.

## 8. Definition of the next coherent checkpoint

The current product checkpoint descends from `b235f062` and the evidence hardening through
`280cafb0`. The next coherent checkpoint first resolves live authored ship pooling and reruns the
strict combined graphics/performance matrix, then adds current natural-route browser/Electron proof for Helios
and the representative rock, visual-family Electron/GPU acceptance for combat effects and
destruction, one localized authored space-structure vertical that does not lift the black floor,
and the next high-frequency PBR asset family. The authoritative continuation order and architecture
are in
[`LONG_TERM_GRAPHICS_OVERHAUL.md`](../graphics-sprints/LONG_TERM_GRAPHICS_OVERHAUL.md).
