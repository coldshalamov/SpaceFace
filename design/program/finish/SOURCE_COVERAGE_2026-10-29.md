# Source coverage index — 2026-10-29

This index records Finish source packets U001–U072 and links the detailed local notes where they
exist. `COMPLETE` means the listed source coverage was completed or explicitly reused; it does not
mean gameplay acceptance. `IN PROGRESS` means the packet remains with its active owner and is not
being duplicated here. The packet snapshot and detailed scratch notes are under ignored
`.devshots/finish/integration-2026-10-29/`; they are local-only and unavailable to cloud agents.

## Packet matrix

| Packets | Status | Full-read / reuse record | Material result or coverage limitation |
|---|---|---|---|
| U001–U006 | COMPLETE per earlier integration record | Packet membership is in the local `unassigned-packets.json`. Covered `src/ui/units.js`, `src/ui/sim/missionRecap.js`, `anvilWork.js`, `asteroidFormationModel.js`, `asteroidFormations.js`, `asteroidMillArena.js`, `asteroidSites.js` (U002–003), `blindWelderRuntime.js`, `borrowedSun.js`, `borrowedVoice.js`, `bracket.js`, `ceresWorkfleet.js`, `ceresWorkfleetRecovery.js`, `choirReliefBerth.js`, `cinderSluiceArena.js`, `coldburnRey.js`, `contractClauses.js`, `crSituationKit.js`, `cryoDriftArena.js`, `custodyConsequences.js`, `dockCollar.js`, and `dockingCorridor.js`. | No standalone U001–U006 note was present in the currently inventoried scratch directory; completion is carried forward from the earlier integration record, so per-file findings are not reconstructed here. This is a reporting limitation, not a claim of unexamined production risk. |
| U007–U008 | COMPLETE | Full source notes: `world/U007-U008-coverage.md`; later complete reuse is recorded in U037–U048. | Focused world/lifecycle repairs and checks are described in the note. No route-wide acceptance follows from them. |
| U009 | COMPLETE per earlier integration record | Covered in the prior integration source pass; packet assignment is listed in the local packet snapshot. | No separate note was present in the current note inventory. |
| U010–U011 | COMPLETE | `world/U010-U011-coverage.md`. | Full packet source coverage and direct scoped findings are recorded there. |
| U012–U014 | COMPLETE | `world/U012-U014-coverage.md`. | Full packet source coverage and fixes are recorded there. |
| U015–U016 | COMPLETE | `world/U015-U016-coverage.md`. | Full packet source coverage is recorded there. |
| U017–U018 | COMPLETE | `U017-U018-COVERAGE.md`; reused `spawnBudget.js` and `scavengerOccupationSwitch.js` from `world/coverage-faction-presence-occupation-spawn-budget.md`. | Full reads include `rescuedWorkerReturn`, `routePlanner`, `ruud`, `sableVenn`, `secondRinse`, `shepherd12`, `shipjack`, `signatureAdapters`, `solstice`, `struckBellRuntime`, and `sweepWindowRuntime`. Shipjack spawn rejection/retry was fixed; `node --test test/black-flag-runtime.test.mjs` passed 10/10. |
| U019–U020 | COMPLETE | `U019-U020-combat-runtime-coverage.md`; reused Lane 2 M09 for `tensionDirector.js` and its model. | Full reads or explicit prior-review reuse are itemized. Tare, travel-lane recycled identity, and Two Ships retirement fixes are published in `88474f40e9d`; this packet note does not claim every associated suite was rerun. |
| U021–U023 | COMPLETE | `world/U021-U023-coverage.md`. | Full source review includes Spectrum, mobile bridge/catalog/instrument/touch reducer/surface/model and mobile styles/view/wheel. Fixed touch deactivation cleanup, a CSS comment boundary, stale Spectrum distance expectation, and wired the sim loot audit to the real authored unique catalog. Focused suites and actual CLI result are listed in the note; phone browser QA remains open. |
| U024–U025 | COMPLETE | `world/U024-U025-coverage.md`. Reused the earlier full `runtimeFingerprint.js` review. | Runtime, cargo, onboarding, observability, nemesis, and shutdown owners are itemized. Fixed bounded Map/Set observability copying and VFX root teardown; root-owned manifest/factory/registry diffs were read-only. Combined focused checks: 199 passed. |
| U026–U027 | COMPLETE | `U026-U027-coverage.md`; reused the completed nemesis `encounterHost.js` review. | Full listed nemesis, Orbital Gallery, Shipbreaking Yard, and Salvage Tender owners are summarized; no changes from this packet. |
| U028–U030 | COMPLETE | `U028-U030-coverage.md`; reused U026/U027 encounter/materialization coverage. | Salvage Tender/Outfits, Rig Workshop, Industrial Disasters, and Adventure authored data owners were read. No concrete defect established; no code change or test run was needed. |
| U031–U036 | COMPLETE | `U031-U036-coverage.md`. | Full packet spans ecology/fauna, Anvil identities, arenas/arsenal, audio, Black Flag, blueprints and collision-proxy manifest. Fixed authored audio transient/sub-bass level shape and Press Camp's missing tether-broken consequence route; focused checks passed as recorded. |
| U037–U042 | COMPLETE | First section of `U037-U048-read-progress.md`; reused `environmentalMachinery.js` from U007–U008. | All current listed modules read; fixed `hazardHints` listener teardown and its disposal regression. Dirty `combatLabSetups.js` was read-only. |
| U043–U048 | COMPLETE | Remaining sections of `U037-U048-read-progress.md`; `precursorMachines.js` read under U045 and reused for U046. | Current module ownership and explicit dirty-path handling are recorded in the note. Any unresolved PalletJack AI/player route remains with its active feature owner and is not classified here as accepted. |
| U049–U054 | COMPLETE | `U049-U054-source-coverage.md`; 58 paths / 16,386 manifest lines. `swarmBrood.js` full-read reuse from Lane 2 M72 is explicitly identified. | No additional defect from the source pass; focused ladder, unlock metadata, and weapon-aim checks are itemized. This is source coverage, not closure of the original Swarm route FAIL or first-ten/boss acceptance. |
| U055–U060 | COMPLETE | `U055-U060-read-progress.md`; details include grouped adjacent slices for large source files. | Full reads recorded. U060 fixed mutability of grouped Atlas query arrays; `node --test test/atlas-index.test.mjs` passed 22/22. |
| U061–U066 | COMPLETE | `world/coverage-U061.md` through `coverage-U066.md`, with earlier full-read reuse called out inside individual notes. | Full source coverage is recorded. Some suites were not rerun unchanged; `registry.js` and other dirty owner hooks were read-only and remain with the owner. This packet status does not imply every unrelated admission matrix or route was revalidated. |
| U067–U072 | COMPLETE | `U067-U072-coverage.md`. | Full current files are itemized there; U068–U069 include `sg02DynamicBodyOwner.js`, U070 includes sim transport/worker and spatial hash, U071 includes spatial query/fields/Massline controller, U072 covers Chronicler. Fixed the no-MessageChannel queue shim's reference-sharing bug; `node scripts/check-sim-transport.mjs` passed including transport digest and payload-isolation checks. Concurrent `runReset.js` and `fieldKernel.js` changes were preserved. |

