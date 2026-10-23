# R399 (AL-LONG-1) — eight-object capability-revisit slice

## Player terms

Eight memorable wrecks now tell the player, on an ordinary scan pulse, whether the fit they
are flying can handle the named job: six tow doors (Great Tanker 800 t, Runaway Ladle 240 t,
Erased 260 t, Spare Keg 90 t, Impound Shelf 150 t, The Pour 240 t), one head-qualified line
door (Disputed Keg — an Elastic Whip rated for a 100 WU/s swing), and one field door
(Held Note — a Signal Decoy Buoy in the water). The two slam doors were replaced by tow doors
on the same bodies in Round 1: no honest slam return-action exists on the player route yet. The starter Kestrel reads "not yet"
on all eight; a legal upgraded fit reads "ready", and rescanning after a refit flips the
verdict. Nothing is locked, paid, hidden, or time-gated.

## Done-when ↔ assertion

| Scope item | Proven by |
|---|---|
| Eight authored, physical doors across the supported kinds (tow, line, field) | `eight authored opportunities carry exact requirements` — deepEqual on each `revisitNeed`, body materialized via `world._spawnWorldOneOffs` is a tetherable wreck at catalog mass/position/placeId |
| Actual starter refuses every requirement | `the real starter fit gets "not yet" on every one of the eight doors` — real NEW_GAME fit (tow 65.6 t), SF-174 `ready:false`, `verdict:'not yet'`, public `detail` contains the refusal, `paid:0`, `interactionLocked:false`, body stays trackable |
| Legal fits open the doors | `legal upgraded fits open every door on the same public scan route` — Hawser (90/150/240/260 tow), Colossus (800), Hawser+`mod_elastic_whip_m` (line), Kestrel+`mod_decoy_buoy_s` (field); modules asserted to survive `fittingsFromDefaultModules`; `revisitDoorState.ready` and scanned verdict both true |
| Refit + rescan flips verdict on same entity/sim | `the line and field doors follow a refit on a rescan` — scan → not yet → refit → past 8 s scanner cooldown → ready → revert → not yet |
| No false line/tow acceptance | `the head-qualified line door cannot be satisfied by rating alone` (starter "holds any swing" line denied; flag-off whip denied; enabled whip accepted; unknown `headId` fails closed; speed-only line unchanged) and `an unrelated 900 t hulk beside the Tanker` (authored tow branch no longer reads an improvised hitch; `improvised:false`, verdict not yet) |
| Accepted verbs follow the door's own law | tow: `towClassMassFor` — starter class below every authored load, legal fit's class at or above, `revisitDoorState.ready` flips on the same rating (no physical tow-bar is claimed; the kernel pull is lg-tow-predict's lane). Slam: deferred — no honest slam return-action exists yet. line: SG-02 whip attachment on the keg's 140 t stores `storedEnergy > 0`; cut produces nonzero velocity delta. field: real `countermeasures` owner — no module → `denied(no_module)`; decoy fit → `countermeasure:deployed{kind:'decoy', radius:620}` + live timed effect |
| Persistence, no unlock gates | `the durable record carries the body, never the door` — per-door: move, `_captureSectorDurableRecords`, JSON round-trip, `deserialize` + `_rematerializeSectorRecords` + `_spawnWorldOneOffs` → one body, stable recordId, moved pose, catalog mass; rescan after restore follows the live fit; record/entity carries no `revisitNeed`; `simTime += 24 h` never flips readiness |

## Commands and results

- `node --test test/al-long-1-revisit-4242.test.mjs` — **11 pass / 0 fail**
- `node --test` on the plan's regression list (al-lg-capability-doors, grok-disc-discovery,
  seam-scan-reveal, scanner-signal-investigation, world-one-offs, lg-tow-predict,
  massline-elastic-whip-head, massline-elastic-whip-snap, countermeasure-denied-readiness,
  m2-world-records) — **85 pass / 0 fail**
- `npm run check:baseline` — **12/17 green**, 5 FAILs, all foreign-caused (see below)

## Baseline FAILs — foreign-caused

