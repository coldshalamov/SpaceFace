<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-142.01 — Ship history: scars from real impacts, repairs that leave patches, a hull people can name

```text
DONE  PQ-142.01 — the hull now keeps what happened to it: every real hit and slam leaves a mark that survives Continue, a yard repair covers the marks instead of erasing them, and after somebody watches you finish a fight they say the ship's name out loud.
WHAT I FOUND     The game already published every receipt this needed — the shot that reached hull, the contact and its closing speed, the kill the loss ledger files, the repair the yard bills you for — and nothing was listening: the ship's own record only counted kills, patches and grime, so two hours of flying left a hull indistinguishable from a showroom one.
WHAT I CHANGED   The hull's record now stores the marks those receipts describe (where on the hull, how hard, what it hit, when), a dock repair turns the open ones into patches that stay on the books, the acts a hull is seen doing attach to the ship rather than the pilot, and the Ship's Ledger reads all of it back in plain sentences.
WHAT YOU WILL FEEL   Fly badly into a rock or take a real beating and the ship carries it afterwards — the Ledger says which side took what and whether the yard has covered it, and a hostile who watched you win will call you by the ship's name instead of "unidentified vessel". What you still will not see is the mark on the paint: this leaf is the record and the words, not a repaint of the hull mesh.
THE NUMBERS      scenario ship_history_10s, seed 47, 600 ticks, fixed 9-event tape | before 0 marks / 0 open / 0 patched / 0 acts / 0 name-barks | after 5 marks / 1 open / 4 patched / 1 act / 1 name-bark | target: at least one mark that survives a save and one bark that names the ship
THE FRAMES       none captured — nothing on the hull mesh changed this leaf. The player-visible surfaces are the Ledger rows and the spoken line, both asserted in test.
NEXT             PQ-142.00 capabilities, not percentages (the other half of this packet)
```

## The done-when, verified

- **Save round-trip of scars — both halves.** `test/ship-history.test.mjs` "scars and renown survive
  a save round-trip byte for byte" runs the real `src/save/saveSystem.js` serializer over a hull
  carrying three marks (one open, two patched) and one witnessed act, then re-normalizes the JSON:
  the restored record is `sameLivingHull` with the original, the ids and the whole scar array are
  deep-equal, the open/patched split is preserved (1 open, 2 patched), and `historyVersion` is 2.
  The same test then drives the **load** half on a fresh `createGameState`: the real
  `save._restorePlayer(data.player)` followed by a real `save:loaded`, which is what runs
  `ships.reconcileLivingHull`. Those are the two places a record gets silently rebuilt from named
  fields rather than carried — `_restorePlayer` copies `ownedShips` wholesale (an array, so it takes
  the assignment branch, not the shallow-merge one), `normalizeLivingHull` preserves the history
  members, and the test asserts three marks, 1 open / 2 patched, one act, and that the live hull
  entity is holding the restored record and not a stale one.
- **One bark that names the ship after a witnessed act.** Two tests, one harness-level and one
  through the shipped systems:
  - "a witness who saw the act says the SHIP by name" — the kill receipt attaches the act, exactly
    one nearby NPC speaks, the line matches `/Tessera/`, on the `bark` channel, in the witness's own
    faction register; a second kill inside the 24 s window does **not** restate the name.
  - "the arbiter actually puts the ship's name on the floor, through the shipped systems" —
    `createSimulation({ systems: [ships, barkDirector, voiceArbiter] })`, the hull started exactly
    the way `src/main.js:352` starts a new game (`[{ defId: NEW_GAME.shipId, fittings: [] }]`, no
    living-hull record yet), a real hostile 180 WU away, and the toast the player reads contains
    "Tessera". This is the one that proves the done-when: `say()` returning true is not a bark the
    player hears; a toast on the arbiter floor is.
- **"Consequences or it is thin."** One scar produces three further things: it persists through the
  save, a dock repair converts it to a patch that stays on the record, and it is read back as a
  sentence on the Ship's Ledger. The witnessed act produces two: the spoken recognition line and its
  own Ledger row.

