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
| Finish integration and publication | Codex controller | active | `design/program/finish/PR_INTEGRATION.md`, `design/program/NOW.md` | integrate current fixes and publish the coherent batch; native workers receive exact source paths from the controller |

The former ZCode controller was stopped on 2026-11-02 after preserving its session state and
working changes. Its subsequent source work has been claimed, reviewed and repaired by the Finish
controller. Its former broad DUST path reservation is released; DUST product status remains in
[`dust/README.md`](dust/README.md). The owner has authorized the Finish controller to integrate
remaining work without a separate landing decision.

The Swarm Machine unit assignment is released: its seven units and instruments were committed,
with Codex review fixes applied. This historical assignment grants no current mutation lock.
<!-- zcode-inf20c released 2026-10-29: INFERENCE 20 complete — 20/20 units landed and pushed (2e5bf4c5633 … e5ac485619fd), each recorded via inference-record; see design/program/inference-memory.json and the sitting's final report. -->
