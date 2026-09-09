# Graphics Overhaul Integration Checkpoint

> **Current graphics authority:** this checkpoint is a historical integration/resumption record,
> not an authoring recipe. New and resumed visual work starts at
> [`../../docs/visual-assets/README.md`](../../docs/visual-assets/README.md) and follows
> [`../../.grok/skills/spaceface-blender-material-truth/SKILL.md`](../../.grok/skills/spaceface-blender-material-truth/SKILL.md).
> The former SPEC3-F9 fixed technique/detail/render counts and its Full Finish executables are
> **HISTORICAL / LEGACY REPLAY ONLY** and require an explicit `--legacy-replay` opt-in.

**Checkpoint date:** 2026-07-21 (fleet-foundry and PQ-011 synthesis)

**Status:** GRAPHICS CLOSEOUT PROMOTED TO `master` THROUGH `54548e09`; PLAYABLE BROWSER/ELECTRON
CHECKPOINT, FINAL OVERHAUL ACCEPTANCE PENDING;
PQ-022 place_station_military SUBSLICE route-accepted; PQ-018 Wreck Cathedral SOURCE candidate
preserved pending PQ-017; fleet breadth foundry SOURCE package integrated but runtime-pending.

**Current audited integration range:** readable HUD `ea698805`, Helios civilian fleet `54548e09`,
closeout `eb8ed839`, fleet foundry `8d21b07e..0ae4cc6a`, and
PQ-011 integration `8331c1ba`/`5fce58fb` plus save-schema portability repair `40ef53f5`. Earlier:
combined synthesis `b235f062`; propulsion repair `59f91d19`; geology/interaction repair `e8838e2c`;
Electron RCS evidence harness `3d2dc765`; hybrid-batching research disposition `1074c078`.

**Earlier unified promotion:** `ee9e0ab3`, hardened through `f0b3b154`

**Unified integration revision:** `a752702b` on `codex/unified-integration-20260719`

**Graphics donor revision:** `e3ad1caf` on `codex/graphics-integration-20260718`

**Graphics closeout commits:** `bd79f2ba`, `5219491d`, `98e1e429`, `1de8a861`, `5863331c`

**Post-closeout graphics fixes:** `e8838e2c`, `3d2dc765`

**Performance synthesis donor:** `99cad5b5`, integrated by `b235f062`