## Surface before invent — what already computed this

Every field a scar carries is read off a receipt the simulation already published. Nothing in this
leaf invents a number, and no new event was added to the sim.

| What the leaf needed | What already computed it | Where it is consumed now |
|---|---|---|
| "a shot reached the hull" | `combat:damage` from `src/combat/damage.js:245` — `isPlayer`, `hullDamage`, `armorDamage`, `before.hullMax`/`before.armorMax` (`snapshotVitals`), `pos` | `scarFromPlayerDamage()` in `src/combat/hullScars.js` |
| "the hull hit something, and how hard" | `physics:impact` from `src/core/physics.js:1280` — `playerInvolved`, `aId`/`bId`, `normal`, `preSolveClosingSpeed`. Emitted by **both** backends: the custom `resolvePair` path and the live `rapier-dynamic` path (`_emitSg02ContactImpacts`, which forwards `receipt.normal` and `receipt.preSolveClosingSpeed`) | `scarFromPlayerContact()` |
| "what it hit" | `collisionSurface()` in `src/combat/impulseKernel.js` — the same classifier the collision consequence uses | `scar.surface` |
| "how hard is hard" | `COLLISION_CONSEQUENCE_LIMITS.damageDeltaV` / `.tumbleDeltaV` and `TERRAIN_CRUMPLE_LAW.threshold` (`impulseKernel.js`) | the four severity bands; no invented speeds |
| "which side of the hull" | the contact normal, which both backends define as pointing **a → b** (`contactNormalInto` in physics.js; the stated rule at `sg02DynamicBodyOwner.js:124`) | `scarFacingFromDirection()`, eight octants in the hull frame |
| "the player finished somebody" | `lossLedger:recorded` with `killedByPlayer`, `lossId`, `factionId`, `sectorId`, `t` (`src/systems/lossLedger.js:299`) — the same receipt that already fed `livingHullWithKill` | the hull's `renown` list |
| "a yard put the hull back" | `service:completed` `type: 'repair'` with `restoredHull` / `restoredArmor` (`src/systems/economy.js:1634`) | `livingHullWithPatchedScars()` |
| "the hull record itself" | `src/core/livingHull.js` — already durable, already inside `state.player`, already republished by `ship:livingHullChanged` | scars and renown are new members of the same record |
| "a name for the ship" | `src/data/narrative.js` already names the starting hull *Tessera* and gives it a registry code; the station shell already says "The Tessera's record" | `src/data/hullIdentity.js` reads it rather than inventing one |
| "a place to say it" | `ctx.helpers.voice` (`src/ui/voiceArbiter.js`) and the observer that already routes faction lines, `src/systems/barkDirector.js` | the recognition line, on the existing `bark` channel |
| "a surface on the default route" | the Ship's Ledger — `buildShipLedger()` projector, `src/ui/screens/shipLedger.js` panel, mounted at every station as the **Ledger** destination (`stationApp.js:92`) and as the Codex Ledger tab | three new prose families (`scar`, `patch`, `renown`) in the existing bank |

## The record, and why the container version did not move

- `scars` and `renown` are **optional** members of the living-hull record, written only once there is
  something to remember, and `historyVersion: 2` travels with them. A hull that has never been hit
  serializes byte-for-byte as before — asserted by "a hull that has never been hit carries no history
  keys at all".
- That is not tidiness. The living-hull record sits inside `state.player`, which
  `src/core/simSnapshot.js` hashes (`player: sanitize(state.player)`), and it is also mirrored onto
  `entity.data`, which `snapshotEntity` hashes. A confident empty array on every hull would have
  moved every replay golden for hulls with no history at all.
