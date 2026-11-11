# Rookside: arrival, custody, and a living receiver

## Candidate and intent

An unpublished isolated candidate over PR #939 head `1d163ffb1fe0ac4f5354f58a9b5075df172d74e7`, parent tree `9e5a3dfa6b3e1abb666c1fe1b5e0229e2dc85484`. The shared checkout and its foreign Compost drafts are untouched. No denied path, model production, publication, merge, deployment, user computer or execution thread was used.

The next scene follows the earned return to Rook. The player must actually approach the existing Rookside garden. A receiving voice contrasts Rook's closed accounts with material that can grow again, then reads the existing cargo/mining route rather than granting a load. Arrival alone consumes nothing and advances nothing; the player can leave with their cargo.

A genuine current Line carrying eligible material admits a nonphysical circuit mark at the actual load-center intake boundary. Its radius includes this load's radius, not its handling mass. Its scanner text reads edible cargo mass, the next growth threshold and any shortfall. The player is told to keep the cockpit outside and the Line attached. Releasing a cargo pod near a station can sell it to the existing Dump Chute; that same material cannot also feed the garden.

Real consumption produces distinct partial-feed and first-growth responses. Partial feed is retained material, not a completed story step. Canonical first player-fed growth names the stage change and points to the current Journal. The separate 240-tonne payment is not conflated with that first growth. A saturated legacy-state fixture without a usable growth history gets no promise of another growth stage.

## Scope and ownership

- `src/missions/compostArrivalScene.js` owns only transient presentation and anti-repeat conversation flags.
- `src/systems/faction_understory.js` adds one import, restore/destroy cleanup and a post-digestion scene call. The original line endings and existing garden/material/economy behavior remain unchanged.
- `test/compost-arrival-scene.test.mjs` exercises the actual garden, cargo, loot, attachment and visual-factory owners.
- This report is the fourth candidate file.

Garden digestion, remaining cargo quantities, marked wreck custody, mission advancement, market sale, credits, law, native physics, save envelopes and the route reader retain their existing owners. The scene validates actual attachment owner/target generations and asks the garden owner for edible mass. It does not infer edible cargo mass from the 20-tonne collider floor.

The existing authored reclaimed hull, living garden stages, circuit-zone presentation and COMMS/objective channels are reused. The asset-experience toolbox was consulted for the material-path design direction; it is not evidence of a new rendered picture.

## Independent corrections and checks

Independent review found two issues before publication:

1. Circuit geometry is fixed at visual admission. The first candidate changed radius data after spawn and on the same beacon. The corrected source includes the radius in the initial spawn and replaces only this transient marker when the receiving radius changes. Tests build the actual visual factory's RingGeometry and assert its admitted outer radius. This establishes geometry construction, not a GPU frame.
2. A missing next stage became a zero feed requirement, falsely promising more growth. Label, load speech and partial-feed speech now explicitly deny further growth. This is a saturated/legacy-state fixture: the authored receiver rejects non-player ambient drift, so no ordinary ambient-maturation route is claimed.

The last sentence correction came from actual native play: a premature cut sold the pod to the Dump Chute. The arrival guidance now warns of that existing consequence and says to keep the Line attached until the garden takes it.

Final exact-overlay aggregate: 269 checks pass, zero failures or skips. The scene's 18 focused checks include distance, station/dock/mode/restore guards, live identity, stale attachment generations, free material exclusion, actual partial consumption and stage growth, single payment ownership, no duplicate chatter, marker removal, actual geometry admission/replacement and max-stage truthfulness. Independent review also passes five probes for actual save projection, synchronous lifecycle interruption and repeated init/restore. JavaScript syntax and the existing player-label/type-floor scripts pass separately; those scripts do not establish every new sentence's layout or comprehensive accessibility.

## Native provenance and choice branches

The input is the earlier earned Rook-return berth save, not a fresh New Game campaign. All runs use the production runtime with native Rapier and a programmatic keyboard/mouse pilot. Docking, undocking, purchase, Save and title Continue use existing controller/event seams; they are not rendered browser clicks. No body position/velocity, cargo, credits, health or progression is injected to produce the outcomes.

The route buys 17 iron units at Expanse for 459 credits, reducing 1,415 to 956. Its first direct exit stalled at the station; that bounded probe was stopped and retained. The corrected route flies an actual outside-station arc and reaches Rookside's west approach, where the new arrival scene triggers.

