# PQ-174.00/.01 — Swarm instrument, and an opener that ends

<!-- LIFETIME: ACTIVE_RECEIPT -->

Landed as `90b60fbb`. The full nine-cell AFTER sweep in this receipt was run at `e5602348`.

## .01 — the opener

Wave 1 asked for 22 kills. The default physics kit reaches kill 15 somewhere between 57 and 90
seconds of a 90-second window, so most bench cells never finished the first wave at all: the mode's
first impression was a wave that does not end.

The opener is now 15 kills, via a wave-1-only margin constant. Live concurrency (10), reinforcement
and hull values are untouched — no HP inflation — survivors still roll into wave 2, and later waves
keep the `20 + 2w` climb and the global cap of 48. `swarmCurveIsSane` learned the same wave-1 margin,
so the new opener is legal *by* the invariant rather than in spite of it; verified sane for waves
1–40.

## The nine cells

One arena (`helios_core`), three kits, three fixed seeds. BEFORE is the recorded sweep at quota 22;
AFTER is a fresh sweep at today's HEAD. Every AFTER trace reports `quotaFromTrace.quota = 15`, so
the runs are measuring the formula this packet actually shipped.

| Kit | Seed | BEFORE (quota 22) | AFTER (quota 15) |
|---|---|---|---|
| `energy_baseline` | 4242 | not cleared (died) | not cleared (died at 31.5 s) |
| `energy_baseline` | 8008 | not cleared (90 s cap) | cleared at 64.5 s |
| `energy_baseline` | 13502 | not cleared (died) | not cleared (90 s cap at 90.0 s) |
| `physics_toolkit` | 4242 | cleared | cleared at 55.6 s |
| `physics_toolkit` | 8008 | not cleared (90 s cap) | not cleared (90 s cap at 90.0 s) |
| `physics_toolkit` | 13502 | not cleared (90 s cap) | cleared at 48.9 s |
| `massline_rig` | 4242 | not cleared (90 s cap) | cleared at 50.0 s |
| `massline_rig` | 8008 | not cleared (90 s cap) | cleared at 77.8 s |
| `massline_rig` | 13502 | cleared | cleared at 55.8 s |

**Wave 1 cleared: 2 of 9 before, 6 of 9 after.** The energy and massline kits — which the handoff
listed as never re-run — are included here, and massline moved the furthest (1 of 3 → 3 of 3).

Two cells that still do not clear got better anyway: `energy_baseline` 13502 used to die and now
survives to the cap, and `energy_baseline` 4242 dies at 31.5 s having taken 14 hostiles, one short of
the 15 it now needs.

### A correction to the commit message

`90b60fbb` says "all three physics seeds now clear wave 1 inside 90 s". That was true of the earlier
three-seed AFTER run at `1ed1cb2f`, but it is **no longer true at HEAD**, and the reason matters:
seed 8008 cleared there at **89.8 s against a 90 s cap** — a 0.2-second margin. The CONTACT
integration (`a3bd740d`) changed contact physics, and that is the same change proven to move the
47-A sim hash; it shifted this knife-edge cell just past the cap. The pacing win is real and holds
at 6 of 9; the "all three physics seeds" phrasing rested on a cell that was never robust. Treat a
sub-second margin against the window as unmeasured, not as a pass.

## .00 — the instrument

Three things the old recordings could not answer are now measured rather than inferred:

| Field | BEFORE | AFTER |
|---|---|---|
| first hostile spawn | 0 of 9 runs | 9 of 9 |
| menu (draft/refit) openings | 0 of 9 runs | 9 of 9 |
| death cause + telegraph | fingerprint only | killer archetype and the telegraph in force |

First-hostile is a bounded once-per-run observation on the cohort walk the bench already performs,
so the instrument does not change the thing it measures. The killed-by receipt now snapshots the
attacker's archetype and whether a telegraph was in force at that tick.

Runs recorded before this instrument existed keep reporting these fields as **null, never zero** —
an absent measurement is not a measurement of zero, and the old sweeps stay honestly blank rather
than being back-filled with a convenient number.

## Limits

- One arena. `lagrange_crucible` and `cinder_sluice` are unmeasured for pacing.
- 90-second window, so every uncleared cell is right-censored: it says "not within 90 s", not "never".
- Headless telemetry. No GPU or headed proof of how the opener *feels*, only when it ends.
- The sweep is memory-hungry: nine back-to-back boots in one process reached ~675 MB and one earlier
  attempt died mid-sweep without writing. This run wrote after every cell and raised the heap ceiling.

Focused tests: `test/swarm-metrics.test.mjs` green. `.02`–`.07` (verbs-win, roles, arenas, bosses,
death story) remain open leaves of PQ-174; `.07` already landed separately.