- `LIVING_HULL_SCHEMA` (the container id) is therefore unchanged, and the global save version stays
  at 14. The version this leaf owns is the member-level `LIVING_HULL_HISTORY_VERSION`.
  `npm run check:save-schema` is green (`SAVE_SCHEMA.md OK (version 14, 282 paths)`), and the reason
  is visible in `scripts/generate-save-schema.mjs:62` — its fixture seeds
  `ownedShips = [{ defId: 'ship_kestrel', fittings: [] }]` with no living-hull record at all, so
  there are no history paths to declare and the document is unchanged.
- **Bounded by construction.** 24 scars maximum, 8 witnessed acts maximum. When the scar list is
  full the oldest **already-patched** mark is dropped first (the yard covered it once; it can be
  covered again) and only when every mark is still open does the oldest open one go, so the record
  keeps the marks that still mean something. Asserted in "a firefight leaves a history, not a log".
- **A firefight is not a hundred scars.** One admitted mark per half second per cause
  (`SCAR_ADMIT_COOLDOWN_TICKS = 30`), except that a *worse* band always lands — the crushing slam is
  never swallowed by the cooldown. In the seed-47 scenario nine receipts become five marks, and the
  crushing one is among them.

## Single writers

- `src/systems/ships.js` remains the only writer of the living-hull record; every new field is
  written through the existing `_reduceLivingHull` reducer, which emits the existing
  `ship:livingHullChanged` receipt.
- `renown` is a **new field on the hull's own record**. It is not faction standing and never reads
  or writes it — `src/systems/factions.js` is still the sole writer of reputation. This is
  reputation *by hull*, which is what the vision sentence asks for.
- `src/systems/shipLedger.js` stays a read-only projector: it gained one read of the active berth's
  hull record and no subscription, emit or serializer. `scripts/check-depth-program-a2.mjs`
  re-asserts that (`sourcePolicy: read-only projector; zero subscriptions, emits, or serializers`).
- `src/systems/barkDirector.js` stays an observer: it listens to the receipt the hull owner already
  publishes, speaks through `helpers.voice`, and writes only its own `state.barkDirector` slice.

## The surface

The hull's history is read back on the **Ship's Ledger** — reachable in ordinary play at any station
(the **Ledger** destination in the station shell) and on the Codex Ledger tab. Three new prose
families join the existing bank, four variants each, selected deterministically from the run seed:

- `scar` — an open mark: *"Took a {band} mark on the {facing} from {what}. Still open."*
- `patch` — a mark the yard covered: *"The yard covered the {band} mark on the {facing}. The seam still shows."*
- `renown` — a witnessed act: *"The {ship} was seen finishing it in {sector}. {faction} was watching."*

The hull rows are projected at `shipLedger.js:462`, after the loss ledger (capped at 64 entries) and
the trade ledger (capped at 10) and before the encounter history, recovered names and titles — so the
`SHIP_LEDGER_MAX_SOURCE_RECORDS = 512` observation cap cannot starve them out in a long save: the
sources ahead of them are bounded to well under a hundred records combined, and the hull itself
contributes at most 32.

This reuses the existing panel and the existing prose pipeline rather than adding a screen, which is
what `design/frontend/INSTRUMENT_GRAMMAR.md` §10 ("reuse before invention") requires; no new class
names, no new entry key, no new style injector. Asserted by "the Ship's Ledger reads the hull's own
history back in words": the rows are present, every token resolves (no `{` reaches the page), and the
renown row names the Tessera.

## Checks and results

