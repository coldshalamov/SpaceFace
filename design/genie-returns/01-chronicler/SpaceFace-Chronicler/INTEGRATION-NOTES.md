# The Chronicler — integration notes

## Scope and inspected interfaces

This fulfills the supplied `01-chronicler` module contract: complete working files, a standalone fixed-seed fixture, and explicit local wiring instructions. It does **not** modify the remote repository or silently register itself on import.

The packet identifies baseline `de9f3f1fc`. Through the GitHub connector, the default branch was also checked at **`94f38d342b8730df104777e64a5457a4ffb725f3`**. The small set of live checks covered the registry convention, current `marketNews` publication input, and `mining` salvage-completion payload. This is an interface check, not a whole-checkout acceptance run.

Important correction to older event descriptions: **current `marketNews` listens to `news:publish`; `news:headline` is its downstream output.** Chronicler publications use `news:publish` with a literal `text` and traceable `sourceRef`. Do not loop that output back into the observer.

All implementation paths below are relative to the SpaceFace root, inside the delivery's `repo/` directory.

## 1. Copy and register the owner

Copy the `repo/` additions, either manually or with the root `install.mjs`. The installer only creates new files or accepts byte-identical files. It refuses different existing files and symlinked destination paths. It does not edit project configuration.

The simulation owner exports both `createChronicler(options)` and a default `chronicler` singleton. Choose **one instance per GameState**, never both.

A minimal registration sketch, inside `src/core/registry.js`, is:

```js
import { createChronicler } from '../systems/chronicler.js';
import { isRunSealed } from './runSeal.js';

const chronicler = createChronicler({
  // Preserve the campaign/run separation used by packet systems such as heat.
  shouldObserve: state => !isRunSealed(state),
});

// Add chronicler to the existing SYSTEMS/catalog registration path.
// Add its name to the applicable runtime manifest and fixed UPDATE_ORDER.
// The exact current catalog/manifest construction remains the local registry owner's job.
```

Use the existing `isRunSealed` helper or an equivalent **authoritative** campaign eligibility predicate. The default factory observes all supplied events because the standalone packet has no run owner. The predicate is host policy, not serialized configuration, and must be supplied again after recreating the system.

Call `init(ctx)` with the ordinary `{state,bus}`. Initialize before gameplay events begin. Run `update(dt,state)` in the **fixed simulation phase**, preferably after the relevant combat/economy/law producers. It uses `state.simTime`, not accumulated `dt`, wall time, or render time. It draws no randomness at all, so it cannot perturb the gameplay RNG stream.

The inbox handles synchronous nested event delivery: a wreck callback can arrive before the Chronicler receives the kill which caused it. Equivalent same-tick source graphs resolve even when delivery order changes. Receipt IDs follow observed order, so this is **causal equivalence**, not a promise that differently ordered tapes have identical internal IDs. Identical tapes do replay identically.

Do not put this owner into the render phase. Register it explicitly in any headless/test profile intended to measure its effects; merely importing it does not add it to a curated manifest.

## 2. Register durable state and save boundaries

The only owned GameState field is `state.chronicler`. No cross-writes occur in `state.player`, `state.world`, `state.economy`, `state.ui`, or other systems' state. The memory is plain JSON; indexes and views are private derived data.

Methods:

```js
chronicler.init({ state, bus });
chronicler.update(1 / 60, state);
const saved = chronicler.serialize();
chronicler.deserialize(saved);
chronicler.newGame();
chronicler.destroy();
```

**Extend the current save schema/whitelist and state restore path.** A method named `serialize` is not proof that SpaceFace's save owner calls it. Persist the returned value alongside the other registered system data; restore it after the host has restored the matching simulation clock and world timeline. Alternatively, an existing state-field serializer may persist `state.chronicler` and call `deserialize` when adopting that field.

The inbox is part of the save. `serialize()` does not drain it, publish a headline, or advance time. A save between input observation and the next fixed update therefore resumes without losing that input.

The owner listens to `save:restoring`, `save:loaded`, and `save:error` for observation suppression and state-field replacement. It listens to `game:new` and `game:newGame`; an explicit `newGame()` call is equally valid. `game:started` must **not** clear the archive because Continue uses that event too.

Old saves with no field, or `deserialize(null)`, start with an empty archive. Unknown schema versions and malformed present data throw instead of erasing valid history. Deserialize validates a detached candidate, re-derives its source graph, and builds its read views **before** replacing live memory. Save payloads are not authenticated against a hostile game owner; validation prevents malformed structure and unsupported claims from serialized edges, not save-file cheating.

