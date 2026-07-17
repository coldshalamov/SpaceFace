# G_CLAIM_HONESTY_DUAL — dual-platform primaryAcceptance residual honesty

**Tip at write:** post-`fcd30fa6` claim-honesty landing  
**Owning gate:** `npm run check:campaign-claim-honesty` + claim surface rewrite via `compile:campaign-claim`  
**Classification:** HARNESS/claim-surface (REAL product residual preserved, not closed)

## What changed

1. **`scripts/lib/campaignClaimHonesty.mjs`** — pure fail-closed helpers:
   - `mergeGt1Residuals` concatenates `residuals` + `productResiduals` (empty `[]` no longer hides product residuals)
   - `evaluateDualPlatformPrimaryAcceptance` requires Electron exit 0 **and** `fullSpinePass` **and** `supporting===false` **and** `productReadyUnassisted===true` **and** `primary===true` **and** no REAL `electron-dual-platform` residual
   - `buildBrowserElectronRoutesLog` emits an explicit dual-platform residual surface (not a silent New Game copy)

2. **`scripts/compile-campaign-claim.mjs`** — uses helpers; platform-limit prints merged + route + product residual arrays; DONE_STAMPS / status board stamp **RESIDUAL** when product flags fail.

3. **`test/campaign-claim-honesty.test.mjs`** + **`npm run check:campaign-claim-honesty`** — drives shipped helpers against live `.devshots/depth-program/gt1-continuous.json`.

4. **`COMPILE_SKIP_GATES=1`** — optional rewrite of claim surfaces from prior gate exits + live JSON (does not invent green).

## Why dual remains RESIDUAL

Live `gt1-continuous.json` (Tier-A continuous full spine green):

| Flag | Value |
|---|---|
| fullSpinePass | true |
| supporting | false |
| primary | **false** |
| productReadyUnassisted | **false** |
| productResiduals | electron-dual-platform:**REAL** |
| electron:new-game | exit 0 (authoring floor only) |

Electron New Game green is **not** dual-platform golden-thread multi-seed (≥3 wrecks + ≥2 encounters on browser+Electron). Plan AC2 is first-hour recovery/Helios/HUD; dual-platform GT is frozen residual (Fable W4 / AC5 documentation path).

## Evidence

| Surface | Path |
|---|---|
| Unit test log | `{SCRATCH}/campaign-claim-honesty-unit.log` |
| platform-limit | `{SCRATCH}/platform-limit.log` → `dualPlatformPrimaryAcceptance=RESIDUAL` + productResiduals REAL |
| browser-electron-routes | `{SCRATCH}/browser-electron-routes.log` (residual surface, not NG-only identity) |
| cold-final | `{SCRATCH}/cold-final.log` → dual reasons + merged residuals |
| DONE_STAMPS | `docs/evidence/orchestration/returns/DONE_STAMPS.md` → Electron dual **RESIDUAL** |
| Status board | `docs/evidence/orchestration/03_STATUS_BOARD.md` → dual **RESIDUAL** |

## PLAN DRIFT

**none** — plan AC2 is first-hour checks; AC5 allows gallery `supporting:true` and Electron residual classification. This fix restores claim honesty; it does not claim dual-platform primaryAcceptance DONE.

## Residual (still open)

- Electron dual-platform golden-thread primaryAcceptance / productReadyUnassisted Tier-B continuous
- Gallery supporting capture (browser 42 shots) — not primary dual-platform