The first completed approach retained 14 units. A faster separately retained approach kept 15. The latter's cargo observer establishes two one-unit removals by `stepRadiationCargoCook` during Charon exposure; the missing material is not restored. The earned arrival checkpoint contains 15 iron and 956 credits. Its market purchase and radiation losses are distinct from garden feeding.

The ordinary modified release key ejects one actual 15-unit pod: 12 tonnes edible cargo, 20 tonnes physical handling mass. A chase attempt with a slower capped pilot fails; a later bounded continuation catches the same kind of actual released pod immediately using the normal Line input. No replacement pod is manufactured. A load-check assertion originally compared 106.49999999999999 to 106.5 exactly; it was corrected to numerical tolerance without changing physics or source thresholds.

One retained choice cuts that actual held pod at the outer approach. The canonical Dump Chute consumes it at Expanse for 302 credits. Its saved receipt is `dumpchute:3899:4966`, 15 units of iron, not a garden receipt. The account becomes 1,258 credits; the garden remains at 52 biomass and zero feed. Save/Continue preserves those facts. That probe's intended-feed assertion fails; it is evidence of a genuine sale branch, not a passing feed test. Its null distance field is not a measured safety distance.

A separate alternative resumes the retained pre-cut latched checkpoint and keeps the original pod attached. The pilot carries it close but a 170-WU stand-off and roughly 26-WU orbit keep the load outside the 106.5-WU intake. The bounded run preserves the alive pod with zero feed. This is a handling shortfall, not an intake-owner failure. The run's balance rises by an untraced 250 credits; this is not attributed to Compost. A continuation pays out the same Line to about 100 WU, but its passive drift alone still does not enter the mouth. Both budgets and saves are retained rather than relabeled as successful feeding.

The final sweep continues from that same longer-Line save. Ordinary thruster inputs carry the cockpit around a 140-WU outside arc while the held pod crosses the actual intake. The canonical `understory:gardenFed` receipt consumes the same 15-unit pod for 12t of feed and 7.2 biomass: the garden reaches 59.2 biomass and remains stage 1. The new partial response says 1.4t more feed is needed. No first-growth step or 240t payment is granted. Credits stay 1,206 throughout this final continuation. The measured minimum cockpit-center distance in this sweep is 139.608 WU, outside the 103.5-WU living mouth; this is not a collision-free claim for the earlier route. Save and title Continue retain 12t, 59.2 biomass, the unchanged incomplete Compost step, the consumed material and anti-repeat memory. The final probe exits successfully. Its exact outcome is in `native/earned-feed-v9/result.json`. The complete cohort history is retained; this real partial feeding does not erase earlier radiation loss, the separate sale choice or failed handling attempts.

## Save, presentation and acceptance limits

Conversation anti-repeat flags and canonical garden/material receipts persist. The circuit mark does not serialize and is rebuilt only for a current eligible held load. Full dialogue prose is **not** cold-save-backed: Adventure uses the existing in-memory COMMS backlog, which clears when that UI owner is destroyed. The saved heard flags suppress replay rather than reconstructing old prose.

No rendered acceptance. The installed Playwright package's expected Chromium executable is absent; no browser was installed and no alternate computer was used. Real marker readability, occlusion, text geometry, browser pointer/keyboard accessibility, audio, frame pacing and full CI are unverified. Headless visual-factory geometry is not a screenshot. The full New Game-to-Compost route and an earned first-growth/240-tonne paid run are not claimed by the partial/failed branches above.

## Reproduction and evidence

All retained artifacts are under `/workspace/shared/compost-arrival/`. `source/`, `candidate.patch`, `paths.json` and `manifest.json` identify the exact four-file candidate; hashes are in the handoff. `parent-overlay.json` and `parent-entries.json` reconstruct the independently verified remote parent from the immutable base. All observed untouched modules/reads are audited against that tree. The inherited non-UTF-8 `breakwaterSpur/freight.js` uses Node replacement decoding; raw Git bytes and executed decoded-source hashes are recorded separately.

From `/workspace/shared/SpaceFace`:

```sh
D=/workspace/shared/compost-arrival
HELIOS_OVERLAY="$D/overlay.json" HELIOS_RUN=review-repro \
  node --require "$D/exact-fs.cjs" --loader "$D/exact-loader.mjs" "$D/run-aggregate.mjs"
python3 "$D/audit.py"
```

Each `native-overlay-vN.json` retains its executed probe cohort. To replay, copy a cohort and change only its virtual probe OUT directory to a new scratch destination, then run the same loader/hook against `scripts/compost-arrival-native.mjs`. Preserve the original logs and saves. The shared working tree is not the test baseline.