A backwards `state.simTime` without a matching load/new-game boundary blocks observation/update and reports `clockBlocked`. Restore the appropriate archive; do not silently retime old events. A replacement world with reused entity IDs must likewise have a proper reset/restore boundary.

Configuration is saved with the archive, because changing capacity or pacing mid-replay changes behavior. Constructor settings initialize fresh runs; an existing snapshot restores its own settings. A future deliberate configuration migration belongs at the save boundary.

## 3. Native observations

These are subscriptions, not new producer commands. Only compact semantic fields are retained; entities, vectors beyond a plain `{x,z}`, render receipts, and arbitrary payload objects are not retained.

| Event | Evidence used / interpretation |
|---|---|
| `entity:killed` | `id`/`victimId`, `killerId`, optional names, sector/faction/encounter, `presentation.cause`, `playerCaused`, `surface`; canonical cause precedence matches the supplied helper |
| `aftermathWreck:recorded` | Durable `markerId`, `victimId`, sector/zone; links to a same-death receipt |
| `aftermathWreck:spawned` | `markerId` → physical `entityId`; a materialization binding, not a new battle |
| `loot:manifestPayload` | `payloadId`, `victimId`; an alternative identified aftermath, not already collected cargo |
| `salvage:completed` | `wreckId`, optional `markerId`; processing completion only |
| `salvage:reactorVented`, `salvage:reactorTowedClear`, `salvage:reactorBurst` | Actual reactor outcome associated with a wreck |
| `aceMemory:transition`, `aceMemory:returnSpawned` | Stable `aceId`, ace name, transition/return tier; encounter, escape, return, defeat, or fling history |
| `distress:rescued` | Rescue fact, source identity/name and optional rescuer identity; this observer does not create the rescue |
| `heat:changed` | WANTED band transitions, including explicit non-enumerable `previousLevel` when present; not an invented crime attribution |
| `contraband:scanned` | A positive find; not a fabricated conviction or penalty |
| `economy:tradeCompleted` | Successful `side:'sell'` quantity/value at a station; source is unknown unless separately documented |
| `aftermath:causeRecorded`, `aftermath:remedied` | Exact cause fingerprint and actual remedy/mission association |

Names are captured when present; no renderer or live entity must survive for an archived fact to remain readable. Unknown names remain unknown. An explicit remote sector cannot inherit the current active sector's display label. Queries can match any evidenced sector/station along a connected arc, not only its original battlefield.

### What cannot be inferred from native salvage/trade

Current mining emits `salvage:completed.loot` for the **last drain batch**, after spawning pickups. It is neither total recovered cargo nor proof those pickups entered inventory. The current documented trade payload has commodity, quantity, value and station but no source-lot lineage.

Consequently the observer does **not** use those values to invent:

- collected quantity;
- which wreck supplied a sale;
- which sale caused a WANTED change;
- rescue credit for a reactor vent;
- mercy when an ace escaped.

Native kill → wreck → salvage memories, rival sagas, rescues, WANTED episodes, news and recall work without the extension below. A complete sourced economic/legal chain requires authoritative provenance. That is an intentional truth boundary, not a missing template.

## 4. Optional authoritative provenance extension

The owner subscribes to **`chronicler:provenance`**, a **new opt-in contract**. Stock cargo/economy/law are not claimed to emit it already. Emit receipts **after the respective owner commits an actual outcome**, never from UI, inferred chronology, or this module.

Use a globally unique durable `receiptId` for each recorded allocation or consequence. A sale split across two source lots needs two allocation receipt IDs, not one ID replayed with different origins. Use the same allocation receipt ID for an enriched native trade and its matching source-provenance fact when both describe exactly the same settled quantity/value; they group as one transaction.

### Actual inventory acquisition

```js
bus.emit('chronicler:provenance', {
  receiptId: 'cargo:run-42:acquisition-17',
  stage: 'recovered',
  source: { kind: 'marker', id: wreckMarkerId }, // or kind:'wreck', id:physicalWreckId
  actorId: acquiringShipId,
  commodityId: 'cmdty_salvage',
  qty: acquiredQuantity,
  sectorId,
  visibility: 'public',
});
```

The cargo/pickup owner must carry marker/wreck identity into the collection operation. Preserve source identity in the authoritative inventory ledger if it must survive a save, merge of cargo stacks, transfer, or subsequent sale. Do not emit this on `mining:yield` or merely on wreck processing.

### A source-tagged settled sale

```js
bus.emit('chronicler:provenance', {
  receiptId: 'economy:run-42:sale-29:allocation-0',
  stage: 'sold',
  source: { kind: 'receipt', id: 'cargo:run-42:acquisition-17' },
  actorId: sellingShipId,
  commodityId: 'cmdty_salvage',
  qty: quantityFromThisAcquisition,
  total: proceedsForThisAllocation,
  stationId,
  sectorId,
});
```

