<!-- HISTORY-2026-11-20 -->
> **History, not instructions (2026-11-20).** This file no longer assigns, orders or blocks any work.
> States such as READY, TAKEN, HOLD, PARKED and NEEDS-PACKET mean nothing now. Read it for facts
> about what was built or planned. The rule and the live board are in the root `AGENTS.md` and
> `design/overhaul/12_PIPELINE.md`.

# Start here — how SpaceFace gets built

Start with these references.

| Question | The one answer |
|---|---|
| **What is the game?** | `design/game/` (start at its README; doc 18 is the acceptance standard) |
| **What must the complete build deliver?** | [Whole-game completion program](../../../build_map.md#whole-game-completion-program) |
| **What do I work on?** | `design/program/fleet/QUEUE.md` — four lanes; you work only in yours |
| **How do I work?** | `design/program/fleet/PROTOCOL.md` (rules), `PLAYBOOK.md` (the loop and the programs), `HANDOFF.md` (where things stand) |

Use the build map’s completion program to reconcile plan scope and acceptance. The fleet queue
continues to carry assignments. Historical plans supply context and outstanding details when linked
from that program or a queue row.

## Starting an agent — paste this, with its number

> You are **Agent 2** on SpaceFace. Read `design/program/fleet/README.md`, then `PROTOCOL.md`, then
> take the first `READY` row in **Lane 2** of `design/program/fleet/QUEUE.md` and do it, following
> the protocol. When it is `BUILT`, take the next one. Do not stop to ask; write blockers in your receipt.

Lanes: **1** taste, creative writing, art/3D, architecture, diagnosis, reviewing on screen, writing
packets · **2** large engineering with a named seam · **3** fully specified medium jobs · **4**
mechanical jobs that cannot go wrong. An agent may drop to an easier (higher-numbered) lane when its
own is empty, never to a harder one. Suggested: the strongest model you have = Agent 1; Devin SWE-2
Max = Agents 2 and 3; Gemini Flash = Agents 3–4.

## Running workers headless (lead only)

```bash
node scripts/fleet/run.mjs <PACKET-ID> <devin1|devin2|devin3|flash> [--timeout-min=90]
```

Logs and the worker's receipt land in `.devshots/fleet/runs/<packet>.<backend>.<time>/`. Never two
workers on the same files. The runner resumes a worker after a provider rate limit.

## The gate

On a quiet machine, `npm run gate` checks source syntax, import lint, Adventure boot through the real
route, ten simulated seconds of the Swarm opening, and a deterministic 47-A replay. It prints one line per step,
then `GATE PASS` or `GATE FAIL`. See `.devshots/fleet/gate-last.txt` and the logs for each step.
`npm run gate -- --quick` checks syntax, imports and Adventure boot. Run it after every batch and before every push;
red means fix or revert before anything else lands.

Use the [whole-game production workflows](../../../build_map.md#production-workflows) for
packaged playability, performance, route coverage, and demo or release decisions.
