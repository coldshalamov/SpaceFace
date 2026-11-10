# Unused Swarm repair cells

Local candidate, 2026-11-07. Source verified identical between local HEAD
`7dc248acec452df4afcd0a5b71ad0507cd6c17ec` and freshly fetched master
`a4d541e2b8cf3230a8bad932b08e200df3f4771d` before this patch. Open PRs
#921/#923/#925 do not own the supply file. No court geometry replay or changes.

## Player result

When one cell tops off the hull, collecting a second no longer destroys unused
medicine. It remains the same physical pickup and can heal subsequent damage.
Its original 16-second expiration is unchanged. The existing pickup retry delay
applies; this is not unlimited storage, a new timer, or extra healing.

`src/systems/swarmSupply.js` now returns explicit pickup acceptance and only
spends the cell's identity after healing. No mining, physics, drop cadence, cap,
asset, UI or reward-owner changes.

## Evidence

`node --test test/swarm-repair-preservation.test.mjs test/crucible-swarm-supply.test.mjs test/infer-swarm-02-supply-announce.test.mjs`: 18/18 pass.

The first three new tests failed on unchanged master source before editing:
full-hull cells vanished through both real mining scoop and physics collection
methods; wrong-collector receipt had no explicit rejection. Candidate passes,
including later damage/healing, exact expiry preservation, duplicate receipts,
and unspent-cell reclaim after owner reinitialization/entity-spawn replay.

`git diff --check` scoped to source/test passes.

## Acceptance gaps

No rendered playthrough or native collision integration claim. The fixture calls
the production receipt handlers after contact, with in-memory entity spawn;
reinitialization/replay is not a full SaveSystem roundtrip. Expiry deadline is
asserted unchanged, not simulated through a full lifetime tick.

Broader `test/pickup-partial-acceptance.test.mjs` is blocked at import by missing
`@elemaudio/core`. Existing `test/inference-swarm-brood-repair.test.mjs` has two
baseline failures expecting three cells although current per-round cap is two;
those unrelated expectations are not changed. No dependencies installed.
