# Graphics Overhaul Integration Checkpoint

**Checkpoint date:** 2026-07-19

**Status:** PARTIAL, VALIDATED IN ISOLATION, NOT YET PROMOTED TO `master`

**Integration branch:** `codex/graphics-integration-20260718`

**Checkpoint revision before the current Helios surface slice:** `e2f097ec`

**Merge base with the active program build:** `91d88d74`

This is the durable resumption and promotion record for the multi-day graphics overhaul. It records
what the current integration tree actually presents, what has only structural evidence, what has
been visually rejected, and how to promote the final tree without importing oversized historical
asset intermediates. It does not promote any `M0-M6` or roadmap row by itself.

## 1. Integration safety and current topology

At this checkpoint, `master` is still receiving concurrent Atlas/map/travel work and must remain
read-only to the graphics lane. The graphics integration branch has advanced substantially after
`91d88d74`; current `master` has also advanced independently. Promotion therefore requires a fresh
worktree from final `master` and a conflict-aware final-tree squash. Never merge the graphics branch
history directly: older Helios commits contain oversized intermediate blobs that were removed from
the final tree by `117e991a`.

The final integration tree has no file over 100 MiB. Its largest tracked asset is the sanitized
Helios source GLB at about 79.7 MB. The runtime release GLB is about 79.1 MB. Re-check these facts in
the promotion worktree rather than assuming this snapshot remains current.

OpenCode's `SpaceFace-oc-helios-golden` donor is stable and rejected as a merge source. Its 30
textures are byte-identical to the integrated Helios, while its smaller release GLB achieves its
size by deleting LOD1/LOD2 and `SOCKET_Structure_Core`; the remaining approximately 1.02-million
triangle station would render at every distance. Its source GLB also exceeds the project's landmark
budget and GitHub's 100 MiB file limit. Do not cherry-pick its loader, manifest, or asset changes.
One design idea remains worth reimplementing independently: semantic tint routing for coated hull,
machinery, and explicit faction accents while preserving native signal, warning, glass, radiator,
docking, service, and geology colors.

## 2. Player-visible outcomes in the integration tree

| Vertical | Current truth | Acceptance boundary |
|---|---|---|
| Starter ship | Borrowed Time / Kestrel V5 is the live New Game and Continue ship. The authored root mounts without a retained fallback, visible box, or proxy swap. Its five consolidated live surfaces retain 17 semantic material identities and 33 textures. | Browser and hardware Electron route evidence exists. The normal gameplay frame, not the Blender source, is decisive. |
| Thrusters and RCS | Hitch/Kestrel uses a throttle-responsive white-hot core, directional inner plume, turbulent sheath, vapor layer, and directional RCS. The implementation is pooled and reports zero per-frame plume/RCS allocations. Reduced-motion still communicates thrust. | Browser motion and fixed scenarios plus hardware Electron cruise/RCS captures passed. Spector state capture and durable asset classification remain open. |
| Presentation stability | Authored ships/stations no longer present blue-clay boxes before replacement. Hidden off-camera assets may stream after flight handoff, but they publish no pixels until authored. The stability probe observed one stable Kestrel root/composition for 360 frames with zero failures. | Any visible unauthored identity, repeated root/composition swap, exploding bound, or repeated visible LOD transition remains a failure. |
| Background | The accepted substrate restores black negative space and deterministic stars. Full-screen blue haze and rejected ribbon/card-like deep-field overlays are absent. Celestial layers remain behind gameplay. | This is a de-hazed foundation, not final authored deep space. Localized nebular/debris/tidal structure still needs an authored pass and matched browser/Electron review. |
| PBR substrate | Semantic authored roles are bound during asset load. Incomplete assets receive bounded role-specific base-color, normal/bump, roughness, metallic, and AO fallback maps rather than a single shiny-plastic response. Kestrel, Helios, and the representative geology role have dedicated profiles. | A procedural fallback is compatibility coverage, not a substitute for asset-specific UVs, authored maps, bevels, material slots, and normal-route visual approval. |
| Semantic palette routing | Blender/glTF materials can explicitly preserve native PBR color through `spacefacePaletteTint`; authored geology, warning paint, signals, glass, radiators, docking, service, ceramic, rubber, and repair roles no longer inherit an indiscriminate hull tint. Hull, accent, drive, and structural machinery remain palette-addressable. | Focused sharing/tint tests pass. Each newly authored family still needs a normal-route value and identity review. |
| Helios | The existing three-LOD production geometry is retained and now carries deterministic, function-specific PBR maps for coated hull, armor, structural metal, machinery, radiators, docking contact, service paint, markings, and windows. Blanket palette tint, fake hull emissive, bulk clearcoat, and double-sided bulk materials are removed. Controlled post-public-launch browser/Electron frames prove the exact authored trade hub is visible and materially consistent on both routes. | Accepted as a surface-quality checkpoint in the controlled game camera. Natural approach/undock motion, transform continuity, mip-transition review, and measured station-specific performance remain open. The dense OpenCode donor remains rejected because it deletes LOD1/LOD2 and the structure socket. |
| Seamed/graffiti landmarks | The old two-material gray/cyan procedural GLBs have been replaced by Blender-authored V3 assets with three LODs, explicit geology/mechanical/warning identities, recessed fracture seats, non-emissive survey hardware/paint, and six complete PBR roles each. The live browser presents exactly 8,340/9,876 LOD0 triangles after batching and retains every reviewed texture role. | Close/default/far browser frames passed controller visual review, including a visible mineral seam and `P-9` prospector history. Electron parity remains open. These remain non-colliding, non-mineable world dressing and do not change mining ownership. |
| Representative rock | `place_asteroid_rock_a` is authored and routed, its accidental unmasked molten emission is suppressed, and the geology profile has substantially higher/nonuniform roughness and normal variation than station metal. | Mining-distance browser/Electron framing and positional-stability proof remain required. Mining/drillability semantics belong to the mining owner and must not be rewritten by graphics integration. |
| Combat effects | Data-driven weapon families, directional impact receipts, pooled effect substrates, and phased destruction schedules are integrated. Ordinary implementation no longer depends on primary concentric-ring language. | Structural and schedule receipts are not visual acceptance. Each weapon family and destruction scale still needs firing/flight/impact/motion/dense/accessibility capture and defect-driven repair. |
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
- The `SpaceFace-performance-closure` donor contains useful deterministic scenario/attribution
  observability but no runtime optimization. Do not cherry-pick it before repairing its undefined
  restoration variable, replacing ancestor-visibility claims with real draw/pixel evidence, and
  changing `allShipsAuthored` to fail only on visibly presented fallback identities. Hidden
  post-flight streaming is intentional and must not be mislabeled as a visual failure.
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

