# Tribunal Dossier — First Hour & Core Loop (fly→mine/trade/fight→sell→upgrade)
Evidence only; every claim cites a file. Compiled read-only, date of checkout.

## 1. What exists — factual inventory

**New-game entry.** `src/ui/screens/newGame.js` offers 3 starter hulls (Hitch/ship_kestrel default, Pelican, Wasp), 4 difficulties, name+seed (`newGame.js:37-47`; catalog `src/data/newGameDefaults.js:71-115`). Start state: 5,000 cr, Helios Prime (tier 0, security 0.98; `newGameDefaults.js:5-12`, `sectors.js:54`). Default fit: Pulse Laser S (dmg 5, dps 27.5 — deliberately retuned to "nudge/finisher" `weapons.js:45-63`), Mining Laser S, ion engine, shield booster, drill amp (`newGameDefaults.js:27-33`).

**Cold open.** One 2.5 s full-screen line once per profile: "Helios System. Third shift. The manifest is wrong." (`newGame.js:288-322`). No modal (spec `design/spec2/03_FIRST_HOUR.md:16-18`).

**Staged tutorial rail (the scripted ramp — it exists and is large).** `src/systems/onboarding.js` (4,470 lines) runs a 12-beat thesis-first chain: tether → raid → claimed → thrust/brake/marker/focus/burst/disengage → seam → dock → choice (`onboarding.js:293-376`), ≥4 s silence between beats (`:237`), one imperative verb per line ≤12 words, live keybinding printed (`:384-412`). Optional/non-blocking (`:1-21`), gated by `settings.gameplay.tutorialHints` (`:1332-1389`). Staged props: derelict for latch/winch/cut (`:2221-2240`), a crippled passive raider to throw (`:3236-3259`), claimed-salvage tableau with real law witness/heat (`:274-281`). Auxiliary rails slot into gaps: rescue opening (swing/shove/grab, `rescueOpening.js`), missing-three (boost/draw-to-fly/well/repulsor/cone, `missingThree.js:19-25`), power situations (`powerSituations.js`), verb shelf (`verbSpeech.js`). Mid-rail saves resume (`:1429-1449`).

**Post-rail handoff.** Accepting any of the three B5 offers (HAUL/BOUNTY/SURVEY, risk ≤1; `systems/missions.js:1090-1105`) calls `_finish()` → story-mode tracker (`onboarding.js:1988-2012`). Campaign spine: 8 beats cold_start→deep_reach (`data/missions.js:2626-2652`); B0 = mine + dock, mints `cmdty_47a_assay_sample` (`campaign47a/campaignData.js:78-113`, `missionObjectiveOps.js:77-81`). 47-A scene is physically staged at boot: evidence spindle 960-vs-480kg, wreck, pod, beacon; 4 dormant actors parked 1,760+ wu out — 3 hostiles until `scavenger_arrival`, 1 SCN recovery tug until `recovery_tug` (`47aLiveScene.js:120-315`).

**Work for money.** Per-hull 2-step starter chains on the Helios board, 420–760 cr/step, gated on the hull's own fit (`data/starterJobs.js:6-34`). First-trade contract: 8 u fuel cells Helios→Ceres, 8,900 wu, 760 cr vs ~440 cr tolls (`economyContractTemplates.js:323-365`). Board epoch-rolls offers and retains ~20 authored classes; zero-capital guarantee SF-119 (`missionBoardOps.js:54-299`).

**Feedback/progression.** Credits, faction ranks (`factions.js:132-189`), tech RP, Line classes (`lineProgression.js`), career ladders (`careers/ladders/`), achievements. One-shot contextual hints persist in `state.player.hints` (`onboarding.js:689-745`). Help/codex with live bindings + six loop guides (`screens/help.js:205-308`).

**Death/failure.** Recoverable except Ironman: `player:death` + `game:over` (`combat.js:1040-1190`); after-action screen quotes lawful recovery dock, cost, 50% cargo loss, insurance (`playerDefeat.js:300-411`; `screens/gameOver.js`). Difficulty: Standard halves incoming damage, +15% outgoing; silent defeat-streak mercy −18% after 2 deaths/20 min (`difficulty.js:8-76`).

**Playtest artifacts.** `docs/program-compass/2026-09-ACTUAL-GAME.md` — six scripted 10-sim-hour playthroughs (3 archetypes × 2 seeds), the only measured end-to-end evidence. Checks: `check:first-hour`, `check:first-15-runtime`, `first-hour-economy-floor` test (`package.json:348,361`).

## 2. Evidence of weakness

