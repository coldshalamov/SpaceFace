# Bounded verification evidence

Verified immutable GitHub commit: `871c27854bb2acff09a80595844d9731d33b037a`.
Git commit API returned tree `a3bb1bb7b8cccca0ab280f53bd6035f5f92124b4`, parent
`1f6538f896bfae075941dae34007051321daacb8`, message “Docs: update current baseline and pending work”.
All input source requests explicitly used that SHA. No unpushed/local game state was consumed.
Model capability unknown. New source is isolated; no current assignment, shared implementation,
policy, board, golden, registration, schema or build map was edited.

## Source grounding

Read root and `src/AGENTS.md`, `test/AGENTS.md`, architecture and orientation. Relevant product
intent inspected in `design/VISION.md`: physical manipulation, Massline identity, causal living
world and readable authored visual identity. Consumed seams were inspected in canonical core,
entity, scanner, tetherGameplay, world, economy, missionObjectiveOps, missions, traffic,
npcJobsRuntime, npcJobs and rng. Only selected seam excerpts were used from the large owners;
no repository-wide implementation audit or bug repair was attempted.

## Focused checks

Node v24.22.1: `node --test test/pro-tuning-fork-array.test.mjs`.
Final test count recorded in feature-manifest.json. Test doubles mirror the actual core,
economy and NPC job producer APIs. They prove candidate invariants, not production scene behavior.
The geometry test covers 128 independent seeded placements. No expected goldens were changed.

Additional pinned-kernel probe executed the **actual fetched** `src/systems/npcJobs.js` and
`src/core/rng.js` from the verified base as in-memory ESM data URLs (only the relative RNG import
was redirected to the fetched RNG source). Candidate `surveySpec()` was fed to the real
`validateJobSpec`, `createJob`, `advance`, `serializeJob` and `restoreJob` exports.

Probe route: (400,-200) to (565,-130), speed 35, workS 6, same receipt payload as the adapter.

| Choice | Spec valid | Target loop count reached | Sim seconds | Receipt payload retained | Kernel restore |
| --- | --- | --- | --- | --- | --- |
| sell | true | 1 | 33 | true | true |
| publish | true | 2 | 63 | true | true |

This establishes route-schema, payload and circuit-count compatibility with the pinned kernel.
It does not prove the registered NPC runtime, rendered traffic, physics feel or ordinary placement.

## Deliberate limits / closeout

No headed application or player-truth run was possible in this isolated source-only candidate.
No visual identity/performance qualification is claimed. Central registration/save schemas,
traffic owner selection and optional route adoption, authored assets, ordinary-route placement,
worker facades and final acceptance are explicitly left to root as requested.

Economy's pinned grant method has no idempotency key or transactional retry API. The adapter
therefore serializes its paid latch with credits and freezes uncertain owner exceptions; it never
blindly retries. Synchronous save during a grant is rejected. The root save owner must preserve
the common snapshot boundary. Traffic safety still requires ordinary hazard/avoidance policy;
the candidate's spatial clearance check only covers collidable geometry at query time.
