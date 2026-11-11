# The fleet — how the game gets built by cheaper agents

The design is written (docs 10–19 on the `EC-G13` branch, the plants in `INFERENCE_PLANTS.md`).
This folder turns it into **packets**: one job each, small enough for a mid-strength agent, with
exact names, exact files, and a check the worker runs on its own tokens.

- `PROTOCOL.md` — the rules every worker follows (shared folder, exact-path commits, honest receipt).
- `QUEUE.md` — every packet, in build order, with who can do it and its state.
- `packets/` — the jobs.
- `scripts/fleet/run.mjs` — hands one packet to one agent, headless, and keeps the log.

## Run a packet (owner or lead)

```bash
node scripts/fleet/run.mjs G19-01-class-up-moment devin1
```

Backends: `devin1`, `devin2`, `devin3` (SWE-2 Max, one account each), `deepseek` (OpenCode Go),
`flash` (Gemini 3.8 Flash via agy). Logs and the worker's receipt land in
`.devshots/fleet/runs/<packet>.<backend>.<time>/`. Run up to three Devins plus one DeepSeek and one
Flash at once; never two jobs that share a file.

Or paste this into any agent window (Devin pane, Claude, anything):

> Read `design/program/fleet/PROTOCOL.md`, then take the first row in `design/program/fleet/QUEUE.md`
> whose State is `READY` and whose Tier you meet. Change its State to `TAKEN <your name>` and commit
> that one line. Then do the packet. When done, set the State to `BUILT <hash>` and commit.

## The gate

The lead runs `npm run gate` after every batch of fleet commits and before any push. It boots
Adventure through the real route (`check:playable`), boots Swarm headless for one round
(`player-truth --mode=swarm --rounds=1`), and replays the deterministic 47-A sim (`check:sim`),
stopping at the first failure — one line per step, then `GATE PASS` or `GATE FAIL` (same lines
in `.devshots/fleet/gate-last.txt`, full step logs in `.devshots/fleet/gate-<step>.log`).
A red gate means the batch is fixed or reverted before anything else lands.
`npm run gate -- --quick` runs the Adventure boot only.

## Who does what

| Tier | Who | Gets |
|---|---|---|
| **L** | Claude (lead) | taste-critical feel, architecture, anything that rewrites the frame loop; and **reviewing every BUILT row** |
| **D** | Devin SWE-2 Max, or better | written specs touching 2–6 files, with a test |
| **S** | DeepSeek, Flash, or better | one row of written content, 1–3 files, with a test |

A row only becomes `DONE` after review (a lead looks at the diff and, for anything visible, the
screen). `BUILT` means "the worker says so".
