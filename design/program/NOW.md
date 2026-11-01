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
| Swarm Machine faction units | devin-local | released | `src/data/swarmMachine.js` (new), `src/data/swarmBrood.js`, `src/systems/swarmBrood.js`, `src/systems/swarmJuice.js`, `src/render/broodPresentation.js`, `test/swarm-machine-families.test.mjs` (new) | committed — seven units + instruments green, Codex review fixes applied |
<!-- zcode-inf20c released 2026-10-29: INFERENCE 20 complete — 20/20 units landed and pushed (2e5bf4c5633 … e5ac485619fd), each recorded via inference-record; see design/program/inference-memory.json and the sitting's final report. -->
