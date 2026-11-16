# FIX-03 — No placeholder crystal shards in Swarm; the swing lesson can't get stuck

Evidence: `.devshots/fleet/runs/ACCEPT-02-first-hour.hydrogen.*/RECEIPT.md`, frames `.devshots/fleet/accept02/`.

## 1. Swarm rounds 2–3 show big flat pale octahedron shards (`accept02/swarm/16-gameplay-t264.png`, 12–19)
These are crystal asteroids whose authored body never admits, so the raw `OctahedronGeometry` fallback is drawn (see
`design/program/fleet/drafts/asset-findings-for-codex.md` "Crystal asteroids draw as a bare primitive", and line ~53:
the Foundry opening court already skips the `crystal` family via `environmentFamiliesFor` in `src/systems/swarmArena.js`
and `swarmOpeningTerrain.js` "until the crystal asset is real").
**Lead decision:** until the crystal asset is real, no Swarm arena spawns the `crystal` substance at all — apply the same
filter to every debris/rotation spawn path in `src/systems/swarmArena.js` (`_spawnDebrisRock` substance choice and any
wave/round rotation), with a comment pointing at the same note, so it is removed in one place when the asset lands.
Test: across rounds 1–10 of every Swarm arena, no spawned debris rock has substance `crystal`. Adventure unchanged.

## 2. Adventure beat 4 ("Swing the rock through the wreck") never completes if the lesson rock is lost
In ACCEPT-02 the first latch on the lesson rock (614) broke with `target_lost` after 2.8 s; the pilot then threw two
other rocks (706, 694) and the objective stayed on beat 4 for the remaining 8 minutes. The OPENING-1b fix completes the
beat only on a throw of the lesson rock (`src/onboarding/onboarding.js`, commit `44bbc60fa4`).
**Lead decision:** during beat 4, the player's first `massline:throw` of ANY body completes the swing beat (drop the
same wreck scrap reward). Also, if the lesson rock is destroyed or lost before the throw, the objective line must point
at the nearest loose throwable rock instead of a body that no longer exists. Tests: throw of a non-lesson rock completes
beat 4; lesson rock removed → objective retargets.
Exact-path commits per the protocol; `npm run check:sim` must stay green (report if the 47-A reference moves and why — do
not edit the golden); tests before/after for touched files.