## Current source-reachability orphan census

Read-only result from `node scripts/check-src-reachability.mjs`: 2,758 JavaScript source files;
2,640 reachable from `src/main.js`; 118 import-graph orphans, of which 45 are under declared
tooling roots and 22 are under the ratcheted `src/render/`, `src/systems/`, and `src/ui/` roots.
The ratchet passes with 22 documented exceptions, no new orphan, and no stale exception. The
remaining 51 are not a third exemption class: the script reports them as orphans but neither
`toolingRoots` nor `ratchetRoots` classifies or gates their directories. Thus they have no individual
ratchet rationale. Twenty-five appear in the completed U packet notes below; 26 are outside the
current U001–U072 packet list. This checker follows static relative imports and dynamic literal
imports from `src/main.js` only, so a file can still be reached through another route or worker URL.

The 22 ratcheted entries fall into these current-use categories, using the checker baseline's reasons
and already completed source notes (not a new full-source review):

- **Reachable through non-JS entrypoints:** `src/ui/bootEntry.js`, `bootStartupFailure.js`,
  `introSignalRemixBoot.js`, and `introSignalRemix.js` are loaded from the HTML boot path;
  `src/render/glbPrepassWorker.js` and `renderPackageDigestWorker.js` are constructed through worker
  URLs. The import-graph checker cannot see these edges, so they are not evidence of absent UI/work.
- **Build, lab, or deferred performance code:** `src/render/graphicsLab.js`,
  `thruster/textures/{encodePng,sample}.js`, `src/ui/kit/lab.js`,
  `src/render/{backendDecision,webgpuPresent,batchedInstanceRenderer,presentPhaseTimers}.js` are
  developer/build tools or deferred/held performance work. Do not wire them to the default route
  merely to clear the ratchet.
