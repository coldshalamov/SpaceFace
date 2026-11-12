# RECON-G10 — The first ten minutes, beat by beat: what exists today

**Lane 2, read-only research (no code edits).** The owner will demo the first hour. The design for minutes 0–10 is the
Director's amendment (2026-11-10, decision D6) in the EC-G10 brief — read it:
`git show origin/experience-commissions/EC-G10-the-first-hour-is-already-the-game:design/program/experience-commissions/commissions/shared/EC-G10-the-first-hour-is-already-the-game.md`
and Book 0 in `design/game/16_THE_STORY_SHOWN.md` ("B0 Cold Start") and `design/game/19_WHAT_PLAYERS_EXPECT.md`.

The ten beats: 1 spawn with the 47-A sample rock marked + one caption of premise · 2 twenty seconds of thrust and brake ·
3 latch, reel, cut · 4 swing the rock through the derelict · 5 the raid: fling the raider into a rock · 6 claimed salvage —
take it or leave it; outrun the search · 7 mine the sample · 8 **the Skim as a scene** (today text in
`src/systems/missionStoryOps.js`) · 9 Kessler's line, with a face · 10 dock at Helios into Lamps-Up; Orla's lamp is the first
town job; the alloy run to Tethys is the recommended contract. Plus: **the title shows two doors, Adventure and Swarm, side
by side**; shooting drills / extra verbs (`missingThree.js`) / the five powers (`powerSituations.js`) move to minutes 15–40.

## Deliver `design/program/fleet/drafts/G10-recon.md`
For each beat and the title: **exists / partial / missing**; the owning files with line numbers; what the player actually
sees and does today on a fresh New Game (trace it from `src/data/newGameDefaults.js`, `src/systems/onboarding.js`,
`src/systems/missions.js`, `missionStoryOps.js`, the tutorial/coach systems); what is in the way (e.g. a drill that runs
first, a popup chain, a missing actor); and the **smallest build** that would make the beat play — with the existing owner to
extend, not a new system. Note anything in `.dev/pr-expansion/HANDOFF.md` or open PR branches
(`git branch -r | grep experience-commissions`) that already builds a beat. End with a recommended build order for a demo in
about a week, smallest-to-biggest player impact per effort.

Node/grep only; if a fact needs the running game, say so instead of guessing. Commit the draft only:
`git add -- design/program/fleet/drafts/G10-recon.md && git commit -m "recon(G10): the first ten minutes against today's code" -- design/program/fleet/drafts/G10-recon.md`.
