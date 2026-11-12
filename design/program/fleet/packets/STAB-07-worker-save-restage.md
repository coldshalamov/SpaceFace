# STAB-07 — Invalidate the worker save index when staged storage changes

The worker restages main-thread storage before a load. The realm mutates its backing map directly,
so the save owner's generation cache can still report an empty latest slot despite a newly staged
valid save. Reproduced with the real realm shim and save shell after priming the empty index.

Notify the existing save-generation owner only when the effective staged save namespace changes,
after pending worker writes are replayed. Keep the existing write relay quiet during restage.

Owned files: `scripts/lib/simRealm.mjs` and `test/save-worker-rpc-settlement.test.mjs`.
Add a regression for latest-slot lookup after restage, and verify with
`node --test test/save-worker-rpc-settlement.test.mjs`. No browser run by the worker.
