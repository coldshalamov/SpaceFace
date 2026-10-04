<!-- LIFETIME: ACTIVE_PROGRAM -->
# The quiet-host program — one clean machine, one session, every result has a consumer

Owner, 2026-10-04: the dev box runs agents around the clock, so wall-clock perf reads and
headed captures from it are noise. All clean-machine work — perf captures, soaks, native
acceptances, the demo path — is consolidated here. One dedicated machine gets set up once;
one session runs everything; the results are pushed to the repo and *used*. Capture-only
sittings, freeze-hunting at a historic location, and acceptance ceremonies with no consumer
are not work and are no longer planned anywhere.

This file is the only plan for clean-machine work. Nothing requiring a quiet host is scattered
across the board anymore: board rows point here (§1C rows 61, 62, 66 → QH-4, QH-5, QH-6).

## 1. The consumer law — what makes a capture work

A result may be collected only if it does one of these, with the consumer named before running:

1. **Closes a row** — the ledger/board row it deletes is named (and the row is deleted in the
   same commit as the receipt, win or lose: a clean negative result closes its row too).
2. **Validates a landed fix** — the fix commit and the exact assertion the capture confirms.
3. **Is the before or after half of an optimization made in the same sitting** — named site,
   same focused fixture on both sides; measurement alone closes nothing (D130's law).
4. **Is a baseline the performance program cites** — the committed receipt that will quote it.

Anything else is not collected. "Needs quiet host" is not a work state a row can sit in — it
is this program's job, run in one batch, once the machine exists.

## 2. The session

Run on the dedicated machine, top to bottom, **one probe at a time** — two headed system-Chrome
probes contending for one GPU is what killed the D24 soak attempts F and G. Harnesses
deprioritize themselves (PQ-210.06 law); browser servers must set `SPACEFACE_PLAYER_STORE_DIR=''`
or use `createGameServer` without `playerStoreDir` so the real save drawer is never mounted.
The thin runner does the ordering and the report:

```text
node scripts/quiet-host-session.mjs --list      # steps + consumers
node scripts/quiet-host-session.mjs             # full session, fail-visible
node scripts/quiet-host-session.mjs --only=qh1,qh6
```

| # | Step | Runs | Consumer |
|---|---|---|---|
| QH-1 | D24 renderer-residency soak | `check-release-soak-browser.mjs --cycles=40` with `SF_SOAK_HEAP_SNAPSHOTS=1` | Flat `LoadedRenderPackage`/`JSArrayBufferData` diff **deletes ledger row D24**; a surviving slope names the residual-fix task already listed on that row |
| QH-2 | Career-earnings benchmark timing datum | `check-career-earnings-benchmark.mjs --minutes 30` then `--minutes 90` | The balance asserts are already green; the recorded wall-clock closes **ledger row D85** as a host datum, not a defect |
| QH-3 | Boot media confirm | `tools/cinematic/boot-media-proof.mjs` | If the screencast gap is gone on quiet hardware, **deletes ledger row D131**; if it persists with the same shape, the row reopens against media, not the harness |
| QH-4 | Native acceptance pair (PERF-04 dense PresentationWorld + PERF-07 exact-package Electron) | Packet-driven: `roadmap/active/PQ-038.md`, `PQ-041.md` (bundle → `electron-builder --dir`, paired browser route) | **Closes board rows 61**, which auto-opens row 65 (PQ-042) |
| QH-5 | Corridor-asset perf envelope | `check-pq022-corridor-assets.mjs` + the PQ-022 H3 harness the packet names | **Closes board row 62** |
| QH-6 | The fifteen-minute demo path — **play-and-fix, not a signing ceremony** | `check-crucible-route.mjs` (16/16), then a human plays §5 of DEMO_READINESS: Crucible five rounds → results → one Adventure job → one felt upgrade | Everything that breaks **becomes a ledger row and gets fixed in the sitting** (total-fix mode). The five bars' numbers are recorded as data; no signature is required to close board row 66 — a played path with zero new rows does |
| QH-7 | General playtest block — the bug detector | `probe-runtime-witness.mjs` instrumented runs plus unassisted human play, rotating archetypes and seeds, hours capped (default 3) | **Replaces freeze-hunting.** Findings become ledger rows with repro and evidence. This is the only place recurrence evidence is collected (§4) |
| QH-8 | Quiet-silicon perf baselines for the D130 loop | `probe-smooth-flight.mjs` (open + `--crucible`), `probe-frame-solid.mjs --cpu-profile` | The committed baseline receipt is the reference the **D130 change-loop** diffs against; it is the loop's input, never a deliverable |

Raw captures stay in `.devshots/` (gitignored). What lands in the repo is the receipt: numbers,
verdicts, row deletions, and any baseline tables other sittings will cite.

## 3. Where results go, and who uses them

- **Receipt:** `design/program/roadmap/receipts/QUIET-HOST-SESSION-<date>.md` (template §5) —
  committed the same turn, with every closed row deleted in that same commit.
- **The performance loop (D130):** QH-8 baselines are the "before"; each optimization sitting
  re-runs the same fixture as its "after" on this machine when available, or on the focused
  fixture everywhere.
- **The cloud performance program** (`VM_LANES.md`, branch `vm-drop`, PRs): the VM has no real
  GPU — its measurements are advisory and its product is patches. The quiet-host receipt is what
  its jobs cite as the real-hardware target; local perf work does not wait on VM captures, and
  VM captures are never imported without a consumer from §1.
- **Future sessions:** once the receipt exists, no later sitting re-runs a green step "to see it
  be green" (owner 2026-09-16 capture law stands).

## 4. The general playtest block (QH-7) — and why freeze-hunting is gone

Historic freezes are not reproducible on demand by location, so no sitting is ever dispatched to
"try to make D111 happen near the Nav Beacon." That row is closed (2026-10-04): it was
investigated with 61 instrumented samples and both playable routes 16/16, and the two *real*
hangs its investigation surfaced — the SG02 extreme-spin hang and the environment-size shader
relink — are already fixed. The honest replacements:

- **Broad unassisted play** on the quiet machine (fresh seeds, all archetypes, ordinary routes),
  witness on. Its purpose is to find *new* defects, which become ledger rows with repros.
- **If any freeze happens during play:** at the frozen moment capture
  `window.SF.loop.getDiagnostics()` (original `simulation.closeCauseSite`), the runtime-witness
  report, time-effect requests, and graphics-context state — then write the ledger row from that
  evidence. That is the only recurrence protocol; it costs the play session nothing extra.

## 5. Receipt template

```markdown
# QUIET-HOST-SESSION-<date>
Host: <hardware, OS, GPU> · Tree: <commit, clean?> · Session log: .devshots/quiet-host/<ts>/

| Step | Result (exit) | Number / verdict | Consumer served |
|---|---|---|---|
| QH-1 | | heap diff flat? slope? | D24 <deleted / reopened against X> |
| QH-2 | | 30m s / 90m s | D85 deleted (host datum recorded here) |
| QH-3 | | gap ms or none | D131 <deleted / reopened> |
| QH-4 | | paired claims | rows 61 closed, 65 opened |
| QH-5 | | envelope | row 62 closed |
| QH-6 | | defects found → rows | row 66 closed when no new rows |
| QH-7 | | bugs found → rows | new ledger rows |
| QH-8 | | fps / p95 / top payers | D130 baseline receipt (this file §baselines) |

Closed this commit: <ledger/board row ids>
Baselines: <tables other sittings cite>
```

## 6. Anti-manifest — this program never does

- No headed stills as review proof (owner 2026-09-16 law).
- No dispatching an agent to reproduce a historic freeze at its reported place.
- No capture without a named consumer (§1), and no acceptance cell that is only "run it and file it."
- No parallel headed probes on one GPU (the F+G lesson).
- No re-running an already-green step outside a change-loop.
