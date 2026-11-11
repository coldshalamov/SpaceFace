# The game — the design authority

**This folder is what SpaceFace is.** When any other document disagrees with it, this folder wins
(after the owner's own words and `design/VISION.md`). Work comes from `design/program/fleet/QUEUE.md`
only; this folder says what the work must produce.

Copied onto master on 2026-11-11 from branch `experience-commissions/EC-G13-integration-director`
(PR #943), where it was written, so every agent in the main checkout can read it. The per-area
commission briefs (EC-S01…S25, G01…G21, A01…A07, Z01…Z04, C01) still live on their PR branches;
read one with `git show origin/experience-commissions/<branch>:design/program/experience-commissions/commissions/<path>`.

| Doc | What it decides |
|---|---|
| [09 Creative direction](09_CREATIVE_DIRECTION.md) | Theme, the Town Recipe, the Road Cast, the Stranger Test |
| [10 The game](10_THE_GAME.md) | The verdict, decisions D1–D10, the bar for "finished", the build order |
| [11 The Armory](11_THE_ARMORY.md) | Ships as ways to move, gun families and Kick, power bends, Line heads, mods, builds |
| [12 Swarm: the Pit](12_SWARM_THE_PIT.md) | The floor, drops, traffic, fifteen enemies, thirty named rounds, bosses, Madame Kiln |
| [13 Jobs and heists](13_JOBS_AND_HEISTS.md) | The five towns' jobs, heists, street life; the yard |
| [14 Outposts and waystations](14_OUTPOSTS_AND_WAYSTATIONS.md) | Six outposts, fourteen frontier stops |
| [15 Arena floors](15_ARENA_FLOORS.md) | The seven arenas: guns, freight, doors, traps, the lap, the secret, the boss |
| [16 The story, shown](16_THE_STORY_SHOWN.md) | The eight books staged in front of the ship; the cast; the five endings |
| [17 The ladder and the long game](17_THE_LADDER_AND_THE_LONG_GAME.md) | Eight rope classes, money, Swarm prices, the hours, the yard |
| [18 Sound, look, and done](18_SOUND_LOOK_AND_DONE.md) | **The acceptance standard** and the owner's ten-minute card |
| [19 What players expect](19_WHAT_PLAYERS_EXPECT.md) | First-evening basics: restart, controller, resume, fairness |
| [`../program/INFERENCE_PLANTS.md`](../program/INFERENCE_PLANTS.md) | 100 written world reactions (build exactly as written) |

## Rulings made after these documents (2026-11-10/11)

These override the documents above where they differ.

1. **Swarm is winnable at round 30, then optional "Keep going".** Clearing round 30 shows
   `THE PIT IS YOURS` and banks the win; "Keep going" continues into the endless course where the late
   bosses, broods and strains live; records keep wins, best win time and deepest round.
2. **The look: a busy working harbour at golden hour, not a tomb.** Warm and readable; deep blue
   shadows, not black; neon only as accents on signs and engines; bloom is a budget, not a filter; one
   grade for the whole game with small per-sector offsets.
3. **Phones:** default framing shows the same horizontal world width as desktop; pinch zooms 0.6×–1.5×;
   the flight HUD covers at most 25 % of the screen; every touch control is labelled on first use; the
   phone throw is a flick while latched; phones default to the `low` preset.
4. **Performance is judged by two numbers:** main-thread idle ≥ 30 % and sim/real-time ratio ≥ 0.98
   in steady flight and Swarm round 20, measured on a quiet machine.
5. **One feel in both doors** (landed): Pull is a yank, Shove a punch, thrown bodies hit ships, the same
   in Adventure and Swarm. Boost is twice cruise.
