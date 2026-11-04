# Lantern Ward — The Empty Plinth story contract

## Scope and ownership

This helper covers the first optional family-lamp service slice. Nessa connects the finite Venn family lamp to its household receiver; the canonical twenty-fifth memorial lamp remains dark. The slice requires no mission acceptance. Shift-change and the broader borrowed-cradle catalog stories remain outside this implementation.

`src/missions/lanternWardStory.js` owns only pure reward normalization, pure dialogue selection, and settlement invoked by the missions owner. World work, native physics, custody, damage, repair, departure schedules, and receipt authentication belong to `npcJobsRuntime` and its Lantern Ward adapter. Credits belong to economy. Public hail adapters and saved player visit/speech memory belong to the integration owner.

## Public API

| Export | Input | Result |
| --- | --- | --- |
| `normalizeLanternWardReward(value)` | Optional saved `missions.lanternWardReward` | `null` for absent data; a whitelisted version 1 journal; or a closed `blocked` journal for malformed presence |
| `settleLanternWard(owner, receiptId)` | Canonical missions owner and exact receipt ID | `{ok, duplicate?, reason?, journal?}`; any returned journal is a copy |
| `selectLanternWardDialogue(status, options)` | Work status and optional `{speaker: 'nessa' \| 'household', revisit: boolean}` | `{id, text, speaker}` without mutation |

Integration calls already agreed:

```js
// Inside the missions owner:
settleLanternWard(receiptId) {
  return settleLanternWard(this, receiptId);
}
// The work owner emits only after its physical receiver commitment:
bus.on('lanternWard:serviceCommitted', ({ receiptId }) => {
  missions.settleLanternWard(receiptId);
});
```

Root-owned hail and conversation helpers call the selector with the authenticated current work status and explicit saved player revisit context. `history.departures` counts commuters and must never imply a player revisit. Dialogue delivery timing, quiet periods, and one household line are integration concerns; this selector creates no clock or delivery loop.

## Receipt authority and exact identity

Settlement resolves `owner.registry.get('npcJobsRuntime').lanternWardReceipt(receiptId)`. It never accepts a receipt object from a UI, reads raw work save state as proof, or treats an installed visual flag as payment evidence. Lookup absence, denial, or an exception rejects settlement.

The authenticated receipt must have these exact values:

| Field | Required value |
| --- | --- |
| `receiptId` | `lantern-ward:venn-family-lamp:service:01` |
| `storyId` | `lw_helios_empty_plinth` |
| `districtId` | `district_helios_lantern_ward` |
| `sectorId` | `sector_helios_prime` |
| `lampRecordId` | `lantern-ward:lamp` |
| `lampSerial` | `venn-family-lamp:01` |
| `receiverRecordId` | `lantern-ward:receiver` |
| `committed` | Boolean `true` |
| `count` | Number `1` |
| `playerHelped` | Boolean `true` |
| `committedTick` | Nonnegative safe integer equal to `state.tick` |
| `committedAtS` | Finite nonnegative number equal to `state.simTime` |

Current sector comes from **`state.world.currentSectorId`**. The receipt is payable only during its original synchronous commitment tick/time in that sector. Late, future, wrong-sector, wrong-record, wrong-serial, or NPC-only receipts reject without paying. Receipt metadata such as `method` and `recovered` does not grant authority.

Native entity ID plus generation and bound object identity are the work owner's responsibility. This helper's receipt schema deliberately does not invent generation fields absent from the agreed API. **Integration gate:** the real `lanternWardReceipt` implementation must authenticate its original receiver/payload commitment, including native identity/generation validity; validating saved booleans and serial strings alone is insufficient. The focused test for generation replacement uses an authority-denial mock and is not proof of the real physics adapter's generation validation.

## One-time reward and save semantics

The modest reward is 180 credits, capped by safe integer capacity. Settlement requires a valid nonnegative safe integer current credit balance, a registered economy owner with `grantCredits`, and the canonical synchronous event bus. It sends `economy:grantCredits` with `{amount, reason: 'lw_helios_empty_plinth'}` and verifies the resulting balance. It never writes credits or cargo directly.

Before dispatch, missions writes this journal to `state.missions.lanternWardReward`:

```js
{
  version: 1,
  status: 'reserved', // becomes 'settled' after verified synchronous dispatch
  storyId: 'lw_helios_empty_plinth',
  receiptId: 'lantern-ward:venn-family-lamp:service:01',
  credited: 180, // actual safe integer capacity, 0..180
  committedTick: 4522,
  committedAtS: 75.3666666667
}
```

Reservation happens before listeners execute. This prevents duplicate payment during reentrant event callbacks and closes the reward if a listener serializes a save while dispatch is running. Successful dispatch writes the settled object back through state because a reentrant callback may have normalized the reservation into a new object. Completion logging and `mission:completed` occur afterward; presentation exceptions cannot reopen payment.

A settled replay of the same receipt returns successful duplicate acknowledgment without cash or completion events. Reserved or malformed journals stay closed after Continue. Unknown fields are discarded. Unsupported version, invalid identity, invalid amount, or invalid timestamps normalize to `{version: 1, status: 'blocked', storyId: 'lw_helios_empty_plinth'}`. An absent field normalizes to `null` for additive migration compatibility.

If credit dispatch throws, produces no balance change, or has an unexpected result, settlement returns `credit_dispatch_uncertain` and retains the closed reservation. This chooses at-most-once payment over automatic retry: a broken listener may withhold the modest reward, but Continue cannot mint it twice. Missing authority capabilities are detected before reservation and return `credit_owner_pending`.

## Narrative selection

Nessa has distinct lines for the fallen mast, player help, missing original lamp, missing cradle, damaged lamp contacts, injured launch schedule, theft, recovery, installation, and the delayed clearing crew. A household line distinguishes help from theft. Recovery wording does not invent a repair or damage history. Saved causal revisit lines use the explicit `revisit` option and retain help, theft, recovery, or ignored-work consequences.

The selector only recognizes the Lantern Ward district and known status branches. Unknown input remains neutral. It does not accept missions, move hardware, change custody, grant credits, consume electronics, repair hulls, or restore missing objects.

## Focused verification

Run:

```sh
node --test test/lantern-ward-story.test.mjs
```

The tests cover canonical nested sector state, optional participation, strict receipt fields, authority denial, time/sector staleness, reentrant and duplicate payout, Continue journals, malformed saves, missing authority/listeners, uncertain dispatch, integer capacity, presentation errors, pure dialogue, distinct household consequences, explicit player revisit, and the unchanged dark memorial. These tests do not establish visible timing, native route geometry, collision behavior, or integrated save-hook correctness; those remain owned by runtime/integration validation.
