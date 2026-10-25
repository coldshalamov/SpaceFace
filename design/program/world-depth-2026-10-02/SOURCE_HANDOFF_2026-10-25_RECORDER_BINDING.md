<!-- LIFETIME: DURABLE -->
# Last Shift recorder: source and asset handoff
Updated: 25 October 2026, 08:05 UTC.

This is a source-only checkpoint. All twelve goals in [OPEN_GOALS.md](OPEN_GOALS.md) remain OPEN. It preserves the [implementation roster](IMPLEMENTATION.md), [original twenty concepts](TWENTY_CONCEPT_MAP.json) and existing build-map scope; it is not a new queue or acceptance declaration. Prior [recovery guidance](SOURCE_HANDOFF_2026-10-25_RECOVERY_GUIDANCE.md) and its original attempts remain intact.

Current source checkpoint: the current source and asset boundary below. Earlier binding and conversation checkpoints remain historical evidence.

## Verified recorder-binding publication
- Open draft [PR602](https://github.com/coldshalamov/SpaceFace/pull/602).
- Commit: `07c609f5643c0ad2f1bc59ff0b4da8175206e5b1`.
- Tree: `88f72d802f967377b1a6a5d46b30c1f39ad616ec`.
- Public parents: `07d6980fbd77e557b511177ea8cd0bbf88d4fb1d` and `690e2dba9df3290be3fb7d746bbce116f05092a8`.
- Commit, tree and feature-branch ref were independently read back. No merge into master or deployment.
- The qualified baseline is 690e2dba. Later upstream changes were checked for path overlap before publication, not silently incorporated or declared tested.
- Reconciliation preserves upstream 249 initialization / 195 update manifest entries and existing clocks. Only the three intended main-owned narrative HUD capability flags change; existing package scripts and upstream asset rows are preserved.

## What changed for the player
The same original Last Shift recorder now has a stable neutral instrument-case model instead of a generic hash-selected wreck presentation. The case has a visible tow eye and cyan status notch. This reuses the existing Thimble recorder design and adds **zero** distinct model designs.

The strict selector checks the original persistence owner, site, body key, clue, type, radius and mass. It creates a fresh visual boundary before generic wreck selection. It does not replace the simulation body, add cargo, alter mass/physics/rewards, or grant receipt/custody. Save/sector warm-up uses a decode-only prop stub for the same package URL and pod slot, not a spawned custody actor. Destroyed, salvaged or returned recorder states omit that warm-up stub.

The original recorder retains radius 5 and mass 5. The model fit is 4.4: decoded planar XZ radius 4.855893 fits within the existing planar radius 5 envelope. This is not full-3D sphere containment or exact mesh/collider parity. The existing generic wreck runway may also prewarm a redundant generic wreck; no cold-decode-free or performance-improvement claim is made.

## Exact model and binding identities
- Existing source: `assets/ships/parts/wholeships/thimble_recorder.glb`, Git blob `85c433f78eafc8380b2efea7f70615585572797f`.
- Release: `assets/ships/release/parts/wholeships/thimble_recorder.glb`, blob `ecd8a8d130a5064aea06f87c7f099abf64f01e62`, 339968 bytes, SHA256 `5ca41debe7cc66efd0df473905a2032c398f9186c1a35fa54671a3859b43a8ff`.
- Runtime: `assets/ships/release/render-packages/thimble-recorder/render.glb`, blob `cda03427423c7683ba73b66a9aceb2edf57f92f7`, 383280 bytes, SHA256 `0b802d1c392034a320563a0bc92e8a793f26340cfa64bf65d7e0456ab92d1938`.
- Metadata: same package directory, `render-package.json`, blob `aabdde82307e0710e76c04288442e895fae1f4a7`, 22346 bytes, SHA256 `35424ec04a83d8e724e13f1c0ef82908dce667373ec0db027662e78e7020c6a3`.
- `src/render/visualOverrides.js`: `2b1d26ad73ba775c6c46f3265f91e5dc358663fa`.
- `src/render/saveEnvelopeSectorWarm.js`: `dbf798038d490f02f2dd9bf8f19a7f528bb1dd9f`.
- `test/last-shift-recorder-visual.test.mjs`: `1d66145da275c196b23f115a61b8975dcf40444c`.
- Single appended rows in parts/release/pilots/runtime manifests preserve existing Haumea and Phoebe entries. Metadata was resealed with the exact public contract against the updated pilots manifest; this later reseal is not a fresh geometry compilation.

## Local qualification and limits
These are separate focused local checks on the exact 690e-based candidate, not aggregate or whole-game acceptance:
- Recorder runtime: 4/4, natural exit 0. Actual compiled Meshopt geometry, production selector/warm/loader/admission/residency, pending and committed XZ fit, orphan and epoch handling. GPU KTX2 image decoding was intentionally omitted; this is not a browser or pixel test.
- Authoritative manifest: 16/16, natural exit 0. Real browser and Node factories materialized; current 249/ 195 IDs/clocks and the three main-owned narrative adapters checked.
- Worker integration: 26/26, natural exit 0.
- Recovery guidance: 11/11, natural exit 0 on the same exact source graph. Earlier 10/11 attempts lacked pinned public harness helpers or dynamic-import blobs before the affected case. The exact missing sources were restored; no production changes forced the pass. Those failed attempts are preserved separately.
- The four leaves total 57 passing cases, but remain separate scoped checks, not an aggregate suite or whole-game acceptance.
- Independent source, append-only registry, metadata-contract and package-alias reviews passed.
- A new actual compiled-geometry preview was inspected and shown. It omits textures, normal/AO maps, PBR and runtime lighting.

## State separation
- Exported: release/runtime bytes verified and published.
- Reviewed: source/registry contracts and geometry preview reviewed, with limits above.
- Published: source, compiled models, metadata and tests are in the verified candidate Git commit.
- Integrated: binding and warm-up are implemented on the draft candidate branch; master integration is not claimed.
- Accepted: NO. Live game-camera quality, ordinary arrival, full Save/Continue experience, target-device performance and the complete physical recorder-return route remain open.

## Resume without duplicating owners
The project lead coordinates the current Last Shift source, package, review and qualification owners. Preserve their exact paths and the canonical foreign-dirty checkout. Work only in the assistant's own environment. Do not create or resume external execution threads, fetch missing local promisor objects, or run `test/anvil-receiver-delivery.test.mjs`.

First verify PR602/ref and current master. If the PR merged, reconcile only unlanded work onto current master and create a new draft increment; do not overwrite newer changes. The focused recorder command is `npm run check:render:last-shift-recorder`. Re-run the manifest and worker leaves on any changed source graph, keeping test counts scoped. The reason-specific return-refusal unit described in the original checkpoint is now implemented and published; see the follow-on below. Continue the original-recorder physical return and connected Ceres consequence inspection without duplicating existing Helios acknowledgement. Do not replace original bodies or seed evidence/custody to manufacture acceptance.

Existing held operations remain held: the 847KB partsLibrary upload, distinct fairlead helper/tests and census-source uploads, live-browser prerequisite and older asset-specific holds. This recorder publication does not authorize their retry or substitute routes. No optional routine engineering choice needs user input; final acceptance remains required.

## Recorder return feedback: published follow-on (25 October 2026, 04:49 UTC)
- Current candidate commit: `bb43ba003abd5e1dc8788b67091a8336e8a36a22`; tree `a78dcd32c35fa12f02e186d3cda91bd1e084080a`; sole parent `07c609f5643c0ad2f1bc59ff0b4da8175206e5b1`. The prior recorder binding and model identities above remain unchanged.
- Exactly three changed paths: `src/systems/lastShift.js`, blob `46c79d201c30ba8d8b1b30cd17542a28c2e6ef15`; `test/last-shift-return-feedback.test.mjs`, blob `e9d76b67683e2471032a256b0db5f4df64016870`; `package.json`, blob `0748b80de84f1e2be571e6afd0e888f37d256c58`. The package change appends the new test to the existing narrative-worker check only.
- Narrow feedback is implemented and published on the draft candidate: restoration, already returned, unavailable or terminal recorder, berth range, missing tow, pending native custody, changed custody, refused detach and in-progress handoff now receive truthful, distinct advice. Unknown reasons use a safe fallback. Restoration is no longer mislabeled as an already completed return.
- Final local qualification: 13/13 new feedback tests and 19/19 existing tests, natural exit 0, against the exact 07c source graph plus these changes. The earlier 13-case attempt using the older manifest is superseded; failed intake attempts remain preserved. No production change forced a pass. These scoped checks are not aggregate, live-play or full acceptance.
- The narrow feedback unit is complete as source implementation/publication, not as a completed game goal. All twelve goals remain OPEN. Ordinary physical return, live camera, performance, master integration and final acceptance remain unfinished.
- Next connected increment is Ceres local-consequence inspection. Doss already acknowledges the archive at Helios; do not duplicate that acknowledgement or introduce a second counter. Ceres bar hooks are under ownership review, not implemented. Continue original-recorder physical return and ordinary return/Save/Continue qualification without replacing bodies or seeding custody.
- Existing publication and browser holds remain unchanged. No held payload, CI result export, PR-body change, merge or deployment is included.

## Ceres filed-report conversation: published follow-on (25 October 2026, 05:03 UTC)
- Current candidate commit: `b51c850dd51bcedbb0a2ae4dc9cf8a6d2c892634`; tree `cbcc42837e44d1660aab097815e218020d3d3e0a`; sole parent `bb43ba003abd5e1dc8788b67091a8336e8a36a22`. Draft PR602 remains open. Prior recorder assets, binding and return feedback remain preserved.
- Exactly four changed paths: `src/data/lastShift.js`, blob `b0b3b7878c51e6f5fe87cd7a801d56083e2cf9cb`; `src/ui/station/barContacts.js`, blob `176cd540b2b39440fc29717aa2d97e6072feb181`; `test/last-shift-local-report.test.mjs`, blob `abb5da087d9697530af25672ea80ac76bfce6aff`; `package.json`, blob `45445b2ce30d00fd379f97d7ddcd4e767dd798cc`. The package change appends the new local-report test to the existing narrative-worker check.
- After a valid explicit archive filing, the existing Ceres Refinery host offers an optional conversation about that filed report. First arrival and unfiled discovery do not announce or unlock a public finding. Existing host identity, greetings, local work, rumors and choices are preserved; Helios/Doss acknowledgement is not duplicated.
- The conversation retains the authored partial/full certainty of the last filed account. Newly read but unfiled clues and later physical return do not silently upgrade it. Physical return is validated separately and distinguishes this refinery from another receiving archive. The presenter grants no evidence, receipt, custody, cargo, reward or completion.
- Final focused local qualification: 13/13 new local-report tests and 19/19 existing tests passed, natural exit 0, on the exact bb43 source graph plus these changes; pinned dependency maps had zero mismatches. The initial empty-pool fixture assumption was corrected to the existing restore normalization. A malformed-array crash was fixed, and the overstrict ordering guard was relaxed for otherwise valid legacy receipts. Earlier attempts remain preserved. This is not an aggregate suite, live-play or whole-sector acceptance.
- Repeated conversation, elapsed simulation time, configured revisit/contact regeneration and actual-owner serialized restoration retain the filed report and independently validated physical-return status without new rewards. These are bounded local checks, not a personally piloted full Save/Continue route.
- Integrated on the draft candidate and published: YES. Merged into master or accepted: NO. The existing bar screen's 1–3 hint limitation remains owned by PR544; this increment does not change `screens/bar.js` or establish live UI acceptance.
- Next: qualify the ordinary original-recorder physical return and revisit/Save/Continue experience, including discoverability of the optional Ceres report through the existing bar UI. Preserve active UI ownership and all held operations. All twelve goals remain OPEN.

Sector-register delta: this extends the [existing Ceres sector account](https://github.com/coldshalamov/SpaceFace/blob/ca676244557c11ab2769087f85f0afb077527547/design/program/world-depth-2026-10-02/SECTOR_EXPERIENCE_REGISTER_2026-10-21.md), whose historical register blob `f1f3c139542cf5aa0ddfbeda369aafa503db1264` remains unchanged. This is an evidence append, not an edit to that register or a new plan/queue. Routing remains original SF20-18 / P03 wreck evidence and adjacent P07 station life. Crews want to understand the tow lanes; no new safety guarantee, history, reputation or economy is invented. One/two-source filings retain uncertainty; the authored three-source account supports deliberate cargo release and rejects the unsupported pirate-strike rumor. A stale selection revalidates the current receipt. The account remains until an actual new filing changes it; elapsed time alone creates no consequence. No model or placement changes are included. Full-sector acceptance remains open.

At the Ceres checkpoint, Borrowed Sun's dynamic station/faction/context mismatch was under reproduction only. The published follow-on below supersedes that source status; ordinary recorder-return and Ceres acceptance remain open.

## Borrowed Sun current-berth context: published follow-on (25 October 2026, 05:19 UTC)
- Current candidate commit: `f563fb7cf943523f3f496b5245e1cbce91dcce98`; tree `37b926c084c77255e5e04fcdeb2e0488643e22d2`; sole parent `b51c850dd51bcedbb0a2ae4dc9cf8a6d2c892634`. Prior recorder and Ceres increments remain preserved.
- Exactly three changed paths: `src/ui/station/barContacts.js`, blob `b6a0d5fda5576364bbcaac3727b21e4468ab9326`; `test/borrowed-sun-bar-context.test.mjs`, blob `490bf9d7b7b050ab25a13d954bc905a60df40b15`; `package.json`, blob `b99817996e2f9e0a63584182202da04fe239059b`.
- Actual owner initialization reproduced a Tethys/MTS Borrowed Sun projection generating an SCN host through the static fallback. A read-only, carrier-only resolver now uses the single current owner projection in `state.content.sectors` for faction and local conversation, survey, mining, hazard, repair, festival and route context. Missing or ambiguous projections fail closed.
- Static catalog stations, generated names/IDs, existing contact memories, Nemi's owner/prompt and service lifecycle remain unchanged. Projection metadata is not market-open or native-custody authority: arrival, fold, lost and close-pending configurations still deny service without a native body.
- Final separate local checks: 9 new Borrowed Sun cases, 13 Ceres cases and 7 faction regressions passed against the exact b51 source graph plus these changes, with zero pinned module-map mismatches. Configured berth movement, actual-owner deserialize/afterContinue and preserved visit memory were exercised. These are not ordinary flown docking, full-game Save/Continue, live visual or performance acceptance.
- Sector evidence delta: original SF20-12 / P07 visiting-station life now reads the carrier's actual configured Tethys/Ceres berth rather than fallback Helios/SCN context. Recurring generated contact reads follow that current projection without granting service access. This extends the [unchanged historical sector register](https://github.com/coldshalamov/SpaceFace/blob/ca676244557c11ab2769087f85f0afb077527547/design/program/world-depth-2026-10-02/SECTOR_EXPERIENCE_REGISTER_2026-10-21.md), blob `f1f3c139542cf5aa0ddfbeda369aafa503db1264`; that register is not edited or republished. No new plan/queue, model, placement, economy or service permission is introduced.
- Implemented and published on the draft candidate: YES. Master integration and acceptance: NO. All twelve goals remain OPEN. Next: qualify ordinary current-berth contact comprehension, access gating and revisit/Continue behavior while preserving Nemi/service ownership; original-recorder physical return and Ceres acceptance remain open. Existing UI, browser and publication holds are unchanged.

## Current source and asset boundary — 25 October 2026, 08:05 UTC

This checkpoint supersedes earlier next-operation statements, not their source evidence or acceptance limits. All twelve outcomes remain OPEN; the original twenty-concept and build-map scope is unchanged.

### Phoebe fresh-spawn repair: published source
- Separate open draft [PR604](https://github.com/coldshalamov/SpaceFace/pull/604), branch `fix/phoebe-tender-spawn-20261025`.
- Verified commit `bd55ec83f545229aec2482f2f1e58e69c7559462`, tree `fd5156471f588594e39ccddcc298e0b2948fac6c`, sole public parent `8491f7ae7462b61bd6cb34c88fd3453c0c382e5e`. All three complete remote file contents and blob identities were read back.
- `src/data/sectorActivityPockets.js`, blob `1d7268d3810be9da5a6791b681b34aa3104ee992`: only the fresh shrine tender spawn changes from x=38 to x=94 at z=-1.2, with an explanatory comment. Existing route, duration, saved poses and other actors are unchanged.
- `test/phoebe-tender-spawn-clearance.test.mjs`, blob `c1c64e75221f1f3e5c51421774e76adcb8b6a69c`: configured production native-neighbor clearance and actual-owner Continue regression.
- `package.json`, blob `cdce3fff4f9f33852ee8ad9a9cbdeafc80b0b0d3`: appends that test to `check:traffic`; the separately owned `check:npc-jobs` is untouched.
- The qualified a42a control produced native overlap and contact; the candidate removed that configured first-tick overlap while retaining hull, record and job. Old-save pose and route retention were checked separately. The test passed in-process; a later isolated confirmation exited 137 with unknown cause. No subprocess, ordinary-flight, full-route or visual acceptance is claimed.
- Newer public-master changes and all open-PR heads were checked before publication; reviewed data/package bases were unchanged. Source publication does not complete Phoebe or the game.

### Borrowed Sun: unpublished integration and incomplete old export custody
- The current published context-only increment remains PR602 at `f563fb7cf943523f3f496b5245e1cbce91dcce98`. It does not activate the new carrier model or service lifecycle.
- Runtime, native transport and renderer changes remain unpublished. Bounded local qualification has exercised the encoded Save/Continue paid-return path, native RPC and receipt-only service initialization. Final correlated cancellation qualification is still pending; no new test totals are recorded here.
- These local checks are not an actual worker-thread/browser session, ordinary flight or accepted gameplay. The renderer shipping URL remains absent. Measured fallback/source hierarchy work does not establish compiled-package, GPU, animation or live-camera acceptance.
- Exact custody of the old RAM archive and old exported GLBs was lost. Only three unreferenced archive-segment Git objects exist; the fourth segment was denied. This is not a complete recoverable archive, published model package or activation. Do not retry or substitute an upload route without resolving the exact denial.
- A regenerated native Blender artifact is distinct: 699992 bytes, SHA256 `af9687dcfff6b6bebab8748b0226c80db39d7638c3ba772df7e8d6c5e919b99b`. A regenerated LOD0 is 2381304 bytes, SHA256 `ff8b6b30d3d7e3a52f8e529284b79196ce98e22ee81b3254a2e208c1f376a938`. Neither is the old LOD0 identity `6dc1d2d060b81b24e7f4bc8315f9231304012f90e51a375f8ca4ed033b107566`; regeneration is not recovery of the old bytes.
- Native authoring and export custody, source review, external preservation, Git publication, compiled release, integration and acceptance remain separate states. Regenerated LOD1/LOD2, final identity pinning and shipping qualification are next, not completed here.

### Owners and next executable work
The model owner preserves and qualifies regenerated exports; native transport and runtime owners finish correlated cancellation and consolidate the paid Continue path; renderer ownership remains scoped to the measured hierarchy and eventual verified shipping package. Publication and preservation owners reconcile exact source graphs before any new draft increment. Do not activate an unqualified URL, replace original bodies, fabricate custody or import another owner's unlanded branch.

Continue the permitted Phoebe focused command `npm run check:traffic` only on an actually materialized qualified graph. Preserve the excluded receiver test and all existing browser/asset/publication holds. The [immutable historical sector experience register](https://github.com/coldshalamov/SpaceFace/blob/ca676244557c11ab2769087f85f0afb077527547/design/program/world-depth-2026-10-02/SECTOR_EXPERIENCE_REGISTER_2026-10-21.md) remains unchanged; this source delta does not replay it. Ordinary recorder return, Ceres report discoverability, Borrowed Sun docking/service comprehension and sector-by-sector acceptance remain open. No merge or deployment.
