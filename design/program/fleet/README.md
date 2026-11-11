# Start here — how SpaceFace gets built

There are exactly three things to know:

| Question | The one answer |
|---|---|
| **What is the game?** | `design/game/` (start at its README; doc 18 is the acceptance standard) |
| **What do I work on?** | `design/program/fleet/QUEUE.md` — four lanes; you work only in yours |
| **How do I work?** | `design/program/fleet/PROTOCOL.md` (rules), `PLAYBOOK.md` (the loop and the programs), `HANDOFF.md` (where things stand) |

Everything else under `design/program/` and `design/program/finish/` is **history** unless a queue row
links it. Do not take work from any other plan, board, build map, lane file or PR description.

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

`npm run gate` (on a quiet machine): import lint → Adventure boot through the real route → Swarm boot
(one round) → deterministic 47-A replay. One line per step, then `GATE PASS` / `GATE FAIL` (also in
`.devshots/fleet/gate-last.txt`, step logs in `.devshots/fleet/gate-<step>.log`).
`npm run gate -- --quick` = lint + Adventure boot. Run it after every batch and before every push;
red means fix or revert before anything else lands.