The 47a tape (`test/47a.inputs.json`) contains no `scanPulse` input, and my diff only changes
(a) catalog `revisitNeed` rows read inside `capabilityLesson`, (b) `revisitDoorState`'s line
branch for `headId` needs (none existed before), and (c) the authored-tow branch of
`capabilityLesson`. None of that code executes without a scan pulse, so the `sim`/`sim-v3`
hash drift cannot come from this diff — the tree carries ~230 foreign dirty paths including
`src/core/flight/propulsionKernel.js`, `src/core/registry.js`, `src/combat/*`, `src/data/*`.
`save-schema` likewise: `SAVE_SCHEMA.md` and `src/data/saveVersion.js` are foreign-dirty and
my change adds no serialized state. `ui-screen-imports` (2 fails) and `plan-integrity`
(§1C board drift, row 474) touch nothing I edited.

## Deviations from the plan

1. **Tow physical check.** The literal "60 WU/s inside the 1.5 s kernel window" is unreachable
   for spooling drives: the Hawser's torch takes ~2 s to peak force, so even door-admitting
   fits measure 20.8 WU/s in the window on the 240 t load (the door's bar is the sustained-
   force law `towClassMassFor`, which the kernel cannot reproduce inside 1.5 s). Kept the 1.5 s
   sample for the starter-denial side; added a 5 s sustained-kernel assertion that the ready
   fit passes 60 WU/s and out-pulls the starter on the same load.
2. **Slam surface.** (SUPERSEDED — Round 1 removed both slam doors; no slam test exists.)
   The original deviation note: real subjects are `wreck` entities → `collisionSurface`
   reads 'debris' (energy path), under which a bare Mule marginally dies at 75 WU/s
   (207.3 ≥ 200). Live wreck contact uses the energy law.
3. The Kestrel has one utility S slot, so the legal decoy fit swaps `mod_drill_amp` for
   `mod_decoy_buoy_s` (all requested modules asserted to survive slot resolution).
4. `state.runtime.features` must be stamped in the world-boot harness — production always
   carries it; the headless flag fallback would deny the whip otherwise.

## Deferred

The clause "three opportunities — including the Tanker — first attainable in hours 10–25"
stays **open** per the plan: it needs an earned progression route, not a flag or fixture.
Row 399 remains open.

## Falsify

Scanning the Disputed Keg with a Hawser carrying `mod_elastic_whip_m` returns SF-174
`ready:true` — try to falsify that this acceptance depends on the runtime feature admission
(`massline2.masslineHeadElasticWhip`) and the fitted head id, not merely on the whip's
numeric line rating.

## Round 1 fixes (Codex review 1, rework items A1–A4)

- **A1 [blocking] — the verdict now reaches the painted prompt.** `payload.primary` sorts by
  signal-kind priority (`archive` 85 > `salvage`/`ship`), so `signal:discovery:SF-169` always
  won the prompt's primary slot and the body's own SF-174 detail never painted.
  `placeRow()` gains an optional second bundle part and `discoveryPlaceCandidates` folds
  `nearbyCapabilityPart(state, nearby)` — the same live `capabilityLesson` verdict the body
  row computes, null unless a revisitNeed wreck was actually inside the pulse — into every
  lesson row's discovery. The lesson's own sentence stays first; the door verdict follows.
  New test asserts the PAINTED detail via the real `createSignalInvestigationPrompt` routed
  through `setPromptDeck` (capture stub), not `signals[]`: keg + Spare Keg read
  "not yet → ready → not yet" across the refit cycle, and the customs fact stays on the
  painted line.
- **A2 [blocking] — slam doors replaced.** `collisionConsequences` skips player damage and
  the real `wreck`/'debris' surface fails the bare Mule — no honest slam return-action
  exists on the player route. Both slam `revisitNeed` annotations removed; the same two
  bodies now carry tow doors at their real physical masses (`oneoff_impound_shelf` 150 t,
  `oneoff_the_pour` 240 t — Hawser tow class ~287.8 clears both, starter 65.6 fails).
  Eight doors stand: 6 tow + 1 head-qualified line + 1 field-decoy. Slam coverage deferred:
  needs a player-damage route first. `revisitDoorState`'s slam branch untouched (existing
  code/tests use it).
