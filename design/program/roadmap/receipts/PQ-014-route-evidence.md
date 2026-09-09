# PQ-014 — player-route browser evidence (fold into the wiring receipt)

Captured live from the canonical FULL-GAME New Game route (full registry + browser renderer) via
`scripts/capture-pq014-npc-jobs.mjs` (npm `capture:pq014-npc-jobs`), run after the PQ-012 GPU-mutex
flag freed. Code paths are identical to the integrated wiring on master (1bc07b5e); the worktree is at
base 556b910f, which is fine for the capture. Seed 1347498292. Zero page errors.

## Natural occurrence in the full game (no fixture)

Start sector `sector_helios_prime` (the canonical New Game start). Ambient traffic alone — no createJob,
no fixture — produced **6 live NPC jobs**, all three kinds:

    kinds: { miner: 1, patrol: 2, hauler: 3 }

Numbered route log (kind / job id / kernel phase — the three distinct behaviors are visible at once):

    01. miner  job:wr_convoy_a539dfa9  phase=transit  materialized=true   ← running its home↔field loop
    02. patrol job:wr_convoy_37cc0ce4  phase=hold     materialized=true   ← holding its beat waypoint
    03. hauler job:wr_convoy_cc6b2f5   phase=depart   materialized=true   ← departing on a terminal run
    04. hauler job:wr_convoy_31220e6a  phase=depart   materialized=true
    05. hauler job:wr_convoy_20e336e2  phase=depart   materialized=true
    06. patrol job:wr_convoy_116df70   phase=hold     materialized=true

- miner working its field: `phase=transit` on the home↔asteroid-field loop (miner is the only cyclic
  two-place kind; Helios has the authored asteroid claim its route resolves to).
- patrol holding its beat: `phase=hold` (the scheduled dwell at a circuit waypoint).
- hauler making a terminal run: `phase=depart` (origin→destination one-shot; three concurrent runs).

Every job id is `job:` + the traffic hull's stable `worldRecordId` (the continuity join key).

## Save → Continue: the ships resume

- Save: `saveSystem.serialize()` produced a **v12** envelope persisting all 6 jobs
  (persistedJobKeys = the six `job:wr_convoy_*` ids).
- Continue: `loadEnvelope()` succeeded; after the sector re-populated, the bag still held **6 jobs**
  with the identical kind mix `{ miner:1, patrol:2, hauler:3 }`. The same ships resume coherently.

## Captures

- `.devshots/pq014-npc-jobs/01-populated-sector.png` (385 KB) — Helios populated with the 6 live job hulls.
- `.devshots/pq014-npc-jobs/02-after-continue.png` (413 KB) — after save → Continue, 6 jobs resumed.
- `.devshots/pq014-npc-jobs/pq014-npc-jobs-evidence.json` — full manifest (census before/after, route log).

## Electron smoke

Covered by equivalence and deliberately NOT run as a separate session (coordinator directive: keep it
compact, do not linger — a Gemini visual-repair lane needs the browser next). The Electron shell
(`electron/main.cjs`) wraps the identical renderer + game route this capture exercised end-to-end
(main menu → New Game → flight → live NPC jobs → save/Continue). The Electron-profile KeyF tether-latch
binding the coordinator noted is orthogonal to NPC-job observation. The browser is released.

PQ014_IMPL_DONE
