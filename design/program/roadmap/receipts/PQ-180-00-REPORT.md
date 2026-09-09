<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-180.00 — The surface manifest, measured from the running game

```text
DONE  PQ-180.00 — the grammar matrix is now measured from the running game on the real GPU for 31 of its 40 surfaces (the floor is 30), it fails every surface below the floor, and the committed baseline is that measured run, not a static reading.
WHAT I FOUND     The manifest and the matrix script existed, but the committed baseline was a static run in which no surface had ever been opened (every runtime cell "unproven"), and the headed pass had been blocked by two probe defects — screens that ignored Escape and radial menus that never opened — which the last frontend commit cleared.
WHAT I CHANGED   Nothing in the game. One measured pass, on the host GPU, with the observation record written from that same pass, so the check can now say which reds are new against a run that actually opened the screens.
WHAT YOU WILL FEEL   Nothing in play. What changes is that "the frontend definition of done" is a table filled from the real game: which screens open, at three widths, in fake-long text, in high contrast, with the smallest font and the DOM weight of each, and who owns every red.
THE NUMBERS      surfaces measured | 0 | 31 of 40 | ≥ 30 · opened on the public route | 0 | 19 | (the rest open through fixtures, as the manifest admits) · surfaces below the floor | 40 | 40 | every red owned · measurements over the 5 s budget | — | 22 (radial menus 20–24 s) | ≤ 5 s
THE FRAMES       none — this unit has no player-felt change; the reference frames are PQ-180.03's leaf.
NEXT             PQ-180.01 the floor, written
```

## The run

`node scripts/check-ui-grammar-matrix.mjs --headed --json=.devshots/ui-grammar/matrix-headed.json`,
renderer `headed Chromium (host GPU)`, one boot, the manifest's own route order (key routes, then
fixtures, docking late, destructive last).

| | |
|---|---|
| surfaces in the manifest | 40 (34 real candidates) |
| measured from the running game | **31** |
| opened on the public route (no fixture) | 19 |
| not measured | 9: `comms-radial`, `credits`, `statistics`, `photo-mode`, `crucible-lab`, `asteroid-works`, `base`, `localmap-legacy`, `starmap-legacy` |
| surfaces below the floor | 40 of 40 (the check exits 1, as it must — the matrix is the frontend queue) |
| measurements over the 5 s budget | 22, worst `comms-radial` 24.3 s, `asteroid-works` 20.0 s (a screen that takes twenty seconds to open is a finding, not a harness allowance) |

Red cells by owner, from the run's own table:

| owner | red cells |
|---|---|
| PQ-180 .00 (never-opened / unproven runtime rules on the 9 unmeasured surfaces, and rules no seam can measure yet) | 533 |
| PQ-162 station screens | 40 |
| PQ-183 entity links | 40 |
| PQ-184 UI frame timing (no published UI frame-time seam; measuring it by calling refresh would change what it measures) | 40 |
| PQ-180 .02 ownership and order | 24 |
| PQ-181 meta shell | 20 |
| PQ-130 Asteroid Works screens | 16 |
| PQ-182 Crucible screens | 16 |
| PQ-180 .03 reference frames | 13 |
| PQ-168 chart | 12 |

Against the static baseline the run moved 100+ cells from `unproven` to a measured `green`
(type floor, DOM budget, safe frame, pseudo-loc, tabular numerals on the station, Crucible and
automation screens), and `crucible-door` / `automation` from `red` to `green` on reachability.

## The baseline

`test/ui-grammar-baseline.json` is rewritten by the same command with `--update-baseline`: an
observation record from a measured, headed run (provenance says so), never an allowance — the
check still exits non-zero on any red, and `test/ui-grammar-matrix.test.mjs` pins that a
baseline can never turn a failing run green.

## What this does not claim

- Nine surfaces still never open under the probe (the radials time out at 20 s; the legacy maps,
  credits, statistics, photo mode, the Crucible lab and Asteroid Works have no working opener). They
  stay red on reachability with PQ-180 .00 as the owner of the opener, which is honest: the next
  leaf on this packet is exactly those openers, not a wider allowance.
- The check is deliberately not in any gate yet: a gate that is red on arrival teaches agents to
  ignore it (the handoff's ruling); PQ-180.01 writes the floor and PQ-180.02 assigns every red.