**Rejected post-synthesis renderer experiment:** `04805924..9d626fd8`, preserved at exact tip
`9d626fd8` by recovery tag `archive/performance-pooling-experiment-20260720`; none of this range
belongs on `master`

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
browser/Electron/GPU performance matrix must still be rerun on one clean final combined tree. Six
later scene-pool/BatchedMesh commits were measured and rejected, so current `master` deliberately
retains ship-local static batching.

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
| Thrusters and RCS | Hitch/Kestrel uses a throttle-responsive white-hot core, directional inner plume, turbulent sheath, vapor layer, and directional RCS. Repair `59f91d19` invalidates stale authored-socket caches, binds lateral RCS to authored world-space nozzle transforms, coalesces duplicate same-side impulses, preserves geometric retro fallback, reuses hot-path records, and clears plume/RCS/light/cooldown state at save and sector boundaries. `engineTrails=false` now keeps a compact core/sheath and RCS response instead of removing propulsion feedback. | Focused mapping, wiring, lifecycle, settings, allocation, and sleep gates pass. A fresh hardware Electron run after `3d2dc765` exposed core, inner, sheath, and vapor layers, two opposed RCS jets, zero plume/RCS frame allocations, and no reported issues on Intel ANGLE/D3D11. The receipt still embeds no Git identity, so compact, reduced-motion/flash, dense, and Spector proof remain open. |
| Presentation stability | Authored ships/stations no longer present blue-clay boxes before replacement. `5219491d` extends the fail-closed admission contract and authored bounds behavior beyond the starter; hidden off-camera assets may stream after flight handoff, but they publish no unrelated primitive identity. `e8838e2c` gives authored geology one stable presentation boundary, removes the hidden procedural `asteroidInstanceBody` from the global instance-pool path, and retains only a local same-semantic procedural asteroid when authored loading or compilation fails. | Focused admission tests and a fresh 360-frame visual-stability route pass. The broader continuity harness is frozen unaccepted after review found fail-open admission telemetry and a stale effective-LOD receipt; natural admission/rebase/interpolation/LOD/HLOD/pool/save/Continue/context continuity remains open until those P1 defects are repaired and both browser and Electron pass. |
| Background | The accepted substrate restores black negative space and deterministic stars. Full-screen blue haze and rejected ribbon/card-like deep-field overlays are absent. Celestial layers remain behind gameplay. | This is a de-hazed foundation, not final authored deep space. Localized nebular/debris/tidal structure still needs an authored pass and matched browser/Electron review. |
| PBR substrate | Semantic authored roles are bound during asset load. Incomplete assets receive bounded role-specific base-color, normal/bump, roughness, metallic, and AO fallback maps rather than a single shiny-plastic response. Kestrel, Helios, and the representative geology role have dedicated profiles. | A procedural fallback is compatibility coverage, not a substitute for asset-specific UVs, authored maps, bevels, material slots, and normal-route visual approval. |
| Ship-condition HUD | `ea698805` presents a non-diegetic live ship schematic with a shield ring, hull crop, explicit HULL/SHD values, and warning states. Fresh active-flight nominal/damaged captures show no text over the ship image. | Integrated and a11y-green. Broader HUD information-density reduction remains M1-HUD work; this row does not claim the entire HUD finished. |
| Helios civilian family | `54548e09` promotes Lark, Cradle, and Span with editable Blender sources, explicit three-level LODs, differentiated role silhouettes, layered hard-surface construction, 15-image semantic PBR sets, release KTX2 assets, and live manifest wiring. Asset-live proves Lark/Span authored admission; the public Helios pocket passes in browser and Electron. | Accepted vertical. Surface response still needs later material-specific polish; this does not complete every ship family. |
| Fleet breadth foundry | `8d21b07e..0ae4cc6a` adds reusable Blender hard-surface kits, faction surface languages, deterministic decals/trim/grime maps, 14 ship/station variants, 20 scenery props, structural validators, and game-camera review sheets. The controller reran generation/validation and retained the source package. Universal triangle ceilings were removed: complexity is evaluated by physical scale, screen contribution, LOD, draw/residency/frame evidence, and visual payoff. | **Source-complete, runtime-pending.** None of these candidates counts as live breadth until selected assets are adapted, registered, compressed, and accepted through matched normal-camera browser/Electron motion and performance review. Sparse variants and standalone-pretty candidates must still be rejected or repaired. |
| Semantic palette routing | Blender/glTF materials can explicitly preserve native PBR color through `spacefacePaletteTint`; authored geology, warning paint, signals, glass, radiators, docking, service, ceramic, rubber, and repair roles no longer inherit an indiscriminate hull tint. Hull, accent, drive, and structural machinery remain palette-addressable. | Focused sharing/tint tests pass. Each newly authored family still needs a normal-route value and identity review. |
| Helios | The existing three-LOD production geometry is retained and now carries deterministic, function-specific PBR maps for coated hull, armor, structural metal, machinery, radiators, docking contact, service paint, markings, and windows. Blanket palette tint, fake hull emissive, bulk clearcoat, and double-sided bulk materials are removed. Controlled post-public-launch browser/Electron frames prove the exact authored trade hub is visible and materially consistent on both routes. | Accepted as a surface-quality checkpoint in the controlled game camera. Natural approach/undock motion, transform continuity, mip-transition review, and measured station-specific performance remain open. The full OpenCode replacement is rejected; only its batching concept survives as an unimplemented experiment. |
| Seamed/graffiti landmarks | The old two-material gray/cyan procedural GLBs have been replaced by Blender-authored V3 assets with three LODs, explicit geology/mechanical/warning identities, recessed fracture seats, non-emissive survey hardware/paint, and six complete PBR roles each. `e8838e2c` uses the seamed asset as a skin over a real common asteroid and replaces misleading rock-shaped belt/POI dressing one-for-one with survey buoys or mining drones. | The accepted close/default/far browser captures remain useful surface evidence, but predate the mineable semantic wiring. The new natural mineable route, Electron parity, and continuity still need proof. |
| Representative rock | `e8838e2c` binds common, metallic, icy, and crystalline fields to material-matched authored representative geology without changing simulation identity or drill/tether authority. Authored failure retains a matching procedural asteroid rather than an unrelated primitive; rare exotic/Xenium geology deliberately remains procedural until a matching authored asset exists. Rock A retains exact base-color/normal/ORM maps, nonuniform roughness, and suppressed accidental molten emission. | Mining-distance browser/Electron framing, mip behavior, and positional continuity remain required. The prior rock-shaped `fx` interaction mismatch is closed in implementation, not yet route-accepted. |
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
- Thrusters: the locally retained files regenerated after `3d2dc765` are
  `.devshots/graphics/thruster-acceptance/electron-route.json`,
  `.devshots/graphics/thruster-acceptance/electron-cruise.png`, and
  `.devshots/graphics/thruster-acceptance/electron-hard-turn-rcs.png`. The JSON records Intel
  ANGLE/D3D11, four main-plume layers, two hard-turn RCS instances, zero reported plume/RCS frame
  allocations, and no reported issue. It still has no embedded commit identity; the older
  report/fixed-scenario/WebM pointers were not present locally and are not evidence claims.
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
  `.devshots/graphics/geology-landmark-live/contact-sheet-final.png`. These controlled captures
  predate `e8838e2c` and do not substitute for natural mineable-route proof.