The proof checker requires the same commodity and custodian, and rejects aggregate source sales above the acquired quantity. This is documentary validation only; rejected proof does **not** undo a real trade. State quantities/credits remain exclusively with their owners.

Receipts are positive finite quantities, up to `1e12`; sale value is finite, nonnegative and at most `1e12`. Strings and identifiers are bounded. Integer IDs are allowed but normalized to strings for documentary matching. Receipt identifiers should not be recycled.

**Transfers between owners are not modeled by this version.** A sale by a different actor fails closed as `custody_mismatch`; do not relabel the old receipt's owner to make it pass. An authoritative custody-transfer stage is an explicit later extension. Similarly, cargo conservation upstream of acquisition remains the inventory owner's job: Chronicle checks the declared receipts, not the actual physical world.

### A legal consequence with an actual named cause

```js
bus.emit('chronicler:provenance', {
  receiptId: 'law:run-42:consequence-31',
  stage: 'law',
  source: { kind: 'receipt', id: 'economy:run-42:sale-29:allocation-0' },
  actorId: sellingShipId,
  kind: 'fencing investigation',
  sectorId,
});
```

Only the law owner can assert that the actual consequence names this cause. A `heat:changed` signal occurring nearby in time does not suffice. A source-less legal consequence remains unlinked; it cannot complete the six-stage story.

### Link rules

Links are typed (`death`, `marker`, `wreck`, `receipt`, `cause`). An edge requires a unique compatible parent, non-future simulation time, and any applicable quantity/custody checks. Ephemeral death IDs have a one-second parent horizon to avoid reusing an old body's numeric ID as a new death; marker/receipt links can resolve across retained long-term history.

Same actor, station, commodity, or timestamp alone is **not** a causal edge. An explicit encounter can group multiple losses, but group membership does not prove a kill→salvage→sale→law path. If two equally valid source parents remain, the link is `ambiguous`, not guessed.

Recovery events emitted before processing completion cannot later be rewritten as though processing happened first. The six-stage completion label is deliberately strict. Other useful, honestly partial memories still exist.

## 5. Consume the outputs

| Event | Contract and local hookup |
|---|---|
| `chronicler:story` | Significant new/revised story; full detached view, evidence, causal links, `sourceRef`. Read it from rival/station/contract systems, then let those systems decide any real action. |
| `news:publish` | Literal text for current marketNews; `source:'chronicler'`, stable `eventId/sourceRef`, story/revision, context and compact citations. Existing ticker/voice presentation can consume it without a new UI. |
| `chronicler:radio` | A deferred old-story **offer**, not proof any line was heard. |
| `chronicler:recall` | A reserved contextual station/sector recollection offer, with persisted cooldown and anti-repeat key. |
| `chronicler:legend` | A narrative reputation observation with bounded exemplar receipts. Not the game's title, bounty or faction authority. |

Three implemented legend families are **The Wreckwright** (credited collision kills), **A Hand in the Dark** (documented rescues), and **The Ace Breaker** (documented ace defeats), advancing at 3, 7, and 15 facts. Only explicitly player-credited collision kills count for the player. Nonplayer profiles are separate. A later named incident does not expose private historical statistics through a public legend.

Public outputs suppress an episode containing `visibility:'private'` or `'player'`. The default input audience is public because legacy producers do not carry this field. For genuinely hidden crimes/intelligence, the **producer must provide audience policy**; the observer is not a witness/knowledge simulator and cannot infer who saw a battle. Conservative episode-level suppression is not faction-by-faction redaction.

### Optional voice bridge

Initialize after the existing voice helper is ready, and destroy with its presentation owner:

```js
import { createChroniclerVoiceBridge } from '../chronicler/voiceBridge.js';

const chroniclerVoice = createChroniclerVoiceBridge({ bus: ctx.bus, helpers: ctx.helpers });
// On teardown:
chroniclerVoice.destroy();
```

Radio offers go to the existing `band` channel; station/sector recall goes to `comms`. The bridge emits `chronicler:voiceAccepted` or `chronicler:voiceRejected`. Acceptance means the arbiter accepted the offer, **not playback completion**. Use the real voice/audio owner's telemetry to measure whether the player heard it.

Do not also forward Chronicle radio through another adapter unless that adapter deduplicates `sourceRef`. Do not manually relay `news:publish` into voice: marketNews already owns that path. Chronicle does not listen to its publication/voice output, so no self-amplifying news loop exists.

### Queries and station hooks

