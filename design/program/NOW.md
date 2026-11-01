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
| DUST program (owner-directed 2026-10-31) | zcode | active | `design/program/dust/**`, `src/data/communityPersonality.js`, named `src/data/encounters/5xx-*.js`, `src/systems/encounterDirector.js`, `src/systems/telemetry.js`, `src/observability/sessionReport.js`, `src/data/modules.js`, `src/data/dustLane.js`, `src/data/enemies.js`, `src/ai/enemyMind/**`, `src/ai/combatDoctrine.js`, `src/ui/station/dust/**`, `src/ui/station/screens/{market,contracts}.js`, `src/ui/station/dock.js`, `src/ui/icons/**`, `src/ui/screens/starmap.js`, `src/render/heroRig.js`, `src/render/thruster/**` (plume floor), `scripts/dust-*.mjs`, `test/dust-*.test.mjs` | P1/P2/P4/P5/P6/P7 landed (board in `design/program/dust/README.md`); P3 partial with punch list; uncommitted, awaiting owner landing decision |
<!-- zcode-inf20c released 2026-10-29: INFERENCE 20 complete — 20/20 units landed and pushed (2e5bf4c5633 … e5ac485619fd), each recorded via inference-record; see design/program/inference-memory.json and the sitting's final report. -->
