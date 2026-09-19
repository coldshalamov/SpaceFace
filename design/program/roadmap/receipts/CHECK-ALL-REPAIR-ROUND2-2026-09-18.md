# check:all repair, round-2 adoption — 2026-09-18

Adopted the stale `muse-fix-tests` row (round 3, `check:all repair round 3`, last progress 847 min;
round 2 was already committed `65fee8303`, round 3 committed `5672c0f1d`). The only surviving
round-3 worktree artifact was an uncommitted `src/save/saveSystem.js` hunk that **reversed** the
committed round-3 fix; that is handled below. `scripts/check-phase0-slice-contract.mjs` and
`scripts/check-encounter-one-voice.mjs` are clean at HEAD and green.

Evidence runs:

- Full matrix `npm run check:all` (282 commands, 252 pass / 30 fail):
  `scratch/check-ci-report/2026-09-19T03-34-47-392Z/`
- Smoke `npm run check:all:smoke` (27 commands, 22 pass / 5 fail):
  `scratch/check-ci-report/2026-09-19T04-33-33-769Z/`

The tree was under active concurrent mutation during both runs (HEAD advanced from `11553c800` to
`789925f95` mid-run), so a few reds are transient dirty-work artifacts rather than HEAD defects.

## Fixed here

| red | root cause | fix | class |
| --- | --- | --- | --- |
| `check-map-information-depth` (§7 "no-selection Overview must show all four navigation answers", 0 ≠ 4) | **Stale assertion.** Production deliberately withholds the DOM `.gm-nav-row` rows when the canvas cartouche can carry them (galaxyMap.js `_overviewTabHtml`: "repeating them verbatim made the same sentence read twice"). The check still asserted the retired always-on DOM dump. | Rewrote §7 to measure the real two-surface contract: wide window → the four labels are painted on the canvas cartouche AND the panel does not duplicate them; narrow window (canvas < 420 WU, cartouche withheld) → the four DOM rows render as the documented fallback. Stronger, not weakened. | harness bug |
| `check-time-effects` (`loadEnvelope must report success when its destructive error was superseded by a newer route`) | The **dirty** `src/save/saveSystem.js` hunk un-did committed round-3 fix `5672c0f1d`, turning `return result.superseded === true` into `return false`. HEAD passes; the dirty hunk failed a committed contract test. | Restored the committed line (file now matches HEAD exactly — no diff). | foreign regression on an adopted row |

Both repaired checks were run twice (green both times). `check-map-never-lost` was already green and
is untouched.

### Named reds — verified already closed

- **phantom check aliases** — validator over every `npm run <alias>`, `node scripts/*`, and
  `node --test test/*` reference in `package.json`: **0 dangling refs**. Round 2 restored
  `check:sim:profile` and `check:ktx2-worker`; both present.
- **lost slice doc reference** — `check-slice-scope` and `check-phase0-slice-contract` both green
  (they reference the restored `docs/Spec/MASTER_MAKEOVER_PLAN.md`).
- **Path2D harness stub** — both `check-map-never-lost.mjs` and `check-map-information-depth.mjs`
  carry the recording `Path2D` stand-in; both green.

## Residuals ledger (real defects — filed, not fixed outside this lane's files)

`check:all:smoke` is **not green** (22/27). Every smoke red traces to a foreign dirty-work defect or
to host load, none to a file this lane owns:

| red | root cause | evidence |
| --- | --- | --- |
| `47a-live-cold-open`, `first-15-runtime`, `market-first-loop` | **Real defect in a foreign dirty file.** `src/systems/missions.js:1832` calls `this._playerHistoryScore()` — undefined in the uncommitted hunk (imports `offerHistoryTierFor`/`offerHistoryMultiplier` but never adds the method). Throws `[bus] handler error for "mission:offered"` on boot; browser checks fail closed on recorded page errors. No NOW row claims `missions.js`. | smoke logs 2026-09-19T04-33-33-769Z; `git diff -- src/systems/missions.js` |
| `feel-scenarios` | Real feel regression: B5 shove displacement "the displacement clause and the has-not-fired clause must each print (got 1)"; also B2 turn radius (1.06 screen depths > 1.0), B3 seconds-to-cross-depth (0.68 s < 1.2 s), and rope-swing non-deviation. | smoke `feel-scenarios.log` |
| `flight-lab-sim` (inside `check:flight:clean`) | **Host-load noise, not a defect.** Passes alone at `msPerTick = 1.35` (gate < 2.0); fails only under the concurrent matrix. `probe-flight-visual` is a browser probe. | `node scripts/flight-lab-sim.mjs` → 0 |

Full-matrix residuals beyond smoke (all real defects in files this lane does not own):

- **SG-06 cluster** — `check-sg06-ai`, `check-sg06-formation`, `check-sg06-tether-resilience`,
  `check-47a-counterplay`: the canonical `action_dash` escape is not chosen (overload / attached
  Massline / formation overshoot).
- **47-A cluster** — `check-47a-tactics`, `check-47a-live-branch`: `surrender_evidence` not resolved.
- `check-gameplay-core`: killing a lawful patrol must raise heat even when its faction is already
  hostile.
- `check-sg05-runtime`: scenario/tether presentation cue routing (2 of 3 expected cues).
- `check-m1-combat-doctrines`: ownership-slot equality assertion.
- **UI cluster** (likely the concurrent deckplate/HUD lane's dirty work) —
  `check-first-dock-handoff`, `check-localmap-routes`, `check-mission-cargo-loading`,
  `check-recommended-next`, `check-station-tabs`, `check-new-game-layout`,
  `check-depth-program-k1-ui-runtime`, `depth-program-r2-registry-test` (CSS `[hidden]` rule).
- **Asset/build cluster** — `check-parts-manifest`, `check-sg04-release-assets`,
  `check-graphics-asset-receipts`, `check-station-archetype-glb-load`, `check-assets-live`
  (fails on a `HEAD == origin/master` precondition), `check-bundle`
  (`inspection_cutter.glb` provenance mismatch).
- **New runtime defect** from commit `d48da2ac9` (station yard): `resolveRuntimeManifest: missing
  system "stationServices" for init order`.
- **Environment / needs a decision, not a patch** — `check-sg05-branch-policies` (runner timeout),
  `check-bar-mission-readiness` (browser wait timeout), `check-station-tabs` (Windows exit
  `3221226505`), `probe-flight-visual` (browser). `check-ui-budgets` is `baseline:stale` — the UI
  source changed since the baseline was shot; re-capture belongs to the UI lane once its work lands,
  not to a check repair.

## Note on the shared tree

`src/systems/missions.js` and `src/systems/uniqueWrecks.js`-adjacent work is dirty with no live NOW
row and breaks the default route (boot-time `mission:offered` handler error). It is adoptable by
whoever owns the missions lane; this lane did not touch it.
