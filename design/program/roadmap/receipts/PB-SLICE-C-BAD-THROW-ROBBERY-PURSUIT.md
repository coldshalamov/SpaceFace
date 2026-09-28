# PB-SLICE-C — SF-288 + SF-292

SF-288: a bad throw creates a recoverable problem — a whip-flung mass that clips a hauler
dislodges a real, recoverable freight pod whose provenance names the actual cause.
SF-292: a failed robbery becomes a pursuit over real cargo — stolen freight rides the raider's
durable hull ledger, comes loose under sustained fire, and drops as physical residue on the kill.

## What changed

### `src/systems/traffic.js` (SF-288)

`_spillHaulerCargoFromViolence` takes a `cause` and writes it onto both the pod
(`data.spillCause`) and the `freight:cargoSpilled` chronicle payload (`cause`). Call sites now
report honestly:

- `combat:damage` handler derives the cause from `p.origin.kind` — a whip impact reads
  `massline_whip`, not generic gunfire.
- Aimed fire stays `combat_fire`.
- The civilian panic dump (cargo ditched before any hit lands) is `panic_jettison`.

The pod remains an ordinary `jettisoned_cargo` payload — physically present, scoopable, owned,
manifest-stamped — so the problem the throw created is recovered by picking the freight back up.

### `src/ai/ambientPredation.js` (SF-292)

- `clearAmbientPredationBinding`: when a raid releases (raider escapes, victim lost, leash
  boundary), the objective's secured ledger is copied into `ai.stolenLoot` — the durable `ai`
  bag, which survives the far-shelf boundary that strips `data.predation*`. Victim id and
  manifest id ride with it. Releasing a raid never deletes freight already stolen.
- `ambientJettisonUnderPressure(state, raider, attackerId, ctx)`: sustained fire on a hull still
  holding secured/stolen lines ditches the heaviest line as a real cargo pod — deterministic
  (heaviest line, commodity-id tiebreak), one ditch per 4 s cooldown, ~1/3 of the line per ditch.
  Pods carry `spillCause: 'pressure_jettison'` plus `stolenFromId`/`manifestId` provenance.
- `ambientRaiderDestroyed`: now drops cargo from two ledgers — the live objective's `secured`
  (bound raid, killed mid-escape) and the durable `ai.stolenLoot` (released raider killed later).
  Both drain on first call, so `entity:killed` and `entity:destroyed` routing to the same
  function cannot double-drop.

### `src/systems/encounterDirector.js` (SF-292)

- `_onCombatDamage` calls `ambientJettisonUnderPressure` on the damage target when it carries a
  secured/stolen ledger and the hit actually lands (`applied > 0`). The ctx build waits on a
  field probe so the hot damage path stays a map lookup.
- `_onEntityGone` / `_onEntityKilled` pass `(p.entity || entities.get(id))` into
  `ambientRaiderDestroyed` — the payload ref is the identity authority because `entity:destroyed`
  queues after `entities.delete` and ids recycle.
- `_onEntityGone` only drops on storage-vs-death: `save:restoring`, `reason === 'virtualize'`
  (far-shelf row shares the ai bag by reference), or `data.worldRecordId` (durable record cloned
  the bag at capture) all mean a durable authority already conserves the cargo — respilling there
  would drop unreachable pods AND erase the stored ledger. Only a dead hull with no stored owner
  drops its take.

### `src/ai/ambientPredation.js` hardening (from review)

- `ambientRaiderDestroyed` gates the raid release on the entity being the raider — a killed
  `manifest_carrier` victim no longer misroutes the release as `raider_destroyed`; the maintain
  sweep owns victim deaths as `target_destroyed`.
- `pushSecuredLine` merges same-commodity lines and a cap splice now subtracts dropped qty from
  `securedQty` — the ledger can't count freight that left the book.
- `respillAmbientSecured` pods carry the same `spillCause`/`stolenFromId`/`manifestId`
  provenance as the durable-loot respill.
- `ambientJettisonUnderPressure` requires a string commodityId on the heaviest line and burns
  the cooldown only after a real spawn.
- Respills keep unspawnable lines on the ledger for a later drain instead of zeroing the whole
  book on a partial failure.

## Tests

Focused:

- `test/pirate-predation-authority.test.mjs` — 28/28 (6 new: escaped raider keeps loot on the
  durable bag; escaped raider killed later drops it + killed→destroyed drops exactly once;
  pressure jettison sheds piecemeal with cooldown; converted raider still drops kept loot on
  kill; post-delete `entity:destroyed` drops via the payload ref; a real
  `insertFarActor`+`virtualize` shelf path keeps loot on the shared ai bag and drops nothing).
- `test/world-visibility-wiring.test.mjs` — 10/10 (1 new: `combat:damage` with
  `origin.kind: 'massline_whip'` spills a pod naming `massline_whip` as the cause on both the
  pod and the chronicle row).

Adjacent: `f11-raider-flies-off-with-pod`, `opening-hauler-raid-and-pursuit`,
`opening-hauler-raid-timeout-ships-remain`, `verb-02-opening-raid-already-live`,
`encounter-convoy-loss-economy`, `m2-continuous-handoff`, `world-far-shelf` — 51/51 green,
except one pre-existing deterministic red:

- `pq195-05-raider-pressure` (b) — raiders drive but drift 1966 → 2236 WU instead of closing.
  Reproduced identically with this diff stashed — not diff-caused. Ledgered as D93.

## Review history

- Round 1 (two reviewers, converged FAIL): the `entity:destroyed` respill fired on `virtualize`
  and sector demote — invisible pods at the bubble edge plus the shared `ai` bag drained inside
  the shelved/durable record (double-conservation); victim `entity:killed` misrouted the
  release as `raider_destroyed` with a duplicate cleared row; `entities.get` preferred over the
  identity-authoritative `p.entity`; cap splice dropped `secured` lines without decrementing
  `securedQty`; secured-respill pods lacked provenance; respill fired during `save:restoring`;
  jettison could pick a non-string commodityId and burn cooldown on a failed spawn.
- Round 2 (FAIL→fix): the first `alive===false` gate couldn't discriminate — `removeEntity`
  flips `alive` before queueing the receipt, so virtualize still respilled. Replaced with the
  storage gate (`_saveRestoring` / `reason === 'virtualize'` / `worldRecordId` anchor), the
  dishonest fixture replaced by the real `insertFarActor`+`removeEntity` path.
- Round 3: **PASS** with three bounded residuals noted (kept-line corner on durable kills with
  spawn failure; non-durable demote despawn respills collectible orphan pods; `securedQty`
  drift unreachable outside hand-written fixtures).