- **Staged, optional, or dormant presentation:** `src/ui/commandDeckRefit.js`,
  `src/ui/virtualList.js`, `src/render/reactiveMatter/pass.js`,
  `src/render/wreckCourt/present.js`, `src/render/thimbleDoorVisuals.js`,
  `src/ui/orrery/{flightInstruments,flightPreview}.js`, and
  `src/systems/signatureAdapters.js`. `wreckCourt` already has a live in-world path; the orphan is a
  dedicated viewer composer. Reactive-matter marker rendering is optional because authored release
  models present cargo. Thimble door visuals have no active gameplay owner. The ORRERY flight
  cluster is distinct from `src/ui/views/flightInstruments.js`, which the live HUD imports. The
  `signatureAdapters.js` baseline explanation is stale: `src/systems/siteSignatureModel.js` says
  that file contains audio cue signatures, not adapters for the site signature model.

The census alone does not establish a default-route defect. One actionable map gap was confirmed:
`stationGlyphs.js` defined seven authored glyph/label pairs, while the overview displayed one generic
station marker. `galaxyMap.js` now carries live and static `stationTypeId` values into the existing
markers and displays the authored glyph and uppercase label. The focused map contract passes for all
seven types and the unknown-type fallback; `check-station-glyphs.mjs` and the updated reachability
check pass. The seeded chart fixture now carries canonical IDs for its market and military stations,
plus an unknown `pirate_camp` station. A scrolled 1280×720 frame visibly shows `⬢ MARKET`,
`⛨ MILITARY`, and `▪ STATION` together in the existing marker list; all rows fit in the inspector.
The key lists the seven known symbols and the other-station fallback. The ORRERY flight cluster and `virtualList`
remain lower-confidence candidates pending the active UI/performance owners' current need; do not
wire modules solely to change the source count.

For the additional 51 outside the ratchet: 25 were source-covered in these packets—U026
(`gallery/orbital`), U029 (`industrialDisasters/manifestAdapter`), U032 (`asteroidMotion`),
U037 (`contentFactoryExamples`), U041 (`intentGlyphs`), U044 (`oneOffCast`), U049
(`silhouetteRoles`, `starterBuilds`), U053 (`tabletopPictureRecipes`), U054 (`tethysSwitchyard`,
`thimbleDoorBody`), U055 (`waveRecipeSimulator`), U056 (reactive-matter data), U059 (Causal Foundry
evaluators/presentation), U060 (`atlasProxy`, `authoritativeSimStep`), and U070 (simulation worker
transport). Their roles vary: the notes include supporting code, authored data, opt-in components,
and features whose entry is outside the `src/main.js` import graph. For example, U026 records the
Orbital Gallery as a live sim/UI feature even though some helper modules are not main-graph imports.
These source notes supply context, but they do not convert the import graph into a route test.

The remaining 26 exact paths and their nearest purpose/consumer are:

