<!-- LIFETIME: VOLATILE -->
# NOW — current shared-checkout mutation claims

The Finish Program in [`finish/README.md`](./finish/README.md) is the current authority for program
routing, lane assignments, ownership and acceptance. Each lane's board owns its current work. This
file records only active exact-path mutations in the shared checkout; it does not assign tasks or
restore superseded dispatch, worktree, provider, review or verification procedures. Follow the root
[`AGENTS.md`](../../AGENTS.md) for shared-checkout preservation.

## Active mutation windows

| Task | Thread | State | Exact paths being changed now | Next terminal action |
|---|---|---|---|---|
| INFERENCE 20 — unscoped look-then-rotate batch (board seed directions, all lanes' free paths) | zcode-inf20c | active 2026-10-29 | per-unit exact paths, each committed by pathspec as it lands; first unit: src/systems/stationBroadcast.js + new src/data/stationMarketBroadcast.js + new test/inf-station-market-broadcast.test.mjs | 20 complete production units: implement → focused test → pathspec commit+push → inference-record; every currently-dirty foreign path avoided |
