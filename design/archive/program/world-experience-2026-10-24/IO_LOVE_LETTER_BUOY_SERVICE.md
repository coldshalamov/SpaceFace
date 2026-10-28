# Io: service the original Love Letter Buoy

Public parent: `316eed66ece598e2e88872cdaa90c28b829864a2`. Draft increment, not merged, deployed or visually accepted.

## Player experience

Io's existing voluntary Love Letter Buoy is about a letter, not a reward. The original text addresses Nera; the original alternative is re-seeding its grave route. This increment interprets that action as servicing the original transmitter, not moving it to invented coordinates.

Choosing service now asks the pilot to come within 90 WU of that same living buoy and remain within the director's sampled range for six seconds. Leaving range resets the work. A missing, destroyed, replaced or foreign-owned buoy cannot settle it. The encounter has a 90-second unpaid service limit. No service-time replacement buoy, cargo, credits, reputation or new save owner is introduced. On later hearing or unpaid-abort admission, a suitable free original transmitter is reused without moving it or adding another body.

On completion the same object's target/interaction label reads “Love-letter route buoy — old broadcast silenced”; the existing kindness graffiti, warmer-comms intent, story completion and receipt occur once. The existing completion gate suppresses a later re-seeded encounter. Listening leaves the letter repeatable and grants nothing.

The public director permits only one accepted UI choice for a live encounter. A later “listen” choice during service is rejected; it is not a new cancellation UI. Leaving range interrupts/resets work. No shared offer semantics were changed.

## Existing assets and truthful presentation

The encounter retains `asset.slice.kessler_handoff_beacon`. Its actual renderer maps to `SF_47A_KESSLER_HANDOFF_BEACON`; no asset, mesh, light, radius or physical-motion change is made. The target-name path consumes `scanLabel` through `interactionDisplayName`, directly tested. This does not introduce a new scanner-discovery signal.

Existing `say`/voice-or-toast presentation carries the service instruction. There is no new prerecorded audio or actual repeating letter-audio loop. The beacon's lamp animation is unchanged. The existing `ambientComms:toneChanged` consumer records tone/reason/time in the story registry; an emitted intent is not proof of different audible ambience.

## Verification

- Initial 13-case focused test on unchanged public H4: 2 passed / 11 failed. Failures demonstrate instant reseeding without original-body service, including remote, destroyed and replaced-buoy cases.
- Service-only candidate: 16/16 focused cases plus 19/19 existing E1 runtime cases, independently rerun. Final service-and-reuse candidate: 25/25 focused plus 19/19 existing E1 cases, 44/44 total. A read-only reviewer independently reran all 44 cases and found no blocking issue.
- The final baseline's native case also fails at its immediate-completion assertion, before any input approach. The initial 13-case counts above are deliberately not relabeled as a final 16-case baseline tally.
- Native proof uses actual `requestAuthoredEncounter`, the original director-created beacon and a real Wasp with Flight V3 / Rapier. The pilot first chooses listen, then a second forced admission reuses that exact beacon and native body before service. The player starts at (-110, 0), applies straight 0.15 thrust until x >= 0, then ordinary brake. Neither player nor buoy poses, native bodies or residency are written by the test pilot.
- Native settlement: approximately 10.0833 seconds. After two extra seconds and a duplicate-choice attempt: time 12.0833, player (12.2517, 0), buoy (70, -30), original identities [1, 2] retained, two dynamic native bodies, zero impacts with contact capture enabled. Exactly one graffiti and tone intent, with the exact receipt sequence [heard, reseeded]; no credits or reputation events. Original beacon bodyHandle 5e-324 and exactly two entities remain unchanged after forced readmission and the duplicate attempt.
- Ordinary public single-shot choice dispatch rejects a second listen. The 90-second unattended service aborts unpaid.
- Story serialization projection plus ordinary `save:loaded` tests retain completed gating and abandon unfinished transient service. They do not remint or complete unfinished work.
- Non-H4 handler bytes remain unchanged. The existing E1 test only waits for real H4 service instead of asserting instant completion.
- `check:io-love-letter-buoy-service` runs the focused file and is appended once to the existing check chain, preserving prior order and CRLF.

Shipping commands:
`node --test test/io-love-letter-buoy-service.test.mjs test/depth-program-e1-runtime.test.mjs`
`npm run check:io-love-letter-buoy-service`

## Reuse of the original transmitter

The original `spawnProp` does not enroll this beacon in `live.ids`. Baseline and the intermediate service-only candidate both retained two living love-letter buoys with no deadline after two forced listening admissions and 120 seconds. Two timed-out intermediate service admissions similarly left two originals. That defect motivated this H4-only reuse follow-up.

A proposed enrollment-only fix was tested and rejected, not shipped: the director set `despawnAt = 45`, but the original beacon was still alive at 60 seconds with only the player and buoy present. The beacon was in `index.movables`; the core quiet-clock guard did not wake for its deadline. No shared core/index/cleanup code was changed, and no retirement is claimed from a timestamp alone.

H4 now stamps its own new transmitter with `loveLetterSectorId`. A later H4 admission selects the smallest-ID eligible original: matching current-sector provenance, Kessler asset and love-letter kind, alive finite-position body, prior encounter no longer live, no scheduled retirement, no mission/world/persistence/traffic owner or pin. It changes only transient encounter ownership and reanchors the scene metadata to the actual original position. It does not write physical position, velocity, native body or residency.

Focused tests prove heard and unpaid-abort readmission service the same original without growing the buoy count. Active encounters retain their own bodies; deterministic choice applies when multiple free originals exist. Legacy untagged, other-sector, pinned, foreign-owned, scheduled and dead bodies remain untouched.

Legacy duplicates cannot be safely assigned a sector from their original metadata. They are not adopted or deleted. The new tag is per-entity provenance, not a new saved ledger; full Save/Continue body restoration and cross-sector retirement are not established. Reuse when a suitable free original remains is proven, not indefinite same-body persistence or migration cleanup.

## Qualification and limits

Local runs used an isolated loader, not an exact full checkout of the public tree. It selects the immutable public director, public/candidate H4 runtime and leaf, remaps historical ambient filenames, and reuses three public qualification dependencies read-only. Their bytes match the parent's Git blobs:
- trailerEncounterStaging.js: `80ed3173fd0e93cc8b33b123ec7f6f34d91c5031`
- trailerMoments.js: `41753ada2e4c67da30a4c2b45fec7a8d0bde4cb0`
- craftCadence.js: `1ad58b9b23535314163689d38d1359ff3cab94b9`

Other dependencies are from the historical filesystem. No unmerged Pilgrim director correction or Pilgrim leaf is used. The shipping tests have ordinary project imports; exact published-tree hosted execution remains pending.

Six-second dwell is sampled by the existing director, not continuously measured at 60 Hz. Gaps over two seconds restart observation; brief out-and-back excursions between observations are not detected. Native proof covers initial hearing and one forced readmission/service of the same native beacon, one favorable straight approach and the existing small beacon body. It skips the ordinary admission cooldown and does not prove normal revisit scheduling or body restoration. Unpaid-abort reuse is separately proven by focused simulation identity tests. It does not prove normal ambient scheduling, arbitrary approaches, phone readability, live/PBR framing, whole-sector acceptance or continuous physical attendance.

Save coverage is the story JSON projection and actual director reset/gate, not full save-slot/entity cleanup or body reconstruction. The native fixture is not a Continue fixture. No browser was used, no broad check/check:ci was run, no expected snapshots or other handlers were changed, and no merge/deployment is requested.
