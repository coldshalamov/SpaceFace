# SpaceFace — First-Session Playtest Script

> **What this is.** A structured protocol for a *fresh* player's first session, implementing the
> **"first 5 minutes" contract**: the player should, with no hand-holding beyond in-game hints,
> go **fly → mine → dock → sell → see-something-unaffordable → survive a tiny threat** — and come
> out understanding the core loop and wanting the next thing.
>
> **Why this contract.** The first five minutes decide whether the trade/mine/combat loop *reads*.
> Each beat teaches one verb and hands off to the next: flying earns the right to mine, mining fills
> a hold, the hold is worth credits, credits reveal a goal you can't yet afford (the hook), and a
> small threat proves the world can bite. If any beat stalls, the loop doesn't close and the player
> bounces.
>
> **How to run it.** One observer, one fresh tester who has *never* seen the game. Tester thinks
> aloud. Observer does **not** help unless a step hard-times-out (record the rescue — it's a
> finding). Run it on the **packaged Electron build** when possible (that is the ship vehicle; see
> QA_MATRIX.md), and at least once on the dev server for comparison.
>
> **Automation note (DEFERRED — do not build now).** A later harness will drive these same beats
> programmatically against `window.SF` (`window.SF.state`, `window.SF.bus`, `window.SF.registry`) —
> asserting e.g. `state.player.cargo.usedVolume > 0` after the mine beat, or listening for
> `economy:tradeCompleted` after the sell beat — to catch regressions without a human. This document
> defines the beats and success criteria that harness will encode. **Build the manual protocol now;
> the automated version is a separate, later task.**

---

## Pre-flight (observer setup, not timed)

1. Clean profile: clear `sf.save.*` from the target origin's localStorage (or use a fresh install)
   so "New Game" is the only path and no prior save short-circuits the menu.
2. Default settings (`difficulty: 'standard'`, `tutorialHints: true`). Audio on (first beat checks
   the gesture-unlock).
3. Have a stopwatch and the **Recording Sheet** (below) open. Note build: dev SHA or installer ver.
4. Tester instruction, verbatim: *"Play naturally and say what you're thinking, what you expect to
   happen, and anything that confuses you. I won't help unless you're truly stuck."*

---

## The protocol — 6 beats

Each beat lists: **goal**, **exact steps**, **success criterion**, **timeout / rescue**, and
**what to record**. Times are wall-clock from session start unless noted.

### Beat 0 — Boot & New Game (orient)
- **Goal:** reach flight from a cold boot without confusion.
- **Steps:** launch → boot overlay clears → Main Menu → click **New Game**.
- **Success:** ship is flyable (`mode='flight'`, HUD visible) and tester knows *that it's their ship*.
- **Timeout / rescue:** 60 s to find New Game. If they click "Continue"/"Load" expecting New Game,
  record it as a menu-labeling confusion.
- **Record:** time-to-flight; did audio start on first input (gesture unlock)?; any menu mislabel.

### Beat 1 — Fly (the verb: movement + aim)
- **Goal:** tester controls heading and thrust intentionally within seconds.
- **Steps:** thrust forward, turn toward a visible object, try boost.
- **Success:** **time-to-first-intentional-movement < 20 s**; tester can point the ship where they
  mean to and reports the camera feels controllable (not nauseating — camera follows position, not
  yaw, by design).
- **Timeout / rescue:** 45 s. If they can't tell which way is "forward," record a readability gap.
- **Record:** **time-to-first-movement**; control scheme they *expected* vs found; motion comfort.

### Beat 2 — Mine (the verb: fill a hold)
- **Goal:** tester finds an asteroid, mines it, and *sees cargo accumulate*.
- **Steps:** approach an asteroid field → aim mining beam → hold fire → collect ore pickups (magnet
  pull) → watch the cargo readout climb toward 40u.
- **Success:** **time-to-first-ore-in-cargo** recorded; tester connects "beam → broken rock → ore →
  my cargo bar moved." Hold reaches a meaningful fraction of 40u.