- Visual stability: the latest post-`e8838e2c` `npm run check:visual-stability` output reports
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
npm run check:rcs-jets
npm run check:rcs-sign-truth
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

The checkpoint-baseline `check:flight:clean` run passed all generated/simulation checks and five
strict desktop plus mobile browser runs with no page errors or non-probe console warnings. After
`59f91d19`, the focused propulsion gates remained green and an isolated flight benchmark measured
0.83 ms/tick for 240 ships, but a later five-run headed probe was red on intermittent
throttle/boost/reverse behavioral assertions despite clean render/console/canvas/SG02 checks. That
failure overlaps the active flight lane and is not attributed to the propulsion diff; it must be
rerun on the final settled tree rather than relabeled green here.
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
- Controlled geology fixtures establish zero movement for two named assets, but there is no combined
  natural-route screen-continuity packet across authored admission, floating-origin rebase,
  interpolation, LOD/HLOD, instance ownership, save/Continue, and context recovery. Acceptance
  requires zero multi-width jumps and zero replacement-frame flicker. The current continuity harness
  is frozen unaccepted: adversarial review found its admission token still failed open and its
  synchronous LOD receipt observed a stale selector rather than the visible applied level.
- The performance closure base tip `99cad5b5` is integrated at `b235f062` without losing semantic
  PBR/admission, rock preload, relative-velocity prefetch/precompile, or Atlas velocity/background
  behavior. All 167 performance-modified and 49 graphics/PBR/VFX tests pass on the combined tree.
  Literal-frame-target, exact-worktree, three-run, and residency-evidence gates are integrated through
  `280cafb0`. A later narrow fleet audit proved that live ships still used ship-local static batches.
  Primitive pools, composition-merged pools, corrected exact-key pools, and heterogeneous
  `THREE.BatchedMesh` pages were all implemented and measured in the isolated
  `04805924..9d626fd8` range. Every measured implementation was rejected: the final page approach reduced visible
  opaque batches to roughly 91-95 but regressed target Intel p95 to 250.1/616.8/433.3 ms for
  10/25/50 ships, with every sampled frame over 32 ms. Review also found child-hull transform
  invalidation, unsafe geometry collision signatures, dead geometry retained in partially occupied
  pages, and missing PBR-parity proof. None of that range is integrated. Fresh long-soak, floor-GPU,
  memory, dense-combat, autosave, and combined graphics/performance measurements remain required
  before claiming the M6 performance exit.
- Combat VFX has structural implementation and lifecycle evidence, but no full visual-family
  acceptance packet yet.
- The current background has a better black-space/value foundation but lacks final localized
  authored phenomena and matched Electron/performance proof.
- `node scripts/check-asteroid-motion.mjs` is inherited red at merge base `91d88d74`: its hard-coded
  assertion expects 20 live fields while the sector data exposes 47. The graphics branch changes
  only palette/fog values in `src/data/sectors.js`, not field cardinality. Reconcile the checker with
  Claude's final spatial-truth data during promotion; do not delete fields or edit a golden to hide
  the mismatch.

### New measured defect (2026-07-20, surfaced by the accepted continuity harness)

