<!-- LIFETIME: VOLATILE -->
# INFERENCE ideas inbox — owner raw material

Law: [`INFERENCE_LANES.md`](./INFERENCE_LANES.md) + [`INFERENCE_CONVERGENCE.md`](./INFERENCE_CONVERGENCE.md)
(convergence layer: EXPAND → CONSIDER → COMPLETE → PROVE → SHIP → ROTATE).

The owner drops one-line ideas and directions here (or says them inline:
`INFERENCE 3 — <idea>`). Agents EXPAND each claimed line into a playable
brief and build it whole. **This is not a queue**: it admits nothing,
prioritizes nothing, and never replaces the program queue or look-then-rotate.
Cap: 20 open lines. Lines older than 60 days untouched are deleted.

## Claim protocol

1. Pick ONE open line. Check no live NOW row or CLAIMED line below names it.
2. Mark it CLAIMED with today's date + your thread label, in the same edit
   that adds your NOW row (exact paths). One idea per agent.
3. EXPAND (§1 of the convergence layer), then run the normal loop.
4. On SHIP: move the line to SHIPPED with the unit id + commit. If the idea
   proved unbuildable, move it to CUT with one causal line (and record
   `--verdict cut --root-reason` so it cannot silently resurrect).

Never claim a line whose paths collide with a live hunk — take the next line.

## INBOX (open)

| # | Date | Idea (owner words) | Status |
|---|---|---|---|
| 001 | 2026-09-17 | Example (delete me): pirates should ransom, not just shoot | OPEN |

## CLAIMED

| # | Date | Idea | Thread | Paths |
|---|---|---|---|---|
| — | — | — | — | — |

## SHIPPED

| # | Idea | Unit id | Commit |
|---|---|---|---|
| — | — | — | — |

## CUT (with cause — do not resurrect without new evidence)

| # | Idea | Cause |
|---|---|---|
| — | — | — |
