# Lead handoff — 2026-11-12 ~01:30 UTC (Claude Opus lead out of usage ~3 h)

You are the stand-in lead for SpaceFace (C:\Users\93rob\Documents\GitHub\SpaceFace). The owner is not a coder; you
own quality. Read, in order: `CLAUDE.md` → `design/program/fleet/README.md` → `PLAYBOOK.md` → `PROTOCOL.md` →
`QUEUE.md`. The design authority is `design/game/` (README rulings 1–5 override the docs). The owner's acceptance
card is `design/game/18_SOUND_LOOK_AND_DONE.md` §3 (five ticks: throw satisfying · nothing froze · read everything,
nothing overlapped · always knew what next · want another go).

## Hard rules (shared checkout, other agents live in it)
- Never `git reset/restore/checkout/switch/stash/clean/rebase`, never `git add -A`/`commit -a`, never force-push.
  Commit exact paths: `git add -- <p> && git commit -m "..." -- <p>`. If `.git/index.lock` exists, wait 2–10 s and retry.
- One game/browser at a time: every look/bench/gate goes through `node scripts/fleet/game-lock.mjs run -- <cmd>`.
  Never wrap a lock-waiting command in `timeout` (it counts queue time and orphans the browser).
- No full test-suite runs; run the named test files only.
- Devin never does frontend ([FE] rows). Frontend = Flash for routine, a Sonnet sub-agent where it matters, and
  YOU look at every screen yourself (open the PNGs) before calling it done.
- Workers: `node scripts/fleet/run.mjs <PACKET-ID> <devin1|devin2|devin3|flash|codex> --timeout-min=150`
  (packet file `design/program/fleet/packets/<PACKET-ID>.md` must exist; max 4 active, see `.devshots/fleet/active/`).
  Before launching, set the row to `TAKEN agentN (<backend>)` in QUEUE.md and commit that one file.
  Receipts land in `.devshots/fleet/runs/<packet>.<backend>.<stamp>/RECEIPT.md`.

## Running right now
| Worker | Packet | What to check when it lands |
|---|---|---|
| devin1 | PARK-01 (land parked tender-haul + store sentence; already committed c6fc0a8a, recorded check:sim reference **v27**) | Receipt says `npm run check:sim` passes on v27 and `npm run gate -- --quick` passes; `grep -c contextWheelOpen src/ui/hud.js` ≥ 1 (the parked copy dropped it once); no file outside the parked list changed except the v27 reference/process files |
| devin2 | SWARM-GRIND-01 (Fortify Gravity Beacon crushes light enemies on its body — must gather them in a ring) | The new Node test shows 0 beacon-impact deaths; the player's own Pull power unchanged; the throw look (`scripts/fleet/looks/throw.mjs`) kills line no longer dominated by `beacon:` impactors |
| devin3 | PERF-04 (no shader compiles mid-flight) | Before/after late-compile count (must be 0), opening not >1 s slower, no look/material changed (diff only touches *when* programs compile) |
| flash | MOB-03 (phone: `MENU` word on pause key, first-use captions per control) | **Look yourself**: `ui-bench --phone --viewports=390x844,844x390 --shot=mobile-flight,mobile-stick,mobile-wheel`. Known defect already seen: the `MENU` word spills outside the round pause key — must sit inside it. `node scripts/check-mobile-hud-area.mjs` must stay `within the 25% budget` |
| Sonnet sub-agent (lead's) | G16-04 floating text/notice plates (first commit 2adca87d) | It may die with the lead's session. If its commits don't cover: pad tags out of the top-centre Swarm column, merged SHUNTED words, glass plates on the right-hand notices, class-up plate not covering the round panel at 844x390 — re-dispatch the rest as a Sonnet agent with packet `G16-04-floating-text-and-notice-plates.md` |

## Reviewing what lands (the job)
For every commit: read the diff (`git show <sha> -w --ignore-cr-at-eol`), then check:
- **Events:** a system must not emit another owner's event (PL-02 fired the player's `dock:undocked` for an NPC — ~20 owners
  listen). Any visible effect needs a renderer listener (the sim runs in a worker; `ent.data` set in the sim does not reach
  the drawn entity — see `traffic:nearMissFlash` in `src/render/renderer.js`).
- **Counts:** does one real action fire two events that both get counted (PL-54 double-counted near misses)?
- **Tests:** a loosened bound or changed expectation must cite the deliberate commit that caused it; never edit
  `*.expected.json`/references to pass. Line-ending rewrites (whole file shows changed) → normalise back.
- **Screens:** shoot it, open it, describe it. Overlap, cut-off words, text over the world without a plate = not done.
Fix small things yourself (commit `lead-review(<ID>): ...`); send big ones back as a packet.

## Next work for free slots (in order)
1. **devin (any free):** `PRX-NEXT` (live-bug leftover PRs), then `PLANT-NEXT` (review plants hard — see above).
2. **flash:** `PLANT-RADIO` (repeat), then `MOB-04` [FE] (write its packet from `drafts/MOB.md` §MOB-04 first; phones default to `low`).
3. **When the machine is otherwise quiet (no workers on the lock):** G16-03's leftover UI-budget re-baseline —
   `node scripts/fleet/game-lock.mjs run -- npm run capture:ui-matrix -- --budgets-out`, then `node scripts/check-ui-budgets.mjs`,
   commit only the files it rewrites.
4. **Swarm rounds 1–5 look (lead/stand-in):** `node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/throw.mjs .devshots/fleet/looks/throw/rN N`
   for N=1..5 after SWARM-GRIND-01 lands; judge each against the card. `C01-05` stays HOLD until this look is done.
5. Known reds still open: `comms-log-surface`, `special500-comms-backlog` (real assertion failures — diagnose before changing).

## State at handoff (all on master, not yet pushed)
Landed today: phone HUD ≤25 % (MOB-02 b0268fe6 + 5339280b), popup rules (FIX-R4a), hold line (G19-02 + lead 99978f29),
known reds cleared (KNOWN-REDS + lead fixes), plants PL-54/PL-02 with lead fixes, runner fixes, throw look (c96443a7).
**Push** when the gate is green: `npm run gate -- --quick`, then `git fetch && git merge origin/master` (never rebase) and `git push`.

Lessons file for the lead: memory `lead-loop-2026-11-12.md`.