- **Timeout / rescue:** 90 s to first ore. If they don't realize they have a mining beam, record a
  discoverability gap (this is the #1 expected stall).
- **Record:** time-to-first-ore; did they understand the cargo cap is *volume* (40u)?; beam
  discoverability.

### Beat 3 — Dock (the verb: arrive somewhere that matters)
- **Goal:** tester locates a station and docks.
- **Steps:** find the station marker → fly into dock range → press **Enter** at the prompt.
- **Success:** docked screen opens; tester understands docking is how you access services.
- **Timeout / rescue:** 120 s. If they fly past the station or miss the range prompt, record a
  wayfinding gap.
- **Record:** time-to-first-dock; did the dock prompt read clearly?; any wayfinding confusion.

### Beat 4 — Sell (the verb: the loop pays out)
- **Goal:** tester sells mined ore for credits and *feels the payout*.
- **Steps:** open market/trade → select the ore they mined → sell → watch credits rise, cargo fall.
- **Success:** **a sale completes** and credits visibly increase; tester says some version of "so
  mining makes money." (Harness later: assert an `economy:tradeCompleted` fired.)
- **Timeout / rescue:** 90 s in the dock UI. If they can't find where to sell, record a trade-UI
  gap.
- **Record:** time-to-first-sale; credits earned; did the loop "click" (verbalized)?

### Beat 5 — See-unaffordable (the hook)
- **Goal:** tester sees a desirable thing (better ship / module / tech node) they **cannot yet
  afford**, creating a goal.
- **Steps:** open shipyard/outfitting or tech tree → look at a priced item above current credits.
- **Success:** tester notices the price > their credits and forms an intent ("I need to mine/trade
  more to get that"). The unaffordable item must read as *aspirational*, not *broken* (price shown,
  buy disabled, no error).
- **Timeout / rescue:** 60 s. If they think the disabled buy is a bug, record a UI-clarity finding.
- **Record:** did they form a goal? Which item did they want? Did "unaffordable" read as a goal vs a
  fault?

### Beat 6 — Tiny threat (the world can bite)
- **Goal:** tester encounters a small, survivable threat and engages or escapes.
- **Steps:** undock / fly toward a low-danger contact → take or avoid fire → either kill it or flee.
- **Success:** tester perceives danger and *reacts* (fights or runs) and — on standard difficulty —
  **survives**. If they die, respawn (loaner Kestrel, insurance) must be legible, not a dead-end.
- **Timeout / rescue:** open-ended; end the scripted portion at ~the 5-minute mark or when the threat
  resolves.
- **Record:** did danger read before damage?; fight-or-flight choice; **deaths** (count + cause +
  did respawn make sense?).

---

## Success / failure of the *session* (not just per-beat)

- **PASS:** all six beats reached within ~8 minutes wall-clock (5 is the target; 8 the ceiling for a
  first run), and the tester can, unprompted, restate the loop: *"mine → sell → afford better gear →
  go somewhere riskier."*
- **SOFT FAIL:** all beats reached but one required an observer rescue, or the loop wasn't
  verbalized. Log the rescued beat as the priority fix.
- **HARD FAIL:** any beat hard-times-out with no path forward, or a death with an illegible respawn,
  or a crash. These block the "first 5 minutes" claim.

---

## Recording Sheet (per session)

| Field | Value |
|---|---|
| Build (dev SHA / installer ver) | |
| Platform (dev tab / Electron binary) | |
| Tester (first-time? Y/N) | |
| Time-to-flight (Beat 0) | |
| Time-to-first-movement (Beat 1) | |
| Time-to-first-ore (Beat 2) | |
| Time-to-first-dock (Beat 3) | |
| Time-to-first-sale (Beat 4) | |
| Formed a goal at unaffordable item? (Beat 5) | |
| Threat read before damage? Survived? (Beat 6) | |
| Total time to all 6 beats | |
| **Confusion points** (timestamp + what) | |
| **Observer rescues** (which beat + why) | |
| **Deaths** (count / cause / respawn legible?) | |
| Loop restated unprompted? (quote) | |
| Crashes / errors | |

---

## Regression checklist (run before every playtest build)

Quick pass/fail so a playtest isn't wasted on a broken build. (The deferred `window.SF` harness will
automate the starred ✦ items.)

- [ ] ✦ Cold boot reaches Main Menu; **New Game** starts flight (`game:started`).
- [ ] ✦ Ship responds to thrust + turn; boost works.
- [ ] ✦ Mining a rock increases `state.player.cargo.usedVolume` (ore reaches cargo).
- [ ] ✦ Docking fires `dock:docked` and opens the station UI.
- [ ] ✦ A sale fires `economy:tradeCompleted` and **credits go up, cargo down**.
- [ ] An unaffordable item shows its price with **buy disabled** (no error/crash).
- [ ] A tiny enemy spawns, can damage the player, and can be killed (`entity:killed`).
- [ ] ✦ Player death → respawn (loaner `ship_kestrel`, insurance honored); autosave **not** written
      on the death frame.
- [ ] ✦ Quicksave (F5) then Quickload (F9) round-trips without crash; F5 does **not** refresh the
      dev tab.
- [ ] On the **packaged Electron build**: Main-Menu background + HUD icons load (guards ASSET-1), and
      a save survives a full quit + relaunch (guards SAVE-1). See QA_MATRIX.md.
