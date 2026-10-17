# Task BM4 — demo defect D201: UI matrix sample/preparation coverage (close the nine gaps)

Read first: `AGENTS.md`, `design/frontend/ORRERY.md`, and the ledger row D201 in
`design/program/DEMO_READINESS_2026-09-20.md` §6.

## The defect

The integrated frozen phone capture produces **32/40 screens and 31 scoped budget rows**. Nine
gaps: five catalog entries without routes, a comms timeout, an Asteroid Works preparation, a base
timeout, and Chart Galaxy without samples. Evidence:
`.devshots/oct16-phone-integrated-ui-matrix/`, `.devshots/oct16-phone-integrated-ui-budgets.json`,
`.devshots/source-baselines/oct16-phone-integrated-ui.json`. The row's law: "Repair affected
preparations/samples; these are coverage failures until a player defect is established."

## Your job

1. Read the evidence directory and the capture harness (the ui-matrix scripts under `scripts/`)
   to identify, by name, each of the nine failing preparations/samples and why each fails
   (missing route, timeout, missing preparation, no samples).
2. Fix the harness-side causes: add the missing routes/preparations, fix timeouts, make samples
   cover Chart Galaxy. **Do not change game code to make a sample pass** unless the sample
   exposes a real defect — if you believe it does, report it instead of fixing it.
3. Run the affected capture subset locally to verify the preparations now produce samples.
   Headed capture on this GPU machine is allowed. If a recapture of the full matrix is too heavy
   for this sitting, run the affected entries and say exactly what was and was not recaptured.
4. Respect the row's recapture law: the full-matrix recapture is justified here because D202's
   typography changes land in the same campaign (a coherent source change) — note it in your
   report so the orchestrator can sequence the full recapture after D202 lands.

## Hard constraints

- No `git add/commit/stash/checkout/restore/reset`. Touch only `scripts/**` capture-harness files
  and, if a preparation needs a route registered, the minimal manifest/catalog entry it reads —
  not game logic.
- Do NOT touch the foreign-dirty paths listed in `_constraints-codex.md` (same list applies),
  nor `src/ui/**`/`styles/**` typography (another worker owns that right now).

## Deliverable (final message)

- The nine gaps, each with root cause and what you changed.
- Verification: which capture entries now pass, run command + output summary.
- Anything you found that looks like a real player defect (report only).