```js
const localStories = chronicler.query({ sectorId, minScore: 38, limit: 5 });
const evidenceBackedArcs = chronicler.query({ completeOnly: true, limit: 10 });
const rivalMemories = chronicler.query({ actorKey: 'player', factionId, limit: 4 });
const view = chronicler.getStory(storyId);
const legends = chronicler.getLegends();

// Pure preview: no time advancement, reservation, or emission.
const preview = chronicler.recall({ context: 'dock', stationId, sectorId });
// Explicit offer: reserves the cooldown/key and emits chronicler:recall.
const offered = chronicler.requestRecall({ context: 'dock', stationId, sectorId });
```

Filters also include `kind`, `stationId`, `minAgeSeconds`, and explicit internal `includePrivate:true`. All results are detached snapshots. Ordinary UIs must not request private data and must render strings with **textContent**, not HTML interpolation.

`dock:docked` and `sector:enter` already request appropriate public recalls. They can query the existing archive while simulation is dock-paused; no DOM tick is needed. If the current host uses a different arrival event, call `requestRecall` there instead. Newly queued evidence still requires a simulation update before it can be recalled.

Queries do not themselves change rivals, spawn a bounty, settle a mission, or change station prices. Consumers may use `storyId`, revision, `sourceRef`, and proven edges to make their own deterministic, idempotent decisions through their own command/event seams.

## 6. Bounds, pacing, and diagnostics

Defaults are in `schema.js`:

| Control | Default |
|---|---:|
| Retained stories | 96 |
| Facts per story | 32 |
| Pending facts / processed per fixed update | 512 / 128 |
| Recent dedupe keys | 2,048 |
| Character profiles / legend observations | 64 / 24 |
| Settling delay / developing-story retention grace | 2 s / 60 s |
| Global news cooldown / same-story news cooldown | 60 s / 240 s |
| Radio cooldown / minimum recall age | 120 s / 120 s |
| Explicit recall cooldown | 180 s |
| News/story significance threshold | 38 |

All times are **simulation seconds**. At most four structured story announcements, two legends, one news item and one radio offer are published per update; cadence limits usually reduce that further. A whole pending batch is drained before intermediate evidence is surfaced. A radio offer can precede the next news revision if its own age/cooldown conditions permit; consumers own channel arbitration.

Idle updates use a scheduled wake check rather than rebuilding/sorting the archive every frame. Event batches rebuild the bounded documentary graph; this cost is real and should be profiled on target hardware. Lower capacities/batch size are tuning choices, not a claim to cure an overloaded host simulation.

New developing stories receive a **60-second retention grace** so an archive of old high-scoring stories cannot evict the next kill before its salvage/sale receipts arrive. The archive remains bounded; under enough simultaneous activity some evidence still must be dropped. Whole-episode eviction prevents dangling causal edges. Dense ace/WANTED histories can replace unlinked routine details to preserve decisive outcomes, but general causal chains are not truncated to make a false complete proof fit.

`diagnostics()` exposes queue drops, detail drops, whole-story evictions, duplicate/invalid observations, retained counts, offered outputs, and current unresolved/ambiguous/invalid links. The three link-status metrics are **gauges** of retained evidence, not all-time failure totals. `linksResolved` counts resolution transitions, not the number of presently retained edges.

Pending overflow prefers provenance, rescue/ace/law, and player-critical facts over low-value ambient observations. A dropped input is reported; success is not silently invented. Retained evidence plus the recent-key window suppress duplicates. **Unlimited replay deduplication after both a fact and its key have been evicted is not promised.** The authoritative producer's own durable receipt/idempotence policy still matters.

## 7. Local acceptance checklist

1. Copy the additions; run the delivered tests inside the actual checkout. The harness prefers real `src/core/eventBus.js` and `src/combat/killCausality.js` when present, otherwise standalone packet fixtures.
2. Register exactly one campaign-eligible system, its fixed update, relevant runtime manifests, and its save field. Confirm Continue preserves it and new-game clears it.
3. Verify an actual gameplay kill creates the expected compact fact, a matching marker links, and salvage processing is not represented as collected inventory.
4. Verify `news:publish` enters the actual ticker once, and install one voice bridge only. Measure arbiter acceptance separately from actual heard lines.
5. Emit source-tagged acquisition/sale/law receipts only from committed authoritative outcomes, or accept honestly partial native narratives. Exercise source splitting, partial sales, failed trades, reload replay, and run-sealed suppression.
6. Profile batches alongside the whole game on target hardware, watch drop/eviction gauges, test a long dock/Continue, and inspect private/hidden events. Test relevant headless manifests and the host save-schema check.

The synthetic soak proves deterministic bounded module behavior and source-chain recognition under its fixture. It does not prove live UI reachability, fix encounter starvation, or replace the game's own integration, browser, and performance checks.