- **A3 [major] — one tow criterion for both fits.** The kernel assertion now uses the SAME
  sustained 5 s window for starter and ready fit on the same load: starter < 60 WU/s in the
  published 1.5 s window AND ready ≥ 60 WU/s at 5 s AND ready out-pulls starter. Stated
  plainly: tow class is a rating the door reads, not a hard ability gate — the test measures
  the pull, it does not pretend the starter cannot nudge the load.
- **A4 [major] — the whip release is now proven removed.** After `cutAttachment() === true`
  the test asserts `getAttachmentTelemetry(attachmentId) === null` — a no-op release would
  keep reporting the latch — plus the velocity delta stays > 0.

Verification: `node --test test/al-long-1-revisit-4242.test.mjs` → **11 pass / 0 fail**
(the slam case dropped, the prompt-painting case added). Regression list → **85 pass /
0 fail**. `npm run check:baseline` → **12/17 green, identical foreign FAIL set and hash
fingerprint** (plan-integrity row-474, ui-screen-imports ×2, save-schema, sim-v3
`2a5f952b…`, sim `59148655…`).

## Round 3 fixes (Codex review 2)

- **C1 — verdict reach.** `nearbyCapabilityPart` gated on the pulse's tighter `nearby` set
  (~1,200 WU) while wreck reveals reach `SCAN_REVEAL_CLASS_RADIUS` (2,200 WU): at 1,300 WU
  the body row painted but the primary never carried the verdict. The gate now selects the
  first gated wreck inside the reveal radius itself (the same constant, no magic number).
  Test: the presented primary at 1,300 WU and at `SCAN_REVEAL_CLASS_RADIUS - 50` still reads
  "not yet" for the starter fit on both doors.
- **C2 — tow criterion.** Kernel tow-bar assertions removed entirely (the 1.5 s bar is
  unreachable even for the pre-existing authored doors — Hawser ~21 WU/s on 240 t in that
  window). Acceptance is the rating the door itself reads: `towClassMassFor` below the load
  for the starter and at/above it for each legal fit, and `revisitDoorState.ready` flips on
  the same rating. Stated plainly: **tow class is a rating, not a hard ability gate; no
  physical tow-bar is claimed** — lg-tow-predict.test.mjs owns the physical consequence.
- **C3 — report/scope.** The header and done-when table now match the code: eight doors =
  six tow + one line-with-head + one field-decoy; slam deferred pending a player-damage
  route; the "hours 10–25" clause remains deferred.

Verification: `node --test test/al-long-1-revisit-4242.test.mjs` → **11 pass / 0 fail**;
regression list → **85 pass / 0 fail**; `npm run check:baseline` → same five foreign FAIL
categories.

## Round 4 fixes (Codex review 3, item 3 — items 1-2 resolved by LEAD AMENDMENT scope)

- **Deterministic subject.** `nearbyCapabilityPart` now selects the eligible gated wreck
  NEAREST the player inside the reveal radius, ties broken by entity id — never Map
  insertion order. Overlapping doors can no longer let an unrelated hulk supply every
  lesson's verdict.
- **Named verdict.** The bundled sentence is prefixed with the subject's own display
  label (`The Disputed Keg: ... ready`) so it is truthful on whichever lesson row carries
  it; the wreck's own row keeps the unprefixed form (its subject is itself), and every
  row's Track target stays that row's own destination.
- Test: `overlapping doors` — two gated wrecks (keg + fixture door), name follows the
  nearer subject on both sides, Track stays the lesson place.
- `node --test test/al-long-1-revisit-4242.test.mjs` → **12 pass / 0 fail**; R399+R423+
  drill guard batch → **154 pass / 0 fail**.

## Round 5 fixes (Codex review 4)

1. **[MAJOR] navigation hijack.** `bundle()` picks its action target by SF priority, so the
   appended SF-174 part was winning Track and `actionPos` on lesson rows (the Ceres tug
   repro). The appended part is now stripped to TEXT ONLY (`pos: null, trackable: false`)
   — it can never win bundle's action selection; every lesson keeps its own pos,
   actionPos and trackability. The wreck's own row keeps the full part (its subject is
   itself). Test asserts appended parts carry no nav and actionPos never equals the wreck.
2. **[MINOR] `_part` leak.** Subject selection keeps the candidate part in a local
   `bestPart`; nothing is written onto live entities.
- `node --test test/al-long-1-revisit-4242.test.mjs` → **12 pass / 0 fail**; guard list
  (18 files) → all green.

