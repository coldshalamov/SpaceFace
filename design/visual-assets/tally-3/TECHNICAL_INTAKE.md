# Tally-3: one honest claim, one physical crate

Read-only intake, 5 October 2026, 01:56 UTC. No implementation, claim-board edits, commits, uploads, or PR comments were made.

## Recommended next outcome

Build the original SF20-03 encounter at Ceres' existing Abandoned Driller, `zone_ceres_derelict` (sector-local centre 240, -1180; radius 420). One assessor serves the site. One finite authored crate carries a stable source/lot identity. Use Ceres Refinery (`station_ceres`) as the named receiver and destruction fallback. Do not join the active Second Measure machinery or disabled-hauler incident.

Approaching within 420 WU gives a short first greeting. Selecting the crate and explicitly inspecting/hailing opens its claim, cited evidence, actual value basis and destination. The player can:

- Return it: tow the same body to Tally's open cradle or Ceres Refinery, settle below 8 WU/s relative speed, and explicitly confirm recovery
- Investigate and contest: discover the site's actual authored release/manifest record, then submit that specific evidence against a stale claim; accepted correction makes the crate legitimate unclaimed salvage
- Take it without consent: see the theft warning before committing, retain a physically manipulable crate, and receive the real law/provenance consequence

“Disputed” is a claim condition, never an invisible movement lock. Approaching, scanning, or merely touching the receiver must not sell or confiscate anything. Ordinary unclaimed scrap keeps its current low-friction route. A return, corrected claim, theft or destroyed crate closes this finite source permanently; there is no respawn farm or appraisal reward.

The maker should author one concrete original-claim/release-record contradiction, with stable IDs and discoverable evidence, rather than invent a witness when the player chooses Contest. Both the original title and the correcting record must be inspectable. Initial missing/corrupt data must fail visibly, never become “unclaimed” by default.

## What exists, and what does not

The original dossier and map authorize this outcome; they do not implement it. `SF20-03` remains pending with no owner, inspection or completion. No Tally runtime, production asset, or test exists. Its original PNG was personally inspected: a long pale spine, unequal side trusses, ochre end caps, a large stern ring and an overhead cross/T read. It is a coarse reference, not shipping art.

The current owners provide useful pieces, with important limits:

- `src/systems/salvage.js`: owns the durable finite-source ledger and exposes `helpers.salvage.source`, `entityForPoint`, `claimSource`, `releaseSourceClaim`, `takeSource`, and `drainSource`. Its descriptor whitelist currently accepts only the Vesta source. `claimId` is a cutter/work claim; it is not a complete legal-title API. `disputedBy` currently records contested extraction, not adjudicated title
- `src/systems/claims.js`: player bases, construction and claim operations. Do not bolt crate title onto this unrelated owner merely because of its name
- `src/core/pickupCustody.js`: reads `cargoIdentity.ownerId`, salvor claims and freight custody. It does not settle ownership and deliberately does not block player contact pickup
- `src/systems/economy.js`: `applyFreightDelivery` has persistent exact-receipt dedupe but changes stock, not the player wallet. `economy:grantCredits` ignores receipt IDs. `applyNpcSalvageIntake` is Forge NPC intake and rejects Ceres; it must not be repurposed as player recovery
- `src/systems/cargo.js`: existing `addCargo`/pickup acceptance provides the actual accepted quantity. Physical delivery is not permission to independently write player cargo or credits
- `src/systems/provenanceLedger.js`: bounded causal history, not legal-title storage; no general ledger revision exists. `nextSeq` allocates chains and is not a safe revision for all mutations
- Scanner emits trusted `scan:pulse` with source, scanner ID, sequence and range. Current `scan:completed` has `targetId:null`. `scanReveal` additionally provides `scan:wreckInvestigated` and durable investigated evidence for supported existing wreck records. Tally must validate the actual selected source and discovered evidence, not assume the dossier's example API exists
- Existing recovery/traffic systems demonstrate custody and receipts but operate on disabled hulls and active Ceres incidents. They are not the crate encounter and should remain untouched

## Minimal implementation boundary

Prefer a Tally-specific helper hosted by the existing salvage owner. This reuses salvage's lifecycle and save entry without adding a registry system, generic dispatcher, queue, claim framework or new save root.

New maker paths:

- `src/data/tally3.js`: stable site/source/evidence IDs, dialogue, limits, declarative body/receiver facts
- `src/systems/tally3.js`: bounded assessor lifecycle, selection/hail/phase handling and calls into salvage; no resource ownership
- `src/systems/tally3Claims.js`: narrow owner-bound helper for this site's assessment, evidence revision, legal-title correction and delivery validation, called only by salvage
- `src/economy/tally3Settlement.js`: narrow economy-owned transaction helper, if needed for one receipt-idempotent return payment; no independent wallet
- `src/ui/tally3Prompt.js`: thin adapter to the existing `promptDeck`; status words/icons, evidence, consequence and explicit confirm; ordinary toast/receipt lane for results
- `src/render/tally3Visuals.js`: visual identity/pose adapter; only reads sim state
- `test/tally3-claims.test.mjs`, `test/tally3-settlement.test.mjs`, `test/tally3-lifecycle.test.mjs`, `test/tally3-normal-route.test.mjs`, `test/tally3-presentation.test.mjs`

Small joins in currently clean files, to be explicitly claimed before mutation:

- `src/systems/salvage.js`: lifecycle delegation, this exact source, helper publication, additive normalized `salvage.tally3` state and title fields on its source row
- `src/systems/economy.js`: invoke the bounded settlement helper through its own transaction path; store the durable identity before any payout and return accepted/rejected/duplicate results
- `src/systems/provenanceLedger.js`: consume named accepted assessment/transfer facts with stable source/incident IDs; no title duplication
- `src/ui/comms.js`: mount/update/destroy the Tally prompt adapter
- `src/data/contactHail.js` and, only if required, `src/systems/scanner.js`: minimal normal Hail/selection bridge. The existing contact-hail path currently targets shipped contact roles, so a new authored actor must actually be admitted
- `src/render/partsLibrary.js`: narrow authored-body/catalog binding, preserving current Latch, Mite and Ceres consumers

Serialized joins owned by the integration/presentation owner, not parallel maker edits: `src/render/authoredMotion.js`, `tools/blender/forge/fleet.json`, asset manifests, generated release/package/runtime maps, `REVIEW_LEDGER.json` and `EXECUTION_STATUS.md`. Do not edit active `src/save/saveSystem.js`, `src/combat/persistence.js`, native physics, `traffic.js`, `npcJobsRuntime.js`, world-site/sector/anchor files or Ceres source. Existing `sectorZones.js` can be read directly; this site needs no new sector anchor. Recheck exact paths and current diffs before any handoff: clean status is an observation, not an ownership claim.

## Ownership, transactions and Continue

The source owner keeps one durable title record: stable lot/source ID, claimant, evidence IDs, monotonically increasing claim revision and permanent terminal disposition. Tally's compact character memory holds the dossier's `met`, stable active-wreck reference, last observed evidence revision and last 32 local receipt IDs. Add explicit destroyed/hull state if required to prevent assessor resurrection. Do not duplicate title snapshots inside Tally memory. The 32-item display ring must never be the only replay protection.

Each offer binds source/lot, claimant, claim revision, evidence revision, disposition and receiver. Re-read all of these at confirmation; a changed claimant, expired offer, changed body life, wrong receiver, absent evidence, dead actor or excessive relative speed rejects without payment, removal or detachment. The owner validates the live crate in the receiver volume, not a submitted collision claim. Preserve its tether until acceptance. A duplicate accepted request returns the original receipt without paying, granting cargo or consuming another body.

Economic receipt acceptance and salvage terminal state must recover coherently if a save/re-entrant event occurs between them. Explicitly prove the ordering; a copied `receiptId` on `grantCredits` does not provide this guarantee. Legal keep/theft should use cargo's accepted quantity and preserve any physical remainder; sale remains the normal market transaction.

Use the ordinary persistent-entity save route for the real crate (`flags.persistent`) and a stable source binding. Current generic entity serialization retains ordinary data and supplies entity-ID remapping for combat attachments. Suppress fresh crate materialization while restoring; adopt the one restored body on `save:loaded`, with its exact pose/velocity and tether. No second world-record copy. This can avoid Save-owner edits, but actual native Continue must prove it before claiming success. If that route exposes a missing native contract, return the exact issue to its existing owner.

Do not accidentally tag a recoverable crate as generic jettisoned/manifest freight: `lawSecurity` currently reports theft on `tether:latched` for those types. Tally requires an explicit, lawful recovery-custody interpretation. Keep any adjustment narrowly bound to this source and route genuine theft through `lawSecurity.reportIncident`; do not fake witness acceptance or directly assign heat/reputation.

