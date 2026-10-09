# Tally-3 motion-state fallback delta review

Reviewed independently 2026-10-05 at 03:03 UTC. Result: corrected delta reviewed successfully. No remaining blocker found in this bounded scope. This does not replace the prior full review or assert that root-owned production integration is complete.

## Scope and real consumer

Only the post-review state-observation additions in `candidate/src/systems/tally3.js` and `candidate/src/render/tally3Visuals.js`, their correction, and their lifetime/receipt behavior were examined. Production/shared source was read, never edited. Review-generated tests and evidence remain in this directory; the maker separately ported the 12 tests into `candidate/test/tally3-motion-lifetime.test.mjs`.

The actual shared renderer invokes `userData.updateAuthoredMotion(entity, authoredNow, _worldSiteA11y)` with three arguments (`src/render/renderer.js:20147`). The existing composite callback accepts an optional fourth state but receives none (`src/render/authoredMotion.js:186`). Thus state fallback solves a real consumer mismatch. The inspected shared composite still has no Tally create/update/dispose join, consistent with the explicitly separate integration scope. That join must drive Tally state before evaluating controllers and retire the Tally driver when its package detaches. These tests exercise the real bank and three-argument Tally driver, not a completed production render-package join.

## Found and corrected

The original WeakMap binding checked exact entity identity and occupant generation but did not revoke a runtime that was destroyed, suspended, reset, or rejected during a duplicate census. Initial expanded tests were 5/12 passing. In particular, the old driver still requested `withdraw` after runtime destruction and `assess` after duplicate-assessor adoption had left `runtime.getActor()` null. NewGame retained a stale lookup too, although its existing dead-actor guard already prevented animation.

The maker added a per-runtime owner token and centralized bind/unbind. The lookup now validates the live runtime lease as well as the physical occupant. Adoption revokes before census and binds only after accepted identity/integrity checks. Restore, deserialize, NewGame, death/removal and destroy revoke the old binding. A retiring predecessor cannot erase its successor's newer binding. These changes are confined to presentation observation, with no new game-state writer.

## Independent final verification

- `motion-delta-final.tap`: 12/12 passed against corrected source
- `presentation-lifecycle-final.tap`: 14/14 existing presentation/lifecycle tests passed, including native scalar Continue
- `shipping-test-final.tap`: the exact shipping test port passes; the port differs only in import and asset paths

Coverage: materialized binding; assessment on the authored clock using raw sim-time elapsed; real public delivery/economy receipt stamp; missing or mismatched receipt and unreturned source rejection; removed object; same-ID replacement; reused same-object generation; actor death; NewGame fresh occupant; public Save/Continue accepted receipt adoption; old renderer owner rejection after adoption; runtime retirement; restoration suspension; deserialize/re-adopt; duplicate actor and duplicate crate censuses; successor binding surviving old-owner teardown.

The stamp positive control uses the actual `bindAuthoredMotion` bank and the public Hail/return/confirm path. It checks visible transform movement only after an accepted economy settlement exists. The Save control restores a real accepted receipt and rejects both the old entity object and an old driver presented with the new occupant. No fabricated receipt is used as the positive control.

## Exact corrected files

`reviewed-files.sha256` pins these three files:

- `candidate/src/systems/tally3.js`: `d191a6d85365b911b3e32becdc71ea0d7cc74c8eb104557d9109283c8760301a`
- `candidate/src/render/tally3Visuals.js`: `4c8c5cb787c523139bee3794180f8f4ea6e92177a1b6f3965c8450664af55a91`
- `candidate/test/tally3-motion-lifetime.test.mjs`: `1af59009cc9ccdc28bb3ea90c986413788701e5e751175288671760fa8cd7107`

The original delta files are preserved by the maker in `pre-correction/`. This review does not reopen art, source-spine geometry, cargo/heat transactions, package publication, game-camera acceptance or quiet-host performance.
