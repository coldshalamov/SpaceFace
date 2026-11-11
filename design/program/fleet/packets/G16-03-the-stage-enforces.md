# G16-03 — The Stage enforces: one at a time, for real

**Lane 2.** Follows G16-01 (72c45b9f, + lead-review 5ba27322) and G16-02 (deaae6ca). Two reviews found the
Stage is mostly a set of containers: its rules are not enforced for the hosts that produce most popups.

## Defects to fix (from `design/program/fleet/reviews/2026-11-11-38b31504.md` and the G16-01 lead review)
1. **Native alerts bypass the one-visible FIFO:** raise two information alerts in a row → both show, newest
   first. Alerts must go through the Stage banner slot's queue: one visible, priority danger > warning > info
   (`alerts.js` `SEV_RANK`), FIFO within a priority, a later one waits (or replaces by priority).
2. **`stage.show()` had no callers for the four hosts** (alerts, toasts, promptDeck, screenManager): route
   each host's transient items through `stage.show()` so the slot rules apply (toasts: at most 3 in the feed,
   oldest out).
3. **The prompt slot's seat is bottom-centre but the real prompt deck sits upper-right** — make the slot's
   seat where the deck actually is (pick one, update the other, keep the deck's current on-screen position).
4. **A dialog is not held while a full screen is open** — a centre dialog raised while a station/menu screen
   is open waits until the screen closes.

## Then
`node scripts/check-ui-budgets.mjs` is stale (stage.js and the migrations moved). Re-baseline **once**, at the
end, through the lock: `node scripts/fleet/game-lock.mjs run -- npm run capture:ui-matrix -- --budgets-out`
(the failure line names the exact command — use it), rerun the check, commit only the files it rewrites.

## Checks
`test/stage.test.mjs` cases for each defect (real hosts, real payloads); the tests of each host you touch;
a look through the lock with `scripts/fleet/looks/context-wheel.mjs` in a fight — describe the notices and
banners you see. Commits: one per defect, then `fleet(G16-03): UI budgets re-baselined after the Stage`.
