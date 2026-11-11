# Helios opening worksite: the cutter gives you room

## Player experience

An existing Helios starter cutter is a working neighbor, not a static tutorial marker. Fly across its live cutting segment and it powers down, tells you to clear your hull, and waits. Tow a separate rock, wreck, payload or ship through the segment and it waits for the actual tether and the tail of the load, even if you release the tether halfway through. Clear the segment and the same worker finishes the same finite face.

Mine its face with the ordinary extraction beam and it yields the cutting time to you: “You have that face. My beam is down while you cut; I will take over if you leave it unfinished. The iron you cut is yours to collect.” The player’s mining owner removes real ore and creates the ordinary pickups. Once the player stops cutting, the worker can finish the remaining ore. No receipt or dialogue awards credits, completes a mission, replenishes ore or creates a second extractor.

The route is local to the existing starter worksite: observe the working hull, cross its tool path, learn to give the entire tow room, choose to take the face or leave it, then collect the result through the existing mining/cargo flow. It does not register a new board mission or replace the earlier Helios opening script. Its consequence is physical and immediate: the worker gives up productive time and ore to the player. Existing first-ticket attribution continues to recognize player extraction, not NPC extraction.

## Integration boundary

Candidate parent: `coldshalamov/SpaceFace`, draft PR #939, branch `dot/scale4-freight-return-20261108`, head `c0edbb2d0aca7d1cfdaf02fabee6e7bcc282ddc6`. The current branch’s Kessler deltas are retained. No merge or deployment is included.

The job runtime remains the writer of the finite work clock. Mining remains the writer of ore and pickups. Combat attachments and physics remain the writers of tether state and movement. Courtesy/shared-cut helpers only validate identities, observe physical conditions and ask the job owner to hold. Transient holds are cleared on load and sector changes. Cooldowns apply to actually surfaced comms, not merely queued lines.

The renderer receives cutting state through the existing worker vitals bridge. Positive occupant generation, stable world record, canonical job identity and the Helios slot prevent stale updates. Late commissioning after SPAWN is supported. Both NPC beam/contact emitter paths honor a powered-down tool while retaining the work lamp, including reduced motion.

### Opening producer recovery

A populated production diagnostic exposed an existing failure: a struck starter rock could drift faster than the accepted seam limit; the worker then aimed at its obsolete waypoint forever. Before recovery, both 30- and 120-simulation-second traces failed to reach a live cut.

The same valid, materialized, uncontrolled Helios worker now returns through its normal home leg when its ordinary two-stop face is invalid during APPROACH or WORK. Only the existing safe home turn can select another face. FLEE, authored claim routes, externally controlled workers, tow-assisted workers, other miners and stale/recycled associations are unchanged. Heading is updated for virtual travel. An aborted-loop payload stamp suppresses the existing unload ore-lot side effect for that loop, including persistence. A later legitimate loop retains normal settlement. This is not an uninterrupted same-face claim: in the production seed, rock 67 was abandoned and the worker later cut rock 59.

### Continue uses the same resource, not a recycled number

A full production Save exposed a second existing gap: numeric face 59 regenerated as another untouched boulder, while the actual partially cut `rb_448cb4f3` returned as face 58. The original worker could then lose the selected-cutter role to another traffic miner. The resource owner had correctly preserved the ore; the job association was wrong.

Normal commissioning now persists the existing resource owner's identity key in the job payload. Continue prioritizes that remembered job and remaps only the exact unique face, retaining progress. Missing, depleted, wrong-seed or ambiguous originals take the empty home turn. Temporarily rejected promotion retains the worker and pauses its work clock while admission retries, without blocking FLEE or external control. A restored traffic hull receives its starter activity slot before an early return, so the safety path remains reachable. Legacy saves without a durable face binding use a conservative home turn rather than treating a reused numeric ID as proof. They cannot recover information those saves never recorded.

## Verification

Evidence was run against a source overlay composed from the exact PR parent plus this candidate, without editing the dirty shared checkout. The test loader pins repository ESM imports; a separate fs preload pins direct JS/MJS/JSON reads used by source-inspecting tests. Installed dependencies and native binaries remain those of the test environment. No golden was changed.

- 31 focused/native tests passed independently after the final product changes. Actual native Hitch movement crosses and clears the cut; actual F attach/flight/F release exercises a crossing tow and released load; ordinary mining input exercises extraction and yielding. These use initialized local fixtures rather than an unassisted menu-to-worksite journey.
- Eleven recovery/Continue regressions cover return identity, invalid/depleted/missing/fast faces, FLEE and control exclusions, job persistence and real kernel-to-owner unload behavior. Repeated unload calls are checked while the aborted loop is current, not as an invented asynchronous replay protocol.
- Final independent verification: 43/43 combined focused/native/opening/recovery/Continue tests and 105/105 adjacent tests passed using the pinned imports and fs reads, with zero skips or cancellations. The existing claim-opening VM fixture now evaluates the actual new production identity helpers; its behavior assertions are unchanged. No remaining concrete code blocker was identified for this bounded draft slice.
- 47-A, seed 47, 720 ticks, reload at 600: uninterrupted and reloaded hashes match; no divergent tick or diffs.
- A separate 77-test neighboring run passed 75 and failed two starter-workday source-extraction tests. The same two failures reproduce on the unchanged parent (11/13 there), at the same null-regex extraction of moved mission helpers. They were not altered or hidden.
- Final author runs: 31/31 focused/native plus 12/12 consolidated opening/recovery/Continue, with no test exclusions. The older two standalone production cases were consolidated into the new opening test rather than left skipped.
- In the populated production profile, seed 8008, the existing worker `wr_convoy_fd97944d` reaches cutting at 72.8333 simulation seconds. With fixture placement at its actual cut, crossing holds ore, work progress and beam time for 0.5 seconds. Ordinary RMB extraction then yields the shared face; the player removes ore while the NPC clock and beam remain held.
- The real Save serializer and `loadEnvelope` preserve the naturally created face binding, worker record, job progress, credits and 517.06 remaining ore. Transient holds are absent immediately after load. Ninety actual production ticks rebind the same worker to the exact original resource under its regenerated numeric ID and resume extraction: ore 517.06 → 498.16, work progress 0.00025377 → 0.05025377, with no credit grant. This is a successful save-owner continuation probe, not UI Continue acceptance.

### Reproduction on the integrated source tree

```
node --test --test-concurrency=1 test/helios-cutting-courtesy.test.mjs test/helios-cutting-tow.test.mjs test/helios-shared-cut.test.mjs test/helios-opening-native.test.mjs
node scripts/sf-sim.mjs compare 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.save-v26.expected.json --reload-at 600
```

## Remaining acceptance and exclusions

This is a headless simulation and render-emitter integration result, not a rendered browser acceptance result. Main-menu Adventure entry, discovering/flying the entire populated route without fixture placement, the on-screen timing/readability of comms, and clicking the actual Continue UI have not been verified. Direct `loadEnvelope` is the real save owner, not proof of the title-screen UI or disk storage.

Tow clearance covers another load crossing the worker’s segment; towing the current workface itself is deliberately outside this helper’s scope. The ordinary drift/invalid-face return behavior still applies when appropriate. No new models or assets are introduced. The candidate excludes the local cutter-repair proposal because it depends on an unpublished repair-resource rewrite. It also excludes the unrelated handover contact test and unpublished shift-meal registration work. None of the denied mission, scanner, rail, traffic, site-manifest or progression-audit paths is edited.

The work should remain a scoped draft until the remaining rendered/ordinary-route acceptance is completed. It should not be described as a completed Helios campaign or release.