## 6. Promotion to the final `master`

1. Wait for the active Atlas/map/travel build to finish and for `master` to be committed or
   explicitly released. Record final HEAD, branch, staged paths, dirty paths, and worktree inventory.
2. Record the integration branch HEAD and the status/hashes of every dirty donor. Do not clean or
   reset them to make promotion convenient.
3. Create a fresh isolated promotion worktree from final `master`.
4. Apply `git merge --squash codex/graphics-integration-20260718`. Do not merge its history.
5. Resolve every overlap against merge base `91d88d74`: preserve newer master gameplay, world,
   navigation, mission, and travel semantics; adapt rendering/admission/assets around those seams.
   When both sides contain visual work, compare matched player-route frames and synthesize the
   stronger parts rather than selecting a branch wholesale.
6. Verify the staged final tree contains no file over 100 MiB, no stale manifest hashes, no required
   ignored-only runtime asset, and no obsolete Helios intermediate.
7. Run the focused gates above, then `npm run check:sim:compare` and `npm run check`. Repeat matched
   browser/Electron Kestrel, Helios, rock, background, thruster, combat, loading, and accessibility
   evidence from the promotion revision.
8. Commit one reviewed graphics-promotion slice. Only then reconcile `NOW.md`,
   `01_VERIFIED_DONE.md`, `02_REMAINING_WORK.md`, `03_LIVE_ACCEPTANCE_MATRIX.md`, and the roadmap rows
   to the promoted revision.

## 7. Worktree cleanup after promotion

Do not delete a worktree because its folder name looks stale. For each worktree, record dirty paths,
untracked files, branch tip, unique commits, and patch equivalence to final `master`.

- Keep through promotion: the integration worktree; the active master; dirty graphics, Helios,
  performance, and Depth donors until their unique product changes are classified.
- Likely removable after patch-equivalence proof: `sf-bg-polish`, `sf-kv5`, and
  `sf-startup-loading`; the first two are already represented in integration, while startup still
  needs a final-tree comparison.
- Wave-2 context/review and orchestration worktrees: retain only unique product diffs or durable
  conclusions. Prompt logs, transcripts, return prose, build caches, and duplicate captures are
  process artifacts governed by `docs/ARTIFACT_RETENTION.md`.
- Delete a branch only after its accepted product result is reachable from final `master`, every
  valuable dirty/untracked file has been deliberately preserved or rejected, and its worktree is
  clean.

## 8. Definition of the next coherent checkpoint

The next checkpoint is not “all graphics finished.” It is a clean promoted `master` that boots in
browser and Electron, shows the authored Kestrel and thrusters immediately after the loading
presentation, streams only invisible off-camera assets, presents the de-hazed background, loads
Helios and the representative rock without flicker or identity swaps, and has a current honest list
of remaining visual-family work. Feature development may continue from that stable base while the
asset-by-asset PBR and combat/background acceptance program proceeds.