- **`station-applied-lod-inert`** — the Helios authored root carries real lod0/lod1/lod2 tagged
  topology (2 tagged drawables per bucket, live-verified), but LOD requests do not change the
  visible set: the truthful applied-census receipt shows `visibleBuckets {lod0: 2}` under both the
  probe's forced `lod2` request and the renderer's own steady-state selector (`lod1`). The station
  renders LOD0 unconditionally — a real distance-rendering/performance defect in the station LOD
  forwarding chain (suspect: the `attachStationHlod` wrapper / authored-upgrade `updateLod`
  replacement ordering). Receipts persist in the m2 harness report; diagnosis script
  `.tmp/orch/diag4-helios-lod.mjs`. Owned by the station/render lane; the m2 harness records it as a
  named known defect and will flip to strict matching when the chain is repaired.

## 5. Remaining work, ordered by player-visible return

1. **Close natural-route station/geology motion and identity.** Keep the accepted Helios iteration-2 surfaces,
   then capture natural approach/undock wide and close in browser and Electron; capture
   `place_asteroid_rock_a` at mining distance and repeat the accepted seamed/graffiti views in
   Electron. Inspect scale, mips, draw state, target readability, and transform continuity. The
   stable OpenCode donor has no superior material payload and regresses distance rendering. Include
   the combined admission/rebase/interpolation/LOD/HLOD/save/context screen-continuity packet and
   verify the committed `e8838e2c` geology/interaction repair on the natural route.
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
9. `e8838e2c` bound material-matched authored geology to real asteroid simulation identities, removed
   the hidden instance-pool ghost path, supplied same-semantic fallbacks and stable LOD forwarding,
   and replaced misleading faux-rock dressing.
10. `3d2dc765` isolated pure-yaw RCS evidence before assisted-flight velocity blending; the subsequent
   hardware Electron route passed with four plume layers, two opposed RCS jets, zero frame allocations,
   and no issues.
11. This promotion is a coherent playable checkpoint, not a claim that combat-family, background-
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
  The 2026-07-20 audit found 244 dirty paths: 180 under assets (80 release, 58 Kestrel evidence/source,
  42 parts), 39 render/tool/test implementation paths, and 25 obvious or ambiguous contamination/
  process paths. Only eight dirty asset files match current master; 236 paths differ. This is not a
  clean releasable worktree and cannot be removed or checkpointed wholesale without asset-by-asset
  provenance and rejection receipts.
  Graphics-closeout, Helios, Depth, Kimi, and four small orchestration satellites were removed after
  merge, rejection, donor commit, or branch/tag/hash-archive preservation. Only master, the protected
  Blender/source worktree remain registered. The rejected performance worktree was removed after its
  clean `9d626fd8` tip, artifact hashes, and explicit rejection range were recorded; its branch remains
  recoverable through `archive/performance-pooling-experiment-20260720`; the obsolete local branch is
  retired after this ledger transaction.
- Delete a branch only after its accepted product result is reachable from final `master`, every
  valuable dirty/untracked file has been deliberately preserved or rejected, and its worktree is
  clean.

## 7.5. 2026-07-20 closeout synthesis (commits `d6d5278c`..`eb8ed839`)

This closeout promoted one PQ-022 visual-family subslice to route-acceptance, preserved one PQ-018
source candidate pending its PQ-017 site substrate, and classified/disposed the foreign untracked
graphics batch that had accumulated in the primary checkout.

**PQ-022 place_station_military remaster — ROUTE-ACCEPTED subslice.** The stacked-box silhouette was
replaced with a terraced three-band armored customs bastion at `3ea2fe99`: layered armor plates and
blast-shield skirts, an aft command citadel (sensor dome, parabolic dish, antenna farm), a forward
customs/docking apron (recessed mouth, armored jaws, scan arch, docking pads, chevron warnings,
personnel airlock), an exposed-frame engineering keel with radiator wings, and deliberate port/
starboard asymmetry. Ten authored PBR materials with nonuniform roughness, normal/detail, bevels,
edge wear, and stenciled decals. The manifest row is preserved (same ID, sockets
`SOCKET_Structure_Core/Emissive/Dock_Approach`, +X forward, collision proxy, 3 LODs at
65192/27302/5932 triangles). Owning checks green on the combined tree (170 ok glb-load; 199 ok
wiring; asset-status/reachability/live OK; visual-stability failureCount 0; sim:compare exit 0;
launch-policy OK). **Natural-route capture:** 6 frames in
`.devshots/pq022-military-station-routes/` — Helios `station_coalition` and Tethys `station_customs`
in default/close/far framings. Independent grok vision verdict ACCEPT: all six frames show the
station visible (meshCount 6/6, authored state), military/customs identity readable, PBR quality 4
(close/default) softening to 3 (far, expected), no blue-clay first frame, no flicker, no origin
jump, no LOD pop, no material swap. This completes ONE PQ-022 asset subslice; the queue outcome
covers many families and remains `planned`.

