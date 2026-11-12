<!-- LIFETIME: DURABLE -->
# Build the mature SpaceFace, then produce the missing pieces

The owner asked on 2026-10-02 for a game-wide expansion design, then explicitly authorized
complete development through small commits after publishing and reviewing the plan. The target must not shrink to whatever today's models make easy. More characters,
ships, creatures, planets, structures and machinery are warranted when they complete the game's
physical, inhabited identity. A catalog that checks every category can still leave play empty.

This folder is design detail under the existing program, **not another task queue**. The build map
and FINISH_LANES retain ownership. The [implementation roster](IMPLEMENTATION.md) decomposes the
user-authorized feature set into finite deliveries on those owners. The initial plan commit changes
no gameplay or assets; subsequent production commits implement and verify the roster in the same
draft PR. Completion means the described features work, not that planning or the first district is
finished. Merging and deployment remain separate actions. Ordinary detail choices belong to the
implementing agent within the brief; do not ask the owner to approve every name, paint choice or prop.

## Read only what the task needs

For continued cloud groundwork and local professional expansion/review, start at
[REVIEW_SYSTEM](REVIEW_SYSTEM.md) and [REVIEW_LEDGER](REVIEW_LEDGER.json). The ledger tracks
individual deliverables and their commit/path provenance; logged work is not completed work.

| Need | Document | Existing owner |
|---|---|---|
| Implement the complete authorized feature set in small packets | [Implementation roster](IMPLEMENTATION.md) | Existing build-map/FINISH owners; one PR integration coordinator |
| Understand the mature experience and choose the next substantial addition | [Target](TARGET.md) | VISION/GDD; THE WORLD, THE HAND, THE FIGHT, THE LONG GAME |
| Identify genuinely new art families, states and their gameplay consumers | [Asset families](ASSET_FAMILIES.md) | GRAPHICS_PROGRAM/Forge with the selected gameplay owner |
| Work a concrete first expansion exemplar | [Stormshift](STORMSHIFT.md), then [Anvil integration](ANVIL_INTEGRATION.md) | THE WORLD; Anvil, traffic/jobs, cargo, current world-site authority |
| Develop another place without copying its neighbor | [District examples](DISTRICT_EXAMPLES.md) | Existing named place/sector owners; examples are not a second ordering |
| Fix incoherent entry, body response, camera or first-fight exposure | [Cohesion](COHESION.md) | Existing D5/D7/CV-GLASS, SFQ-B021/B025, PB-PIC-B, PQ-140 |
| Run repeated section development without losing its purpose | [INFERENCE §0.2](../INFERENCE_LANES.md#02-explicit-section-development-requests--continue-the-existing-area) | Existing FINISH_LANES + inference ledger |

## How the design becomes production

1. Select a **player experience** from TARGET, then one bounded complete slice under its existing
   owner. Anvil is the first worked expansion slice, not the limit of the expansion or a requirement that
   every future place be an industrial delivery job.
2. Trace the ordinary route and classify each required piece: shipped and suitable; present but
   unsuitable; built but not integrated; genuinely missing; unverified. Read live consumers and
   manifests before commissioning duplicates. Preserve useful work, but do not accept an unsuitable
   generic hull solely because producing the right ship is more work.
3. Put missing art and behavior in the same implementation brief: purpose, silhouette, working
   states, sockets, collision, material identity, persistence and actual receiving consumer.
   A model-only worker can deliver to that brief; the slice's integration owner remains responsible
   for making it appear and work in the game.
4. Build and integrate the slice. Share source kit, tooling and materials where useful; author
   genuinely different forms where the role demands them. The active scene's cost is the relevant
   capacity question, not how many files the asset library contains.
5. Verify the changed owners and one composed route. Batch shared route/performance checks after
   coherent landings instead of repeating a full suite for every small part. Separate functional,
   visual and target-device performance claims. Automated play can expose defects; it cannot
   certify human enjoyment or commercial success.
6. Record the completed slice and the next unresolved connection in the existing ledger/owner.
   Later sessions resume that place or experience with its context. A successful local repair
   never establishes a whole-domain A by itself.

## What this planning revision changes

Explicit requests to develop a section now bypass catalog-first repair selection. Bare INFERENCE
and explicit catalog requests retain their small-work route. Already-true or duplicate-status
bookkeeping is not a newly built production unit. No new command, schema, dispatcher or per-unit
paperwork is introduced.

The distinction matters in the audited snapshot: the catalog contained many open narrow assignments,
while the original complete-place instructions were available mainly after the catalog emptied or
when a domain was explicitly selected. Actual past work includes strong causal additions, such as
rescue-craft state transitions, as well as narrow repairs. The remedy preserves both kinds and gives
coherent section development an explicit continuation path.

## Evidence and freshness

Design grounded at `c488ecc10c23ad613dc35c61c04f124a3b77723a`; source facts must be rechecked before
implementation. Proposed ships, characters and situations are targets, not claims that assets already
exist. Current Swarm/alien canon and shipped mechanics outrank older speculative descriptions.

A local diagnostic proved Blender 4.3.2 CPU modeling, GLB export and a small rendered preview.
A real Forge transfer-arm rebuild subsequently passed, retaining its canonical sockets and identity.
Release/publication, live-game visual acceptance and target-GPU performance remain unproved. First
asset production must complete that pipeline before multiplying output. Keep the source/provenance and validate actual exported binaries;
a beautiful thumbnail with no gameplay consumer is not a completed expansion.

## Twenty-concept production amendment

The user-authorized [twenty-concept amendment](TWENTY_CONCEPT_AMENDMENT.md) adds all SF20-01–SF20-20 to these existing P00–P21 owners. It preserves the original source history, consolidates 125 proposed leaves into coherent delivery families, and strengthens visual acceptance without creating another queue or approving held decisions. Read it before commissioning overlapping characters, machinery or encounters.
