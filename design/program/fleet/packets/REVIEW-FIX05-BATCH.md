# REVIEW-FIX05-BATCH — adversarial review of the FIX-05 batch (READ-ONLY, no code edits)

Scope: exactly two commits, both on master now.

- `bb76c66adf` — fleet(FIX-05): Swarm keeps its own glass, the boss bar reads one pooled truth, the
  armory edge dissolves clean. Files: `src/ui/aftermathChoicePrompt.js`, `src/systems/swarmJuice.js`,
  `src/systems/survivalResults.js`, `src/systems/presentationOrchestrator.js`,
  `src/ui/orrery/cruciblePreparationLayouts.js` (ONLY the two FIX-05 hunks — the file also carries
  foreign uncommitted thumbnail work you must ignore), `src/ui/screens/pause.js` (ONLY the
  `pauseStatusLines` hunks — the `Operations` label hunk in the working tree is foreign, ignore it),
  `test/fix05-swarm-leaks-boss-bar.test.mjs` (new), `test/rc-02-iron-maw-boss-score.test.mjs`,
  `test/fix-boss-round-debut.test.mjs`.
- `2f83306430` — build map §38 + three QUEUE rows (documentation only).

Read `git show bb76c66adf` first. Then attack these claims — your job is to FIND HOLES, not to
agree. Every finding needs `file:line` and the exact failure you predict. Do not edit any file; do
not run `git add`/`git commit`; do not run the game or the full gate.

1. **The boss-bar emitter** (`src/systems/swarmJuice.js` `_updateBoss`, `_addBossBody`, the census
   fields). Claim: pooled hull + alive/total emit on every change and the bar never freezes for a
   multi-body wing. Attack: a wing where bodies join AFTER the first scan (reinforcements), a body
   killed between sweeps while another drops below the 0.01 fraction gate in the same tick, the
   `-1` frac path when `hullMax <= 0`, and the `swarm:bossDown` exactly-once guarantee when the
   last body dies during `wave_intro` instead of `active`. Does any path still leave the top-centre
   bar frozen while `survivalHud.js`'s own row moves?
2. **The telemetry move** (`src/systems/survivalResults.js`). Claim: nothing else read
   `run.recentKillerLabels` and `run.telemetry` is a schema-safe home. Verify with a grep across
   `src/` and `test/`: any reader of the old top-level key? Any validator, save path or replay
   codec that whitelists `run.telemetry` differently? Does `validateRunState` accept `telemetry`
   for non-survival runs too, and does the moved ledger still reach `attackerLabel`
   (`src/combat/playerDefeat.js`) on a run that is then saved and restored?
3. **The isSwarmGlass gates** (`aftermathChoicePrompt.js`, `pause.js` `pauseStatusLines`,
   `presentationOrchestrator.js` `_onScenarioBeat`). Read `src/ui/swarmGlass.js`'s definition. 
   Attack: is a non-Swarm mode misgated (Gauntlet, Circuits, phone Swarm, a demo/replay run, the
   crucible draft)? Does `pauseStatusLines`' early return drop information the Adventure pause
   showed and Swarm needs (impact line, save line)? Does blocking ALL `scenario.*` cues in Swarm
   silence something the Pit itself legitimately plays?
4. **The armory masks** (`cruciblePreparationLayouts.js` — only the `@1024` stage rule and the
   cards/reading block after it). Attack: forced-colors and reduced-motion paths (does a mask
   survive `forced-colors: active`?), the ≤760px stand-down (is every stacked branch covered, or
   does the mask leak into a non-scrolling layout between 761–1150px where the reading still
   scrolls?), and the 64px tails (does the extra tail shift the rest-state cut in a way that now
   hides MORE content than before at 720p?).
5. **The tests.** Does `rc-02`'s wave-5 re-point lose a pin the wave-10 location once held (wave 5
   is ALSO the detonator_dart debut round — does anything in the capital-boss flow interact with
   the debut package the old wave 10 never had)? Are the updated deep-course pins (Quiet Choir 60,
   Tendril 80) the same values `swarmBossFor` actually resolves? Is build map §38.2's probed truth
   accurate — spot-check one row yourself with `node -e` against the real planner (read-only).

Evidence you may use: `git show`, `git log`, greps, `node -e` pure-data probes, the existing test
files. Report: numbered findings, each with severity (HIGH = a player-visible or data-loss bug;
MED = wrong behavior in a real edge; LOW = polish/robustness), `file:line`, and a one-line
suggested fix (do not apply it). If a claim survives your attack, say so explicitly — silence is
not acceptance. End with a verdict line: `VERDICT: <commit> CLEAN` or
`VERDICT: <commit> FINDINGS <n HIGH / n MED / n LOW>`.

Receipt: write `.devshots/fleet/runs/REVIEW-FIX05-BATCH.<your-run>/RECEIPT.md` with the findings
and the verdict (the runner names the folder).
