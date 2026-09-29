# FB-021 — The four emergent weapons have a picture and can be drafted in the Crucible

**Kind:** wire · **Lane:** THE FIGHT · **Routing:** open
**Seam tags:** seam: vfxProfiles.js, seam: survivalDraft.js, seam: swarmDraft.js
**Write-set:** `src/render/vfxProfiles.js`, `src/data/survivalDraft.js`, `src/data/swarmDraft.js`, `test/fb-emergent-weapons-drafted.test.mjs`
**Neighbours (extend, never restate):** SFQ-B054, NXB-018

## The gap
`wpn_sticky_detonator`, `wpn_conductive_primer`, `wpn_thermal_cooker` and `wpn_mass_driver` merge into
`WEAPONS` from `EMERGENT_WEAPON_DEFS`, have live sim owners and audio, and have zero id hits in `src/render/`.
None appears in `SURVIVAL_DRAFT_OFFERS` or `SWARM_DRAFT_OFFERS`, so the Crucible never offers them.
Catalog-only content is the definition of unreachable.

## Why this direction
New weapons were rejected; these exist. Drawing them through the provenance families (FB-071) and adding four
verb-kind draft cards puts them on the default route.

## Mechanism
- Add draft rows for the four in `swarmDraft.js` (kind `verb`, each card's sentence naming the primitive:
  sticks, primes, cooks, drives) and gate their `fromWave` so the primer appears after the detonator.
- Confirm each resolves to a distinct presentation family and audio recipe through the shared classifier.
- Keep `auditDraftShapes` green: verb ratio stays ≥ 2/3.

## Done when
Seed 4242 Crucible reaches wave 12 with at least one emergent card offered;
`test/fb-emergent-weapons-drafted.test.mjs` pins presence and family; `pq-175-02-draft-verbs.test.mjs` and
`emergent-arpg-primitives.test.mjs` stay green.

## Do not
Do not add number cards. Do not touch the emergent primitives' sim law. Do not make them adventure shop items
in this packet.

## Focus test starting points
- `test/emergent-arpg-primitives.test.mjs`
- `test/pq-175-02-draft-verbs.test.mjs`
- `test/crucible-draft.test.mjs`