| Check | Result |
|---|---|
| `npm run check:baseline` | **14/14 green**, 59 232 ms wall against a 90 000 ms budget |
| `npm run check:baseline` (repeat, under concurrent-lane load) | 13/14 — `massline` reported three **TIMED OUT** children while the whole run ran 3× slower (`sim` 21 s → 172 s). The harness names a timeout a contention signal, not an assertion, and `check:47a:recovery-contested`, `check:47a:civilian-priority` and `check:47a:physical-branches` were each re-run alone and are green. The 14/14 line above is the measurement for this tree. |
| `npm run check:save-schema` | green — `SAVE_SCHEMA.md OK (version 14, 282 paths)` |
| `node --test test/ship-history.test.mjs` | 15/15 |
| `node --test test/depth-program-a2-ship-ledger.test.mjs` | 8/8 |
| `node --test test/ship-ledger-evidence-host.test.mjs` | 10/10 |
| `node scripts/check-depth-program-a2.mjs` | green — `entryTypes: 11`, read-only projector policy re-asserted |
| `node --test` over the living-hull / ships / ledger / save / loss-ledger cluster (11 files) | green except two pre-existing reds listed below |
| 47-A legacy golden hash | `76116bb577b52a939eadd8ed6ae7266c7bebe112d8a7a326ebff24cacaf34edd` — **equal** to the recorded `authoritativeHash` |
| 47-A V3 golden hash | `77bbd9cd12f3145c855c6e045ea73adec2982912f0d9695c6c3cbdf757c1cc3b` — **equal** to the recorded `authoritativeHash` |

**No golden moved.** Both 47-A envelopes were run against this working tree and reproduce their
recorded authoritative hashes exactly, so no §8/§10d causal record is owed. The 47-A tape does not
put the player hull in the state where a scar is admitted, and a clean hull writes no history keys —
which is exactly why the record was built as optional members.

### The four baseline reds this unit found at entry, and what they were

At entry `npm run check:baseline` was **10/14**: `sim`, `sim-v3`, `sim-compare` and `sim-v3-compare`
all failed **before running the simulation at all**, on the same cause — commit `44aeac17`
(2026-09-05, the PQ-137 causal-record completion) added two `notes[]` strings of 431 and 318
characters to each 47-A envelope, and `src/contracts/evidenceSchemas.js:369` caps a telemetry
envelope note at 260 characters. `scripts/sf-sim.mjs` validates the envelope before it runs, so four
checks were dead on a prose-length rule.

Repaired by reflowing those two notes in each file into `(cont.)`-continued pieces under the cap.
**Every word is preserved verbatim**; no hash, acceptance criterion, trace count or verdict was
touched (`git diff` on both files is 3 changed lines each, all inside `notes`). This is a schema
repair, not a re-record — the goldens' own hashes were independently reproduced above.

**For the PQ-137.11 lane**, which authors those notes and re-records these envelopes: a telemetry
envelope note is capped at 260 characters (`src/contracts/evidenceSchemas.js:369`) and `sf-sim.mjs`
validates the envelope *before* it runs the simulation, so a long causal-record line takes `sim`,
`sim-v3`, `sim-compare` and `sim-v3-compare` red without ever reaching the hash. Keep the next repin's
notes under the cap.

### Pre-existing reds NOT caused by this unit and NOT fixed here

| Red | Cause | Age |
|---|---|---|
| `node scripts/check-bark-director.mjs` | `classifyBarkSituation` returns `demand-cargo` for `faction_reach` because that faction's contact grammar has `demandType: 'tithe'`; the check still expects `scan`. The tithe branch is in the committed file and the grammar row predates it. Fixing it is a bark-classification design call, not this leaf's, and the check is not wired into `check` or `check:baseline`. | since `f277c5e7`, 2026-07-16 |
| `test/living-hull-presentation.test.mjs` "renderer binds Living Hull changes to the retained adapter" | asserts the literal substring `bus.on('ship:livingHullChanged'` in `src/render/renderer.js`; commit `9ed20a0b` "fix(render): own browser lifecycle callbacks" changed the call to `onBus('ship:livingHullChanged'`. `renderer.js` is clean at HEAD and untouched here. | since `9ed20a0b`, 2026-09-03 |
| `test/starter-weapon-runtime.test.mjs` (2 tests) | weapon thermal-lockout timing. The file imports only `fittingsFromDefaultModules` / `makeShipEntitySpec` from `ships.js` and never calls `ships.init`, so none of this leaf's listeners exist in that run. | pre-existing |
| `test/core-first-ten-minute-contract.test.mjs` | "radar uses objective color for mission markers" — a deliberately-red UI contract. | pre-existing |

