<!-- LIFETIME: VOLATILE -->
# Fleet run 2026-10-20 — 40 build-map rows, plan → build → review

Owner instruction: implement 40 rows from `build_map.md` §1C/§N with 3–5 lane agents live at all
times. Each row runs `lane.mjs`: **Claude Opus 5.5** plans (read-only), **OpenCode DeepSeek v4.1
Flash** implements (`opencode/deepseek-v4.1-flash-free` — the `opencode-go` key expired
2026-10-20), **Codex gpt-6.1-sol** reviews (npm Codex 0.163; the bundled 0.130 cannot reach the
model), fix loop up to 3 review rounds. Controller: `devin-fleet-oct20`.

## Rules

1. Workers never run mutating git. The controller alone commits (`git commit -- <paths>`), pushes
   `origin master`, deletes the landed board row, and files the `LANDED_REVIEW` row.
2. Protected: every dirty path not in the row's own manifest (computed live by `lane.mjs`).
   Known foreign sets: `src/systems/{mining,npcJobsRuntime,wingmen}.js`,
   `src/ui/screens/{flightFootage,footageVideoCodec}.js`, `assets/ships/release/render-packages/**`,
   `tools/forge-*.cjs`, `package-lock.json`.
3. Concurrent lanes never share a seam or a file (`missions.js`, `lawSecurity.js`, `traffic.js`,
   `worldOneOffs.js` hunks are scheduled serially).
4. Artifacts per row: `out/R<row>/{plan.md,report.md,files.txt,diff.patch,review-N.md,status.json}`.

## Lanes and rows (40)

| Lane | Seam chain | Rows, in order |
|---|---|---|
| A first hour | stranger-hud → screens-true → front-door-speed | 457, 458, 429, 479, 473, 431 |
| B market + law | market-why → mission-craft → docket → rope-scale | 465, 480, 467, 461, 462, 423, 444, 452 |
| C swarm + feel + bosses | swarm → feel → boss-read | 456, 270, 453, 481, 475, 463, 448 |
| D fight + rope + racing | hostile-hands → rope-world → racing | 391, 392, 393, 390, 394, 395, 472 |
| E long game | works → hull-commit → run-memory | 402, 466, 403, 401, 469, 399, 400 |
| F voice + pulse (fills free slots) | hull-ghost → pulse-voice → sentences → vignettes | 424, 460, 432, 409, 459 |

Not taken this run: 284 (quiet host only), 384/427/428/438 (graphics lane), 412/413 (monolith
splits collide with live seams), 414/415 (`package-lock.json` is foreign-dirty), 454 (integration
lane), 407 (`footageVideoCodec.js` foreign-dirty), SEED rows (not production units).

## Ledger

Statuses: QUEUED / RUNNING / LANDED <commit> / PARKED <why>.
