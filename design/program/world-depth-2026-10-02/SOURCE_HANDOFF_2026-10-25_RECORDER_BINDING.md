<!-- LIFETIME: DURABLE -->
# Last Shift recorder: source and asset handoff
Updated: 25 October 2026, 04:38 UTC.

This is a source-only checkpoint. All twelve goals in [OPEN_GOALS.md](OPEN_GOALS.md) remain OPEN. It preserves the [implementation roster](IMPLEMENTATION.md), [original twenty concepts](TWENTY_CONCEPT_MAP.json) and existing build-map scope; it is not a new queue or acceptance declaration. Prior [recovery guidance](SOURCE_HANDOFF_2026-10-25_RECOVERY_GUIDANCE.md) and its original attempts remain intact.

## Verified candidate publication
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

First verify PR602/ref and current master. If the PR merged, reconcile only unlanded work onto current master and create a new draft increment; do not overwrite newer changes. The focused recorder command is `npm run check:render:last-shift-recorder`. Re-run the manifest and worker leaves on any changed source graph, keeping test counts scoped. The next narrow source unit is reason-specific return-refusal feedback: native-pending, range, tow, custody, detach and already-returned outcomes currently collapse into misleading generic reeling advice. The Last Shift gameplay owner will implement and test truthful feedback without changing authority or physics. Continue the original-recorder physical return and connected Ceres consequences afterward. Do not replace original bodies or seed evidence/custody to manufacture acceptance.

Existing held operations remain held: the 847KB partsLibrary upload, distinct fairlead helper/tests and census-source uploads, live-browser prerequisite and older asset-specific holds. This recorder publication does not authorize their retry or substitute routes. No optional routine engineering choice needs user input; final acceptance remains required.