**PQ-018 Wreck Cathedral — source candidate preserved, NOT route-accepted.** The full SOURCE_GLB
package landed at `6df5a210`..`7330a85b`: Blender source (9.6 MB), GLB (11.2 MB), 26 authored PBR
textures, 15 PBR-isolate captures + 3 wireframes + 3 silhouettes, a turntable MP4, 11 reports
including a 75-sample flythrough-clearance probe (0 hits over the 72×58 m envelope) and a clean
gltf-validator result, reproducible authoring scripts, and a 45-entry SHA-256 manifest. It is NOT
registered, placed, interactive, saved, or route-accepted. Full PQ-018 depends on PQ-017 (World
Site kernel); the queue row stays `planned`.

**Untracked-graphics-batch classification (historical).** 263 foreign untracked files were classified into five
categories per closeout spec. 17 durable canon/spec/tooling files committed (`a418c111`): the FACT
Voice Bible, the 47-A opening comms script, SPEC3-F9 (now retained only as the historical Full
Finish Bar replay contract), the
Gemini/T1c design briefs, the Blender authoring tooling (`revamp_full_finish.py`,
`gen_revamp_textures.py`, `cli_export_part.py`, `update_place_manifest_notes.py`,
`write_place_evidence.py`, three PowerShell runners), the evidence/contract scripts
(`verify-full-finish-evidence.mjs`, `fix-revamp-part-contract.mjs`, `scrub-revamp-doc-contract.mjs`),
and the PQ-022 capture tool (`capture-military-station-routes.mjs`). 247 reproducible category 3+4+5
files were removed after a hash-bound SHA-256 recovery manifest was committed (`eb8ed839`): 23
Blender `*_export_tmp.glb` intermediates (canonical `.blend` sources on master), 222 auto-baked
`Material_*_ao_1k.png` / `trim_sheet` / `wear_mask` textures across 48 part dirs (10 overlap tracked
content; 38 are unreferenced procedural — runtime uses embedded release-GLB textures), and 2 scratch
batch logs that record the batch crashing with a PowerShell parameter-binding error. None of the
removed files is referenced by any tracked manifest or source. Disposition record:
`design/program/_archives/pq022-closeout-20260720/DISPOSITION.md`. Primary checkout untracked count
is now 0.

The named Full Finish tools and verifier are not a current production route. They preserve exact
reproduction of this checkpoint and fail closed unless invoked with `--legacy-replay`. Their
fixed counts and technique list must not be copied into a new asset brief or used to overrule the
current material-truth standard.

**Donor worktree cleanup.** `sf-pq014`, `sf-pq018`, `sf-pq022` were removed after their accepted
content was verified byte-identical on master. On 2026-07-21 the remaining
`SpaceFace-graphics-overhaul` mixed donor was selectively dispositioned: accepted concepts were
already on master, Helios civilian was promoted in `54548e09`, Ashline runtime promotion was rejected,
and the full dirty payload was hash-archived before the physical worktree/branch were removed. Only
`master` remains registered.

## 8. Definition of the next coherent checkpoint

The current product checkpoint descends from `b235f062`, evidence hardening through `280cafb0`,
propulsion repair `59f91d19`, geology truth `e8838e2c`, and RCS evidence repair `3d2dc765`. The next
coherent checkpoint retains the measured ship-local batching
winner and reruns the strict combined graphics/performance matrix on one clean exact commit, then adds
exact-head propulsion settings/accessibility proof, current natural-route browser/Electron proof for
Helios and the representative rock, verifies the geology/interaction repair, and completes the full
flicker-continuity packet,
visual-family Electron/GPU acceptance for combat effects and
destruction, one localized authored space-structure vertical that does not lift the black floor,
and the next high-frequency PBR asset family. The authoritative continuation order and architecture
are in
[`LONG_TERM_GRAPHICS_OVERHAUL.md`](../graphics-sprints/LONG_TERM_GRAPHICS_OVERHAUL.md).