## Round 6 fixes (Codex review 5)

1. **[BLOCKING] Spectrum `signal:scanResults` overwrite.** In production order
   `[scanner, spectrum, scanReveal]`, spectrum's `_fromPulse` sets `_pendingResult` and its
   next `update` emits a second `signal:scanResults` (`UNRESOLVED RETURN` / "FAINT · 0 WU ·
   PASS 1 — Occluded"), which `signalInvestigationPrompt` paints onto `signal:results` —
   `promptDeck.offerDecision` replaces the spec wholesale, so the verdict never survived to
   the player's eye. Lead-verified mechanism (not just Codex's claim): spectrum emits the
   pending result inside its own update, after the scanner's same-tick batch.

   Fix — the verdict rides its own deck decision, Codex's allowed "separate visible
   decision":

   - `capabilityLesson` stamps every SF-174 part with `doorKey` (`door:<entity.id>`) and a
     `cardSentence` that prefixes the door's name ("Mass of Another Age: …"); the stripped
     copy lifted onto lesson rows (`nearbyCapabilityPart`) inherits both and now sets
     `lifted: true`, and `sentence` (in-row text) stays subjectless only on the body's own
     row.
   - `signalInvestigationPrompt.showResults` collects `discovery.parts['SF-174']` across
     `payload.signals`, dedupes by `doorKey` (preferring the `lifted` copy), and offers a
     second decision `signal:capability` (sender FIT CHECK, statusFlag the verdict or
     "N DOORS", detail = cardSentences, same 10 s ttl). Only a batch that carries verdict
     parts refreshes it — spectrum's overwrite of `signal:results` cannot touch it.
   - `hide()`/`destroy()` resolve the new id alongside the existing ones.

   Files added to the write set: `src/ui/signalInvestigationPrompt.js` (was clean, unowned).

2. **Production-route regression.** `bootScan` now takes `{ withSpectrum }`; the new test
   registers real `spectrum` in Helios Prime (a placed spectrum sector — the case arms
   itself on the first flight tick, no fixture help), pulses at the Great Tanker, and
   asserts: the latest `signal:results` spec is the spectrum row (negative control — the
   overwrite really happened, `doesNotMatch /tow class|not yet|ready/`), the
   `signal:capability` card still names the door and its requirement, and a refit+rescan
   flips the surviving card to "ready".

- `node --test test/al-long-1-revisit-4242.test.mjs` → **13 pass / 0 fail**; the 10-file
  guard list → **85 pass / 0 fail**.

## Round-6 fixes (Codex review-6 FINDINGS)

- **MAJOR — verdict lost under the six-row signal cap.** In a crowded belt, the scanner's
  six-row publish cap can exclude the door's own row AND every lesson row carrying the
  verdict. `scanReveal` now publishes `scan:capabilityVerdicts` on the pulse itself,
  computed from live entities inside `SCAN_REVEAL_CLASS_RADIUS` (deterministic order:
  nearest, ties by id), carrying text-only lifted parts (`pos:null`, `trackable:false`,
  `cardSentence` promoted). The adapter subscribes to it: nonempty batch offers/updates
  `signal:capability`; an empty batch resolves the card (door left reach). The capped-list
  extraction route stays — both paths feed the same deck decision.
- **MINOR — `destroy()` left `signal:capability` on the deck.** Teardown now resolves all
  three owned decisions (`signal:results`, `signal:codex`, `signal:capability`) before
  unsubscribing, including the new event.
- Regression: crowded scan — six nearer ordinary wrecks + Tanker at 500 WU under the real
  `[scanner, spectrum, scanReveal]` route proves the published batch drops every
  verdict-carrying row while the card still paints "not yet"; destroy resolves both cards.
- Tests: focused file 14/14; guards 85/85.

## Round-7 fixes (Codex review-7 FINDINGS)

- **MAJOR — capped subset erased the pulse's complete verdict set.** `showResults` re-offered
  `signal:capability` from the capped batch, replacing the dedicated event's superset. The
  adapter now keeps a per-pulse union (`capabilityDoors` keyed by `doorKey`): the
  `scan:capabilityVerdicts` event rebuilds it authoritatively each pulse; the capped batch
  can only ADD verdicts, never shrink the set. Entries carry a `_at` stamp and expire with
  the card TTL so a verdict can't resurrect in a later scan when the dedicated event is
  absent.