| Path | Classification from existing reports or full read | Nearest live consumer / replacement |
|---|---|---|
| `src/ai/counterplay/index.js` | M03: re-export barrel, not a system. | `tacticalAI` consumes counterplay through leaf modules; no player feature is hidden in the barrel. |
| `src/ai/index.js` | M05: SG-06 re-export barrel. | `scripts/check-sg06-ai.mjs` uses the barrel; runtime imports specific owners. |
| `src/combat/index.js` | M16: re-export barrel, not a system. | Production imports `kernel.js` and leaf modules. |
| `src/combat/masslineInvariants.js` | M18: frozen vocabulary/calibration guard. | Imported by its test only; no flight-tick caller. |
| `src/combat/masslineOrbitTelemetry.js` | M18: pure observation helper. | Lab sampler and `masslineControlLab.mjs`; no production flight-tick caller. |
| `src/audio/replayAudioWorklet.js` | Audio M07: a real player feature, loaded by `replayAudioTape.js` after gesture through `audioWorklet.addModule(new URL(...))`; thus the main import graph misses its URL edge. | Clip recording. M07 separately flags per-render-quantum buffer copying while recording as a performance cost, not a missing route. |
| `src/careers/origins/haulerOriginSystem.js` | Careers M01/M02: dead duplicate owner, superseded by the central career system. | `careerOrigins` is the registered/save owner per `src/careers/AGENTS.md`; do not register the twin. |
| `src/core/wholeSimBrowserWorker.js` | Lane 1 M052 full-file packet read: alternate browser worker entrypoint. | `simLaneMain.js` constructs it through a worker URL; not a main-thread static import. |
| `src/data/encounters/capital-boss/validate.js` | Full 154-line read in this pass: pure authored encounter validator. | Capital score contract and Gold Colossi tests call it; runtime encounter execution is elsewhere. |
| `src/data/factionPaletteClaims.js` | Lane 3 data M07: validator fixture, not a runtime palette table. | `scripts/check-faction-kit.mjs` and tests consume it. |
| `src/data/livedWorld/roster.js` | Full two-line read: generated vignette count only. | Written by `build-lived-vignettes.mjs`; individual `livedVignette` records live in encounter data. |
| `src/localization/fiveLocales.js` | Full 23-line read: compatibility facade for catalog helpers. | Older tests/tools use it; the live localization runtime consumes `pipeline.js` directly. |
| `src/localization/layoutSweep.js` | Localization M02: compatibility re-export with no importer. | Its canonical implementation remains `layout.js` and `runtime.js`; not a player screen. |
| `src/matter/reactive/index.js` | M25: library barrel; not a system. | Active `reactiveMatter` owner imports leaf modules. |
| `src/matter/reactive/inventory.js` | M25: frozen writer/ownership notes. | Imported only by that barrel. |
| `src/matter/reactive/liveSession.js` | M25: async live-body lab harness. | Tests import it; not on the player/worker tick. |
| `src/presentation/cueRecipesSignatures.js` | Full 325-line read: additive pure signature recipe data/helpers; header says future adapters and leaves shipped SG-08 recipes untouched. | `signatureAdapters.js` and focused checker scripts use it; no shipped presentation/audio runtime imports the adapter chain. |
| `src/response/mercyService/index.js` | Full 19-line read: public API re-export surface; it does not register a system. | Tests import the barrel; live registry/factory directly use `live.js`. |
| `src/sim/titleAttract.js` | Lane 2 M26: bake-only attract-world construction. | `scripts/bake-title-attract.mjs` and tests use it; the menu plays baked tape data via `titleAttractStage.js`. |
| `src/sports/kineticLeague/gallery.js` | Lane 2 M27: Node PNG baker for schematic arena images. | Tests call it; not part of the live game tick. |
| `src/sports/kineticLeague/index.js` | Lane 2 M27: public barrel, not the registered system path. | Tests and `play.mjs` import it; production registry uses `system.js`. |
| `src/sports/kineticLeague/workerEntry.js` | Lane 2 M27: Node `worker_threads` exhibit entry. | Kinetic League tests spawn it; not the browser simulation worker. The live league system is registered. |
| `src/story/beatStandard.js` | Lane 3 story M01: Node filesystem authoring checker. Fixed the missing archive receipt path and string-array choice-menu false negative. | Story validation only; no sim-loop caller. |
| `src/story/factionRegisters.js` | Lane 3 story M01: checker-side bark scoring. Fixed tell/forbidden matching to respect phrase boundaries. | Not called from the sim, HUD, or bark player; live story owners remain elsewhere. |
| `src/world/poseTable.js` | World M04 and U062: live tick query/read model. | U062 records actual same-tick world, combat, and mining readers; it is not a missing feature just because the main-page graph omits that edge. |
| `src/data/swarmFortifyView.js` | Full 42-line read: bounded presentation DTO adapter. | `scripts/lib/simEventBridge.mjs` uses it for the route/probe event bridge; the production paused screen has its own runtime presentation path. |

Six modules without final full-read findings in the earlier reports were read here: the capital
validator, lived-world count, station glyph table, five-locale facade, 325-line audio-signature
catalog, and Mercy Service barrel. The station glyph table was wired to the map in this pass and is
now reachable. No unrelated owner files were changed. `borrowedSun.js` is
currently imported by both the main registry and node factory and is not an orphan in this census.

The initial 26-path gap is now classified in
[`uncovered-orphan-coverage.md`](../../../.devshots/finish/integration-2026-10-29/uncovered-orphan-coverage.md).
It reuses the named U/lane reports, classifies all 26 without adding default-route wiring for
import-count purposes, and records the two checker fixes. The focused beat corpus check also
exposes separate existing `47a-first-blood.beat.json` method/citation drift, recorded in that note;
its authored content was not changed by this coverage pass.

## Acceptance boundary

This matrix is a source-coverage index, not a certification checklist. Current player-route outcomes,
including FAIL and INCOMPLETE results, are in
[INTEGRATION_COVERAGE.md](./INTEGRATION_COVERAGE.md) and the active lane boards. No source packet,
test count, or report closes the remaining Foundry first-ten/boss journey, Swarm gate, readability,
performance, or final build-map work by itself.
