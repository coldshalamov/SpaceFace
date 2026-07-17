# Packet: Codex claim-honesty review (fail-closed)

**Worktree:** SpaceFace-orch-codex-claim-honesty  
**Branch:** orch/codex-claim-honesty  
**Spine tip baseline:** fcd30fa6 + honesty landing  

## Task
Review and harden dual-platform claim honesty. Spine may already contain:

- `scripts/lib/campaignClaimHonesty.mjs`
- `scripts/compile-campaign-claim.mjs` wired to helpers
- `test/campaign-claim-honesty.test.mjs`
- `npm run check:campaign-claim-honesty`

## Must verify
1. dualPlatformPrimaryAcceptance is RESIDUAL when live gt1-continuous has productReadyUnassisted=false OR primary=false OR product residual electron-dual-platform:REAL
2. empty residuals:[] does not hide productResiduals in platform-limit
3. browser-electron-routes.log is not a silent copy of electron-new-game.log
4. Unit tests green: `npm run check:campaign-claim-honesty`
5. Optional: COMPILE_SKIP_GATES=1 rewrite surfaces without re-running all gates

## Do not
- Flip productReadyUnassisted/primary to true without real Electron dual-platform GT path
- Touch graphics peer assets/thrusters/materials
- Claim dual-platform DONE

## Return
Write `docs/evidence/orchestration/returns/C_CLAIM_HONESTY_REVIEW.md` with pass/fail and any extra edge-case tests you add.