- **Hour-1→10 collapse is measured, not felt.** Encounter spawns 9–13/h (h0–2) → 0 by h5; all income lands h0–3 then flat; in ~60 sim-hours: ≤1 mission accepted, **0 completed, 0 module purchases, 0 ship changes, 0 tech**; combat→salvage→economy chain fired **0 times** (`ACTUAL-GAME.md:23-53,67-69`).
- **The tutorial's combat climax is a prop.** The raid raider is spawned unarmed, passive, no drive — a drifting hulk to swing (`onboarding.js:3236-3259`). The spec's B3 "weak pirate attacks and flees at 30%" (`spec2/03:22-24`) was replaced by a physics tableau; the player may reach minute 15 without a real fight.
- **Nothing hostile can legally appear in the starter sector.** e.g. `pirate_toll` gates at minSectorTier 2 + cargo ≥240 (`encounters/010-pirate-toll.js:20-25`); Helios is tier 0. Hunters roamed sectors to find fights and still hit 0-encounter hours (`ACTUAL-GAME.md:57-60`).
- **Mining is an incantation:** 12,034 beam shots / 131 rocks ≈ 92/rock, no failure, choice, or variance (`ACTUAL-GAME.md:108-110`); mk1 beam 18 dps vs ~240 ore-HP rock = ~13 s hold (`data/mining.js:165`, `newGameBoot.js:51`).
- **The signature chain never closes.** Salvage pickups happen (683) but looted goods never reach economy; the "whole game" loop completed zero times (`ACTUAL-GAME.md:61-64`).
- **Sling payoff is a coin flip:** identical policy → 1 kill/0 cr vs 45 kills across seeds; ~4,290 attach→cut cycles across a 10-hour session (~430/hour) of degenerate practice (`ACTUAL-GAME.md:76-82`).
- **Law is a tutorial-only system:** 0 heat/wanted/law events in ~63 h including 76 kills (`ACTUAL-GAME.md:71-75`). The claimed beat teaches a WANTED ring the sandbox never repeats.
- **First real trade is a razor margin:** 760 cr pay vs ~440 cr round-trip tolls → +320 cr for ~8,900 wu (`economyContractTemplates.js:331-347`). Author comment admits the previous version "taught that trade loses money."
- **First-purchase pull is weak:** cheapest real modules 4,000–6,000 cr vs 5,000 start (`modules.js:98,151,431`) — affordable once, but 0 purchases in 60 h measured. Only a hint line points at outfitting (`_maybeSpeakFitOffer`, `onboarding.js:582-593`).
- **Post-B5 guidance is one text line.** After `_finish()`, "what now" = story tracker sentence + a board; spec targets (first module <20 min, first jump <30 min, `spec2/03:41-45`) have no measured pass/fail anywhere.
- **Ambient life barely registers:** comms popups ~50/h vs bark surfacing 31–58/session; band radio opt-in, never invoked (`ACTUAL-GAME.md:87-103`).
- **Death teaches narrowly:** only massline-snap deaths offer a Range-rung lesson (`gameOver.js:257-262`; `playerDefeat.js:414+`).

## 3. Candidate directions

1. **Give the first hour a real fight.** Restore a B3-style hostile that shoots and flees at ≤30% hull (spec `spec2/03:22-24,58`), staged like the existing raid cast. Evidence: `onboarding.js:3236-3299` machinery already exists. **M.**
2. **Tier-0 encounter deck for Helios.** Author legal/ambient encounters gated `minSectorTier 0` so minutes 10–60 have live traffic consequences; today almost everything gates ≥2 (`010-pirate-toll.js:23`; `ACTUAL-GAME.md:57-60`). **M.**
3. **Close kill→salvage→sell once in hour 1.** The tutorial's claimed-salvage beat already stages a spill+witness; add a "fence the spill at Helios" follow-on that forces one complete VISION loop before B5. Evidence: `ACTUAL-GAME.md:61-64`, `onboarding.js:274-281`. **M.**
4. **Mining skill surface.** The rail teaches seam-aim + vent rhythm but extraction is hold-beam ~13 s/rock with zero variance (`data/mining.js:165`; `ACTUAL-GAME.md:108-110`). Give seams/overheat a payoff input. **L.**
5. **Make the sling an income verb, not a demo.** Authored first-hour payoff for thrown-mass kills (bounty chip table, repeatable): measured 1-vs-45-kill spread proves payoff is accidental (`ACTUAL-GAME.md:76-82`; loot path `combat.js:1095-1167`). **M.**
6. **Staged first purchase.** B5 followup beat: "spend the payout" — the fit-offer pointer exists (`onboarding.js:582-593`); stock one sub-5,000 cr module that visibly changes a verb (Ram Plate/RCS at 4,000–6,000, `modules.js:98,431`) so first upgrade lands inside the hour. **S.**
7. **Post-rail corridor beat.** One guided gate jump + return (first-trade contract already pays the toll; `economyContractTemplates.js:314-316`): currently nothing teaches gate travel until `gate:range` fires. **S–M.**
8. **Per-cause death lessons.** Extend the Range-rung offer beyond massline-snap to collision/gun deaths (`gameOver.js:257-262`, `playerDefeat.js`). **S.**

*Gaps in this dossier:* no live human playthrough exists — all "weakness" evidence is scripted-pilot or code evidence. `.devshots/actual-game/` ledgers are untracked and absent locally; raw per-hour tables not re-verified. Career ladders (`careers/ladders/`) exist but their first-hour entry point was not traced — worth one follow-up grep before writing direction 6.
