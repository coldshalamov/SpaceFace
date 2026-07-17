# F_CLAIM_HONESTY_RATIFY — dual-platform primaryAcceptance stays RESIDUAL

**Worktree:** SpaceFace-orch-codex-claim-honesty (branch `orch/codex-claim-honesty`)
**Tip at write:** `a2513744` (fail-closed dual-platform primaryAcceptance honesty)
**Scope:** documentation-only ratification. No code, gates, or claim surfaces changed.

## Ruling

**RATIFIED — dual-platform `primaryAcceptance` must remain `RESIDUAL`** for as long as
the live continuous aggregate reports `productReadyUnassisted=false` **or** carries the
product residual `electron-dual-platform:REAL`. Electron New Game exit 0 plus Tier-A
continuous full-spine green is an authoring-floor probe, never a dual-platform
golden-thread claim.

## Evidence base

### 1. Shipped helper is fail-closed (`scripts/lib/campaignClaimHonesty.mjs`)

`evaluateDualPlatformPrimaryAcceptance` returns `DONE` only when **all** of the
following hold, and pushes a named reason for every miss (claim is `RESIDUAL` if
`reasons.length > 0`):

- `electronExit === 0` (authoring floor)
- `fullSpinePass === true` and `supporting !== true`
- `productReadyUnassisted === true`
- `primary === true`
- no merged residual matching `electron-dual-platform` with `failureClass` `REAL`
  (`hasElectronDualPlatformRealResidual`)

`mergeGt1Residuals` concatenates `residuals` + `productResiduals` explicitly, so an
empty `residuals: []` (truthy in JS) can no longer drop `productResiduals` the way an
`a || b` merge would. `buildBrowserElectronRoutesLog` emits an explicit residual
surface headed "NOT a dual-platform golden-thread multi-seed sample unless
claim=DONE" — it is structurally incapable of being a silent copy of
`electron-new-game.log`.

### 2. Live product truth at this tip

The live `.devshots/depth-program/gt1-continuous.json` is **not present in this
worktree** — `.devshots/` evidence artifacts are untracked and do not propagate to
orchestration worktrees (known preview-env behavior). Its values at the honesty
landing are recorded by the compiler-generated status board
(`docs/evidence/orchestration/03_STATUS_BOARD.md`, tip `fcd30fa6`) and
`returns/G_CLAIM_HONESTY_DUAL.md`:

| Flag | Value |
|---|---|
| fullSpinePass | true |
| supporting | false |
| primary | **false** |
| productReadyUnassisted | **false** |
| productResiduals | `electron-dual-platform` : **REAL** |
| electron:new-game | exit 0 (residual probe only) |

With `productReadyUnassisted=false`, `primary=false`, and the REAL
`electron-dual-platform` product residual, the shipped evaluator produces at least
three independent reasons — the claim is `RESIDUAL` three times over, and flipping
any single flag is insufficient to change it. The status board accordingly stamps
`dualPlatformPrimaryAcceptance | RESIDUAL`.

### 3. Test pin (`test/campaign-claim-honesty.test.mjs`)

The unit gate (`npm run check:campaign-claim-honesty`) pins exactly this ruling
against the live JSON: it asserts `productReadyUnassisted=false`, `primary=false`,
non-empty `productResiduals`, evaluates to `RESIDUAL` with a
`productReadyUnassisted` reason, and asserts `hasElectronDualPlatformRealResidual`
on the merged set. It also pins DONE-only-when-all-green, REAL-residual-blocks-DONE
even with green flags, electron-red-blocks-DONE, and forbids the
`residuals || productResiduals` merge in the compiler source.

**Worktree caveat:** the live-JSON-driven assertions cannot execute in *this*
worktree because the untracked `.devshots/depth-program/gt1-continuous.json` is
absent here (the test's `readFileSync` of that path throws). This is an evidence-
propagation limitation of orchestration worktrees, not a red on the honesty logic;
the gate runs against the live artifact in the spine checkout. This ratification is
therefore grounded in the helper/test/compiler **source** plus the compiler-written
surfaces above, not a fresh local gate run.

## AC2 first-hour is a separate axis — confirmed

AC2 (first-hour: `m3-recovery`, `m1-helios`, `nav-hud`) is green (all exit 0 on the
status board) and is **independent** of the dual-platform claim:

- AC2 gates carry their own AC tag on the compiler gate table; dual-platform
  `primaryAcceptance` sits under the AC5-evidence / residual-probe rows.
- AC2 green does **not** lift the dual-platform residual — the evaluator never reads
  AC2 gate exits.
- Conversely, the dual-platform `RESIDUAL` stamp does **not** impugn AC2:
  first-hour recovery/Helios/HUD acceptance stands on its own gates.

Per `G_CLAIM_HONESTY_DUAL.md`, plan AC2 is the first-hour checks and AC5 allows the
gallery `supporting:true` capture plus the Electron residual classification —
**PLAN DRIFT: none**.

## What DONE would require (unchanged product bar)

- Browser golden-thread multi-seed sample: ≥3 unique wrecks + ≥2 encounters, unassisted
- Electron golden-thread multi-seed sample of the same content class (not New Game only)
- `productReadyUnassisted=true` **and** `primary=true` on the continuous aggregate
- No REAL `electron-dual-platform` product residual

Until a real Electron dual-platform golden-thread path produces those flags, any
surface stamping dual-platform `primaryAcceptance=DONE` is dishonest and must be
treated as a claim-compiler regression.
