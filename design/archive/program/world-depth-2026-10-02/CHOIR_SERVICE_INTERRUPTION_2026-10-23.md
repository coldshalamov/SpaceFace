<!-- LIFETIME: DURABLE -->
# Helios: a relief runner must remain at the medical berth

## Existing living-world experience

The Choir-Tender's surviving crew are already authored people with physical hulls and consequences. Last Light stabilizes damaged Mercy; returned Knitbots restore her drive, player rope repair also works, and slow tow delivery remains an independent rescue route. Mercy's handover changes the news and local memory. Her medical stay reserves one bed for90seconds. The subsequent relief cast is bounded to Vesper and Compline, existing Mule hulls sent at40–70second jittered intervals, admitted one at a time for a45second service stay before returning home.

This increment fixes interruption and recovery in that existing berth. It does not add a crew, controller, reward, station frontage, schema or asset. Existing Mercy repair/handover payment and reputation, crew losses, runner losses and bounded cadence remain with their owners.

## Reproduction and behavior

The original owner admitted a runner at t95. While the same living hull and station remained observable in Helios, moving that hull2000units away did not interrupt its wall-clock treatment. At t140, the owner marked service complete, freed the bed, assigned outbound work and scheduled the next arrival. The actual player Save serializer→JSON→restore preserved this erroneous clock; Save was not its cause.

An observed local admitted runner outside the existing admission envelope now loses its service-start timestamp but retains its own bed reservation. Returning that same person starts a fresh uninterrupted45second stay. It cannot collect remote treatment or schedule a successor while displaced. A finished approach job is recommissioned through the existing npcJobs helper so the same hull has an existing-owner route back; this module does not steer or spawn a substitute.

Interruption and return each produce one bounded third-person guidance toast, not a repeating reminder. The existing nullable runnerAdmittedAtS field carries the interrupted state across serialization. Missing station, absent resident hull or leaving the sector is not evidence of physical displacement, so the existing offscreen behavior remains. Current entity-map identity and finite coordinate checks prevent stale indexes, recycled IDs and invalid positions from claiming admission or completing treatment. Death still frees the bed once and advances only the finite existing cast.

## Exact scope and checks

Base e9ddde445e94c9a438790712b595f71613f46c96. Existing owner blob26fe0ed7696c4187c0b8efbdf260db35e125ab90. Candidate source51e53f41e499ef2acd9c9a7755b25c57ffaf7b77; new testdb6371a96e921ce2ab6be2c9c02d07887e1ea3b9.

Only src/systems/choirReliefBerth.js, test/choir-relief-service-continuity.test.mjs, explicit package registration and this report change. Root checked47openPR filename sets: no source/new-test collision. No traffic, npcJobsRuntime, uniqueWrecks, Save, Mercy repair or physics mutation.

- Final17-test suite against original owner:4pass/13fail; candidate17/17.
- Existing berth tests6/6 and existing Mercy tests4/4 pass.27distinct shipping/adjacent cases total; repeated reviewer/root runs overlap.
- Independent initial review added three extra edge probes for zero-time/repeated interruptions, recycled IDs and interrupted state across sector absence. These are supplementary probes, not extra shipping test cases.
- Root independently reran final17/17 with the exact candidate and hash-valid public dependency overlay.

Tests cover local displacement, no false successor, same-person re-entry and exact45second boundary, idempotent job recommission, preserved capacity/identity, serialization during interruption, missing/stale/unobservable actors/station, sector absence, final loss and ordinary bounded cadence. Root review extended the observation guard to first admission after finding that an invalid position could otherwise claim a bed before the new admitted-state guard applied. Earlier13-case passing evidence is retained, not substituted for the final17-case result.

These are owner-seam tests with explicitly supplied body positions and the actual player serializer/restore, not a native tether playthrough, full Save.load world reconstruction, normal flight or target-device performance acceptance. The separate missing public onboarding/powerSituations.js still blocks full production startup; no stub, suppressed import or workflow change is included. No aggregate suite was executed.

## Actual visual grounding, not visual acceptance

Runners map ship_mule to the existing released wholeships/mule_production_v1.glb. The exact current release blob1d367b8174984e755ce67fcebe024e9a2e2505ca is712572bytes, SHA25639d4e8f04e22cdaa94b1f7ceaeb365438620c9b183dac234478835df940c9b62. A newly decoded CPU geometry preview excludes its non-render collision hull and shows22visible primitives/26412triangles. The39537byte preview hash is c3ad43b0cc554489ce7f6412d527e09b496749d21b5a18a68b5e9f1e2159bb31. Base-color factors/simple lighting omit final PBR textures. This is existing exported-model inspection, not a new model or live game-camera capture.

Helios maps the existing SCN trade-hub station and overlay; the medical berth here is a station-relative route and admission envelope, not a verified separate relief-frontage placement. The preview does not prove the visible service route or final materials. All game, sector, asset and ordinary-play acceptance goals remain open.

Independent final review approved the admission-boundary delta and reran17/17 plus3/3supplementary probes. No blocking findings remain in the scoped source review.
