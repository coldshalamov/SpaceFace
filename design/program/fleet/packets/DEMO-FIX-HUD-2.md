# DEMO-FIX-HUD-2 — the flight HUD's one-voice seat stops hiding standing warnings and prompts

**For:** a builder agent (code, exact instructions). **Kind:** bug fixes found by an independent
review, each with evidence. Verify each against the code first, then fix it. Commit your own files.

SpaceFace's flight HUD lets only one "voice" speak at a time (src/ui/hudAttention.js resolveVoiceSeat,
src/ui/hud.js seatFlightVoice, styles/hud.css ~330-344 hides the yielded ones). The Swarm demo's late
rounds almost always have HULL CRITICAL lit, so these bugs hit the demo.

1. **Standing lamps are not voices.** WANTED (hud.js ~5392/5398), HULL CRITICAL (~5933, cleared only
   above 30% hull), MISSILE LOCK (alerts.js ~727) and bingo fuel (~5961) are raised with ttl Infinity
   as `.sf-alert--danger`. While one is lit, seatFlightVoice takes the 'danger' seat and the CSS hides
   the dock prompt, the visor dock guide, every status pill, speaker cards, the banner line and every
   receipt toast, and receipts keep expiring unseen (toasts.js ~502 `if (age > rec.ttl) dismiss(rec)`).
   Fix: in `alerts.raise`, tag records with ttl === Infinity with class `sf-alert--lamp`.
   seatFlightVoice must not count a lamp as 'danger'; the yield CSS must never hide a lamp nor let a
   lamp hide anything. Only timed danger announcements (SHIELDS DOWN, OUT OF FUEL, subsystem down)
   take the danger seat. In toasts.js, a toast hidden by a yield does not age: add the yielded time
   to its birth time (or pause its clock) so it shows when the seat frees.
   A warning tag (FLYBY etc.) currently outranks danger (VOICE_SEAT_ORDER ['deck','tell','danger',...]);
   keep that order, but a LAMP is always visible regardless of tags.
2. **Stale yields after the HUD hides.** `body[data-sf-voice-yields]` is recomputed only while the
   flight HUD ticks; when it hides (docked, pause, menus, Run Over) the last value sticks and hides
   toasts/speaker cards that arrive there. Fix: in `tickHidden` (hud.js ~7377), or on the
   hudVisible->false edge, remove the attribute and reset `lastVoiceYields` to ''.
3. **Key caps from prose.** hud.js ~1411 `TRACKER_KEY_SUFFIX` turns ANY trailing parenthetical of 16
   chars or fewer into a key cap: 'Install a drill inside a rock (1/3)' shows a cap '1/3' and
   '(Field Build)' a cap 'Field Build'. Fix: only match real key tokens, e.g.
   `/^(.*?)[.\s]*\(((?:[A-Z0-9]|F\d{1,2}|RMB|LMB|MMB|Space|Tab|Shift|Ctrl|Alt|Enter|Esc))\)\s*$/`.
4. **Threat word dropped.** targetPanel.js ~1387 `classSaysTier` drops the threat word whenever the
   class text contains it ('Light ship' suppresses LIGHT), leaving a bare '✲ 2'. Fix: drop it only
   on an exact tier/class match; otherwise always print it.
5. **Pack tag written twice per pass.** threatHalo.js ~728/745 `applyEdgeTag`: the seated arrow writes
   the single word, then the merge writes the pack text over it, every 30 Hz pass (the cache never
   hits). Fix: two passes — seat and count merges first, then write each seated tag's final text once.
   NOTE `src/ui/threatHalo.js` carries another session's uncommitted hunk importing the untracked
   `src/ui/contactCensus.js`: use own-commit (below) so that hunk stays uncommitted.

## Tests and look
Focused tests of the files you touch (`grep -rln "<file stem>" test`). A test that pins the old
behaviour gets the new rule in its message ("one-voice seat: lamps are not voices, demo review
2026-11-23"). A test that fails for another reason: leave it, list it.
Shoot: `node scripts/ui-bench.mjs --shot=flight,crucibleHud,flight-line-target --viewports=1280x720 --out=.devshots/fleet/hud2`
(the report must print no CLIPPED / BANNED WORD lines). List the PNG paths in your receipt.

## You may edit
src/ui/hud.js, src/ui/hudAttention.js, src/ui/alerts.js, src/ui/toasts.js, src/ui/targetPanel.js,
src/ui/threatHalo.js, styles/hud.css, and their tests. Before editing any file run
`git diff -- <file>`; if it shows changes you did not make, run
`bash scripts/fleet/own-commit.sh begin <file>` BEFORE you edit and
`bash scripts/fleet/own-commit.sh commit "<msg>" <file>` after. Never git add -A, reset, stash,
restore or checkout. Plain-English commit messages saying what the player now gets.

## Receipt
Protocol headings; per item: fixed (commit) / rejected (one-line reason); tests changed; PNG paths.
