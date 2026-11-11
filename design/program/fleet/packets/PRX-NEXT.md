# PRX-NEXT — Finish one leftover PR from the PR-expansion handoff (repeatable)

**Tier:** D. **Size:** small to medium. Every run finishes ONE packet row.

A previous orchestrator reviewed 74 open pull requests (#921–#998) and left a table of remaining
packets with full specs. Its state lives in `.dev/pr-expansion/` (git-ignored, on this machine only).

## Read first
- `.dev/pr-expansion/HANDOFF.md` — all of it. Its "Hard rules", "Push recipe" and "Known landmines"
  sections override this repo's fleet protocol **only** for pushing to that PR's own branch.
- `.dev/pr-expansion/LEDGER.md` — rows already done. Take the first packet row in HANDOFF's
  "Every remaining packet" table that LEDGER does not list as pushed. Highest value first if marked
  ("WAVE-20 THEFT + regent score (top priority)", "MILL DRESSING (highest value)", "live bug" rows).
- the matching `review/<range>.md` — that row's spec (STATE / DEFECTS / INCREMENT / VERIFY).

## Rules that keep the machine safe
- Work only inside `.dev/pr-expansion/work/<n>/`. **Never delete or move any `work/` directory**:
  each holds a `node_modules` junction, and deleting a junction can wipe the real `node_modules`.
- Never switch branches or touch the main checkout's files.
- Push only with the recipe in HANDOFF.md (`git ls-remote` the live head immediately before; `prt.mjs
  push-tree`). Never force-push. One PR per run.
- Any `src/ui/**` change: recompute the UI budget digest exactly as HANDOFF.md says.

## Done when
The PR's VERIFY items pass inside its work dir, the push landed (paste the new remote sha), and you
appended one line to `.dev/pr-expansion/LEDGER.md`: `<n> pushed <sha> <one sentence>`.