## Files

**Added**

- `src/combat/hullScars.js` — pure receipt → scar derivation: severity bands read off the collision
  law's own thresholds, hull-frame octant from the contact normal, and the admission gate.
- `src/data/hullIdentity.js` — one deterministic name/class/registry per owned berth; the starter
  hull is the canon *Tessera*, later berths draw from an authored bank seeded by run seed + berth.
- `test/ship-history.test.mjs` — 15 tests including the save round-trip, the repair→patch
  transition, the named bark through the shipped systems, and the seed-47 scenario.

**Changed**

- `src/core/livingHull.js` — the `scars` / `renown` / `historyVersion` members, their closed
  vocabularies, the bounded reducers (`livingHullWithScar`, `livingHullWithPatchedScars`,
  `livingHullWithRenown`), the readers, and equality over both lists.
- `src/systems/ships.js` — listeners for `combat:damage`, `physics:impact` and repair
  `service:completed`; the renown attachment on `lossLedger:recorded`; the transient admission
  memory, reset on `game:started` and `save:loaded`. Every listener's first statement is its guard,
  so the quiet path allocates nothing.
- `src/systems/shipLedger.js` — one read-only projection of the active berth's scars, patches and
  renown into the existing candidate stream.
- `src/data/shipLedgerTemplates.js` — the `scar` / `patch` / `renown` prose families, four variants
  each.
- `src/data/barks.js` — `HULL_RECOGNITION`, eight faction registers of four lines, and
  `hullRecognitionBarkFor()`. Deliberately not a `BARK_SITUATION`: that set is the contract every
  faction must cover for ordinary contact, and recognition is an event, not a contact state.
- `src/systems/barkDirector.js` — the recognition line: nearest eligible witness inside the live
  authority radius, its own 24 s gap, exempt from the post-combat silence window because this line
  *is* the tail of the fight. The gap record is finite (`0`, not `-Infinity`) so it cannot change
  meaning if the slice is ever serialized.
- `test/depth-program-a2-ship-ledger.test.mjs` — the played-state fixture gained a hull with one
  open mark, one patched mark and one witnessed act; the entry-type count assertion moved 8 → 11
  with the vision sentence quoted; the two archive-cap tests empty `ownedShips` so the cap is still
  measured over one source.
- `scripts/check-depth-program-a2.mjs` — the reported `entryTypes` now reads
  `SHIP_LEDGER_ENTRY_TYPES.length` instead of a hand-written `8`, which had silently become false.
- `test/47a.telemetry.expected.json`, `test/47a.telemetry.v3.expected.json` — **notes prose only**,
  reflowed under the 260-character evidence-schema cap (see above). No recorded value changed.

## Performance

No per-tick allocation is added. All four listeners are event-driven and guard first: a
`combat:damage` for an NPC, a `physics:impact` the player was not in, and a non-repair
`service:completed` all return before touching anything. The witness scan is one bounded pass over
`state.entityList`, run once per witnessed kill and never per tick. The record itself is bounded at
24 scars and 8 acts, so no run length can grow it.

The one honest cost: `scarFromPlayerDamage` builds a small object for each player hull hit even when
the admission gate then rejects it. That is one 6-field object beside the ~25-field `combat:damage`
payload the same event already allocates, and only on ticks where the player is actually taking hull
damage. Left as is rather than complicating the gate; recorded here so nobody has to rediscover it.

## Unfinished

- **The mark is not on the paint.** Scars are recorded, read back in words and spoken about, but the
  hull mesh does not yet show them. `src/render/livingHullPresentation.js` is the seam that would
  carry it; the record now gives it a per-scar facing and severity to place. Out of this leaf's
  done-when, which is the round-trip and the bark.
- `PQ-142.00` (capabilities, not percentages) is untouched — the other leaf of this packet.
