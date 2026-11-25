# CAM-REVIEW-ADV-OPENING-1 — adversarial review

READ-ONLY review packet. Do not edit any tracked file. Do not commit. Do not boot the game. Write only your receipt in the assigned run directory.

Review the uncommitted CAM-ADV-OPENING-1 working-tree changes against:
- `design/program/fleet/packets/CAM-ADV-OPENING-1.md`
- `.devshots/fleet/runs/CAM-ADV-OPENING-1.neon2.2026-11-24T23-34-10/RECEIPT.md`
- the player-facing goal: the authored opening loose-rock throw must not brand the player a cargo thief, while real wanted/crime behavior outside that opening beat must still work.

Changed files expected: `src/systems/faction_vael.js`, `src/systems/heat.js`, `src/systems/lawSecurity.js`, `src/systems/story.js`, `src/ui/hud.js`, `src/ui/impoundPayPrompt.js`, `src/ui/sectorLawPresenter.js`, `src/ui/station/stationDepartureModel.js`, `src/ui/wantedReason.js`, plus focused tests. Beware that `src/ui/orrery/helpLayouts.js`, `src/ui/orrery/newGameLayouts.js`, `src/ui/screens/help.js`, `src/ui/screens/newGame.js`, and `test/cam-ui-truth-1.test.mjs` belong to a different active lane and are out of scope.

Attack the implementation. Look for broad exemptions that silence real law response, opening checks keyed to brittle state, save/replay/order dependence, incorrect heat decay/zone semantics, wording that lies in edge cases, unwanted suppression of story/vael content outside the opening, HUD regressions, and tests that merely mirror implementation trivia.

Run only focused read-only tests if useful; do not run the full suite or boot the game. Verdict must be ACCEPT or REJECT with numbered findings ranked by severity. If rejecting, give exact required fixes and evidence.
