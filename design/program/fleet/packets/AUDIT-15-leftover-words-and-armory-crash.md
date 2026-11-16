# AUDIT-15 — Leftover long lines, the localization catalog, and an Armory crash

**Lane 3.** Read `C:\Users\93rob\AppData\Local\Temp\praudit\FIX-BRIEF.md` first (rules + the voice
bar: a spoken line ≤ 8 words in the speaker's voice; design/game/16 and 20 are the voice reference).

## 1. Salvage crew greetings
`src/features/salvageOutfits/catalog.js` — the crews' greeting lines are still 12-18 words. Cut each
to ≤ 8 words, keeping who the crew is (Keel, Latchkey, etc. — read the file). Update exact-string
test expectations (never delete an assertion). Commit `fix(AUDIT-15a): ...`.

## 2. Localization catalog is stale
Two voice passes (commits a82e2cfd7a and 8e704db6df) changed player-facing strings without
regenerating the generated localization catalog. Find its generator (grep `localization` in
package.json scripts and scripts/; the catalog lives under src/localization/ or assets/), regenerate,
review that the diff is only those strings, run its check. Commit `fix(AUDIT-15b): ...`.

## 3. Armory screen crash
Five tests crash with `this._briefing.hidden` at `src/ui/screens/crucibleDraft.js` ~:1535:
`test/first-swarm-intermission.test.mjs` (1 case) and `test/swarm-shop-forecast.test.mjs` (4 cases).
Find out whether this is a real runtime bug (can `_briefing` be null on the real Armory route — e.g.
a lifecycle where update runs before mount or after dispose?) or a test fixture that no longer mounts
what the screen needs. Use `git log -L` on those lines to find the commit that introduced it and
check whether these tests passed at commit 8ef4225cd0 (`git show 8ef4225cd0:<file>` to compare).
Fix the root cause in the right place: a real null path gets a guard at the lifecycle seam that
explains it; a stale fixture gets the fixture updated to mount like the real screen. Red then green.
Commit `fix(AUDIT-15c): ...`.

Receipt: per item, files, commit, test counts, and for 3 the evidence for "real bug" vs "stale test".