## Authored body and real consumer

Build `tools/blender/forge/ships/tally_3.py` with editable sources under `tools/blender/forge/source_assets/tally_3/`, and a versioned maker/reviewer handoff under `design/visual-assets/tally-3/`. A source-origin named-character asset can follow current Latch conventions: `assets/ships/parts/places/place_tally_3.glb`, matching compressed release, `assets/ships/motions/tally-3.motion.json`, and compiled `tally-3` render package. The integration owner serializes the exact fleet/manifest/package registration.

Keep the original long dark spine, pale slate panels, one ochre band, visibly unequal open trusses and large amber stern stamp on a solid U bracket. Make the V-shaped forward cradle visibly open. Improve the blockout's broad flat slab and coin-like end caps with layered housings, seated hinges, scan apertures and purposeful bevels. Three-value Forge material language; shared finishes/textures; no independent surface-noise system. Preserve the ring, unequal arms and open cradle in all LODs. Distinguish it decisively from Latch's three-paddle gantry and BRACKET's goal keeper.

Author-space target remains 22 × 18 × 6 m, +X nose/+Y port/+Z up. Measure the actual export and derive the runtime transform/collider from it; 20 WU radius and mass 180 are proposed targets, not evidence. One spine collider; instruments non-colliding; cradle is a sensor, never suction. Real body motion stays with physics. One nearby assessor must still request/release the existing spawn budget.

Assess 1.4 s; disputed asymmetric hold; 0.45 s stamp only after accepted settlement; 1.1 s withdrawal. Cancel obsolete gestures with their target/phase, preserve reduced-motion/flash behavior, and gate flavor through the shared voice arbiter with 90-second cooldown. Review actual top/chase/close and working poses in the shipping renderer. CPU decode, a Blender image and source checks cannot close the real-browser/art gate.

## Proof and handoff

Required new checks: the original five cases (no sale from tow; ten duplicate deliveries pay once; claimant change invalidates; tethered Continue agrees; dead assessor retains station fallback), plus full cargo, partial acceptance, receipt/source conflict, lost/destroyed crate, New Game, departure/return, actor death during confirm, save on the transaction tick, stale UI after target change, malformed evidence, replay after the local receipt ring fills, and ordinary ambient ownership interference.

Demonstrate the normal Ceres route using real selection/scan/hail/confirm and the same saved crate, then repeat after Continue. Keyboard/controller, muted audio, grayscale and reduced-motion routes must preserve the same facts. Use the existing focused salvage/cargo/law/provenance checks, baseline, save/schema and deterministic comparison checks appropriate to actual edits. Hardware performance remains the quiet-host program's job, not a new capture on this shared host.

Existing baseline checks run during this intake: 30/30 passed across `pq048-salvage-cutter-loop`, `salvage-claim-theft`, `econ-04-salvage-intake-receipt`, `scan-wreck-provenance`, and `d130-salvage-point-scan-bound`. This establishes those current seams only; no Tally implementation or gameplay acceptance is implied.

Use the existing maker → independent reviewer → corrective revision loop on the SF20-03 ledger item. Pin exact source, preserve failed attempts, distinguish source/asset/integration/functional/visual/performance evidence, and leave completion with the local primary reviewer. Do not revive superseded Playfield work or establish another review queue.

## Verified current state

- Local integration HEAD: `561c0435ed294496650c2b864adc93abfb4530da` (Pip/Spanner maker integration); substantial foreign dirty/untracked work remains
- PR 221: draft, open, head `6f4b153464585c7480d994af6f89103338790a3e`, mergeable false/dirty, checked through exact read-only GitHub REST GET
- Master: `df1af22e5a1f1b10d36cdab91473799b704dcd6a`
- Three PR comments; none claims Tally. Latest maker/reviewer comment: https://github.com/coldshalamov/SpaceFace/pull/221#issuecomment-5984244240
- `NOW.md` has only two stale legacy rows by its liveness checker. This does not revoke the parent's current Ceres/Save/presentation ownership instructions
- Publication/comments remain paused. No write was attempted or bypassed
- Referenced `assets/AGENTS.md`, `assets/ships/AGENTS.md` and `design/program/GRAPHICS_PROGRAM.md` are absent in this checkout; the present root/nested instructions, Forge and current graphics front door were read
