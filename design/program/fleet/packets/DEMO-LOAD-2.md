# DEMO-LOAD-2 — the loading detail line never shows scrambled glyphs

**For:** a builder agent. Commit your own files.

The honest measurement (`.devshots/fleet/runs/DEMO-GATE-1.devin3.2026-11-24T03-40-42/RECEIPT.md`)
saw the Swarm loading screen's detail line (added by DEMO-LOAD-1: real sub-progress like
"programs — n of m") show scrambled glyph text such as `Placin\ 9▘/ 0▟89/▘2 / ▟ 7▞ #` — probably a
decrypt/scramble text effect applied to a line that changes every few hundred ms, so it is always
mid-scramble. A stranger reads it as a glitch. Find the effect (src/ui/loadingPresenter.js and the
text-effect helper it uses) and show the detail line as plain text (a quiet fade is fine; no
scramble). Check with `node scripts/ui-bench.mjs --shot=loading-swarm --viewports=1280x720 --out=.devshots/fleet/load2`
and the probe's report.json loading samples. Focused tests.

## Rules
Before editing a file run `git diff -- <file>`; if it has changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after. Never
git add -A, reset, stash, restore or checkout.