- Regression: Spare Keg 120 WU + Tanker at the reveal edge + five nearer wrecks under the
  real route — published batch drops every Tanker-verdict row while the card still holds
  both doors ("2 DOORS", both authored labels).
- Tests: focused file 15/15.

## Round-8 fixes (Codex review-8 FINDINGS)

- **MAJOR — capability doors ignored fitted scanner range.** Both verdict paths tested
  eligibility against the bare `SCAN_REVEAL_CLASS_RADIUS` (2200 WU), while the real
  scanner/wreck reveal honors the fitted profile (`scannerRadiusMult` / `scanRangeMult`,
  max wins, floor 1 via `sensorRadiusMultForScan`). A ship running `unique_deepsurvey_suite`
  (×2.25 → 4950 WU class radius) pulsed a Tanker door at 2600 WU yet the card stayed
  silent — the verdict never reached `signal:capability` or a lifted lesson row.
  `scanReveal` now imports `sensorRadiusMultForScan` and both sites compute
  `revealRadius = SCAN_REVEAL_CLASS_RADIUS * sensorRadiusMultForScan(state)`
  (`_emitCapabilityVerdicts` `:105`, `nearbyCapabilityPart` `:1415`) — the same fitted
  radius `src/systems/scanner.js` uses. Deterministic nearest-door ordering and existing
  capability semantics are unchanged.
- Regression (`test/al-long-1-revisit-4242.test.mjs`): seed 4242, legal Hawser fit +
  `unique_deepsurvey_suite`, Tanker at 2600 WU, six nearer ordinary wrecks crowding the
  six-row scanner cap, production route `[scanner, spectrum, scanReveal]`. Path A proves
  the dedicated `signal:capability` card still names the far door; Path B
  (`oneoff_tethys_tally_keg` in the Tethys lesson-rich sector, 2600 WU out) proves a
  lifted lesson row carries the `SF-174` part and names the far door at fitted range.
- Tests: focused file **16 pass / 0 fail**; the 10-file guard list **85 pass / 0 fail**.
- *Mutation-verified:* reverting `sensorRadiusMultForScan` out of
  `_emitCapabilityVerdicts` fails the regression (far door out of verdict reach), and
  reverting it out of `nearbyCapabilityPart` fails the lifted-row assertion
  independently — the two sites are proven separately.

## Round-9 fixes (Codex review-9 FINDINGS)

- **MAJOR — capability evaluation did not mirror the deployment owner's selection.**
  `fieldDeployFor` picked the largest-radius countermeasure aboard, while the real
  deployment owner (`countermeasures.js` `equippedCountermeasure`, read by `_tryDeploy`
  and `countermeasureReadiness` alike) fires the FIRST fitted `mods.countermeasure`
  block. A Hawser with `mod_chaff_dispenser_m` seated ahead of `mod_decoy_buoy_s` got
  the card "Your Signal Decoy Buoy S throws it — ready", and the key press deployed the
  chaff into a `{kind:"chaff", reason:"no_lock"}` denial. `fieldDeployFor` now walks the
  fittings in order and returns the first block it finds
  (`shipCapabilities.js:417-439`), so the door quotes exactly what the key throws —
  never the largest field aboard.
- Regression (`test/al-long-1-revisit-4242.test.mjs`), `field: a chaff dispenser seated
  ahead of the buoy keeps the door honestly shut`: resolves legal Hawser mixed fits in
  both orders; chaff-first reads `ready:false` with `have.kind === 'chaff'` while
  decoy-first opens with `kind === 'decoy'`; the production scan route then refuses the
  Held Note for the chaff-first fit (`verdict === 'not yet'`, sentence never naming the
  buoy); and pressing the real `countermeasures` owner on the chaff-first fittings
  surfaces the honest `countermeasure:denied` `{kind:'chaff', reason:'no_lock'}` with
  zero deploys — while the same modules reversed deploy the decoy.
- Tests: focused file **17 pass / 0 fail**; the 10-file guard list **85 pass / 0 fail**.
- *Mutation-verified:* restoring the largest-radius selector fails the new regression —
  the chaff-first door reports ready again.
