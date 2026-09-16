STATUS: DONE (measurement). The PQ-174 Outcome bars themselves are not met.

<!-- LIFETIME: ACTIVE_RECEIPT -->

# PQ-174 packet bars — death window and quiet seconds, to death or 20 minutes

```text
DONE  PQ-174 packet-bars — nine seeded Helios Core cells now print run length to first death, or a 20-minute censor, and whole-run quiet seconds, with the death story the results owner already builds.
WHAT I FOUND     The 8–14 minute death window was a guess: Pulse dies in under five minutes to a Reaver, physics/massline usually never die in twenty, and a long run is full of quiet seconds except one physics seed.
WHAT I CHANGED   Nothing in the fight. The existing swarm bench now runs until the chase-bot dies or twenty simulated minutes, counts quiet seconds across the whole run, and reads the death story the results owner already published.
WHAT YOU WILL FEEL   Nothing new when you press the button — this lane only measured. What the numbers say about today: the starter Pulse is over in about a minute, the physics kit can live ten minutes with no quiet second and then a Dreadnought ends it, and the rope kit can sit in the room for twenty minutes with hundreds of seconds where nothing happens to it.
THE NUMBERS      Helios Core. Seeds 4242 / 8008 / 13502. Cap 72000 ticks (20 min) or death. Chase-bot, not a competent player.
THE NUMBERS      bar | before (90 s cap, PQ-174.00) | after (death or 20 min) | target
THE NUMBERS      Pulse 4242 death | censored @ 90 s | 0.61 min · Reaver Pirate FRONT · Engine Flare 517 ms | 8–14 min
THE NUMBERS      Pulse 8008 death | 16.27 s wasp | 1.02 min · Reaver Pirate STARBOARD · Engine Flare 917 ms | 8–14 min
THE NUMBERS      Pulse 13502 death | censored @ 90 s | 4.61 min · Reaver Pirate FRONT · Engine Flare 1117 ms | 8–14 min
THE NUMBERS      Physics 4242 death | censored @ 90 s | 10.54 min · Dreadnought Iron Maw PORT · Broadside charge 967 ms | 8–14 min
THE NUMBERS      Physics 8008 death | censored @ 90 s | censored @ 20 min (still alive) | 8–14 min
THE NUMBERS      Physics 13502 death | censored @ 90 s | censored @ 20 min (still alive) | 8–14 min
THE NUMBERS      Massline 4242 death | censored @ 90 s | censored @ 20 min (still alive) | 8–14 min
THE NUMBERS      Massline 8008 death | censored @ 90 s | censored @ 20 min (still alive) | 8–14 min
THE NUMBERS      Massline 13502 death | censored @ 90 s | censored @ 20 min (still alive) | 8–14 min
THE NUMBERS      Pulse 4242 quiet after W1 | 17 s in a 90 s cap | n/a (died in wave 1) | 0 s
THE NUMBERS      Pulse 8008 quiet after W1 | n/a (died in opener) | 0 s in a 1.3 s window | 0 s
THE NUMBERS      Pulse 13502 quiet after W1 | 18 s in a 90 s cap | 34 s | 0 s
THE NUMBERS      Physics 4242 quiet after W1 | 4 s in a 90 s cap | 0 s over 9.5 min | 0 s
THE NUMBERS      Physics 8008 quiet after W1 | 0 s in a 90 s cap | 70 s over 19 min | 0 s
THE NUMBERS      Physics 13502 quiet after W1 | 0 s in a 90 s cap | 188 s over 19 min | 0 s
THE NUMBERS      Massline 4242 quiet after W1 | 12 s in a 90 s cap | 397 s over 19 min | 0 s
THE NUMBERS      Massline 8008 quiet after W1 | 1 s in a 90 s cap | 302 s over 19 min | 0 s
THE NUMBERS      Massline 13502 quiet after W1 | 5 s in a 90 s cap | 433 s over 19 min | 0 s
FILES            scripts/lib/bench/swarmMetrics.mjs, scripts/lib/bench/crucibleSwarmBars.mjs, scripts/lib/bench/crucibleBench.mjs, scripts/lib/bench/packetBars.mjs (new), tools/agentic/scenarios.json, test/pq-174-packet-bars.test.mjs (new), design/program/roadmap/receipts/PQ-174.00-SWARM-BARS-REPORT.md (append), design/program/roadmap/receipts/PQ-174-PACKET-BARS-REPORT.md (new)
CHECKS           node --test test/pq-174-packet-bars.test.mjs test/swarm-metrics.test.mjs test/crucible-swarm-bars.test.mjs — 24 pass, 2 skipped (live sweeps gated)
CHECKS           live 9-cell sweep via scripts/lib/bench/packetBars.mjs — 9/9 cells printed a death time or a 20-minute censor and a quiet-second count
CHECKS           npm run check:baseline — entry 12/15, exit 12/15; same three reds (pq020-ceres-topology, sim, sim-v3 hash drift). Exit list is not longer. Did not re-record goldens.
UNPROVEN         A human competent player. Empty-board seconds (ships on the board with nothing to do is the quiet bar; occupancy was not counted). Whether picking a real draft card instead of the first seeded offer would move death time. Headed camera. check:playable (foreign render rewrite; not this lane).
```

Helios Core. Fixed seeds 4242, 8008, 13502. Kits: Pulse (`energy_baseline` / Kestrel + Pulse), physics toolkit (Hornet + concussion / well / sink), massline rig (Drifter + concussion / well / fusion / whip). Ceiling 20 simulated minutes (72000 ticks at 60 Hz) or first death. Wave target 999 so the old 3-wave stop cannot fake a run length. Nothing in `src/` was edited. Nothing was tuned to land inside 8–14.

## What "competent" means in this harness

It does not. The driver is the existing Crucible chase-bot:

- aims at the nearest live swarm-cohort hostile
- holds the trigger in range; the physics kit also stations off a backstop rock
- fires wells/shove (physics) or latch/reel/throw (massline) on a seeded cadence
- at a real draft, takes the first seeded offer
- at a refit, closes without changing fittings

That is a scripted proxy. A scripted bot is not a competent player. These numbers measure the proxy. Pretending otherwise is the fake this lane was asked not to make.

## Bar 1 — run length to first death

Four of nine cells died. Five survived the twenty-minute ceiling.

| Kit | Seed | Death | Cause | Telegraph |
|---|---|---|---|---|
| Pulse | 4242 | **0.61 min** | Reaver Pirate · unidentified weapon · FRONT · 0.1 hulls/s · hull breach | Engine Flare, 517 ms, witnessed |
| Pulse | 8008 | **1.02 min** | Reaver Pirate · unidentified weapon · STARBOARD · 1.4 hulls/s · hull breach | Engine Flare, 917 ms, witnessed |
| Pulse | 13502 | **4.61 min** | Reaver Pirate · unidentified weapon · FRONT · 1.0 hulls/s · hull breach | Engine Flare, 1117 ms, witnessed |
| Physics | 4242 | **10.54 min** | Dreadnought 'Iron Maw' · Heavy Autocannon M · PORT · not closing · hull breach | Broadside charge, 967 ms, witnessed |
| Physics | 8008 | censored at 20 min | none — still alive | n/a |
| Physics | 13502 | censored at 20 min | none — still alive | n/a |
| Massline | 4242 | censored at 20 min | none — still alive | n/a |
| Massline | 8008 | censored at 20 min | none — still alive | n/a |
| Massline | 13502 | censored at 20 min | none — still alive | n/a |

One cell in nine sits inside 8–14 minutes (physics / 4242). Pulse is dead before five minutes on every seed, three times to the same Reaver story. Physics and massline, on five of six remaining cells, never die in twenty minutes. The Outcome sentence is not the distribution.

Death names came from `survivalResults.lastResult().death` — cause text, telegraph name, lead time in ms, source, counterplay. That is the story machinery that landed with PQ-174.06, consumed here, not rewritten.

## Bar 2 — quiet seconds (not empty-board)

Definition, same as the bars printer: a whole second containing no kill, no verb, no memorable moment, and no player shot. Occupancy (ships on the board) is a different claim and was not counted.

| Kit | Seed | Whole run | After wave 1 | After wave 1 in the 90 s dump |
|---|---|---|---|---|
| Pulse | 4242 | 2 s | n/a — died in wave 1 | 17 s |
| Pulse | 8008 | 4 s | 0 s (window 1.3 s) | n/a |
| Pulse | 13502 | 44 s | **34 s** | 18 s |
| Physics | 4242 | 0 s | **0 s** | 4 s |
| Physics | 8008 | 70 s | **70 s** | 0 s |
| Physics | 13502 | 189 s | **188 s** | 0 s |
| Massline | 4242 | 402 s | **397 s** | 12 s |
| Massline | 8008 | 307 s | **302 s** | 1 s |
| Massline | 13502 | 445 s | **433 s** | 5 s |

The sixty-second clock made quiet worse on the long window. Physics 8008 and 13502 printed zero quiet-after-wave-1 inside ninety seconds; over twenty minutes they printed 70 and 188. Massline is worse still: hundreds of quiet seconds, and the chase-bot still never died. Physics 4242 is the only long cell that actually met "no quiet second after wave one", and it is also the only death inside 8–14.

Pulse 13502's 34 quiet seconds after wave 1 over a 216-second remainder is the serious Pulse finding: wave one can stay busy and the rest of the run still goes quiet.

## The printer lines

```text
[swarm-bars] loadout=energy_baseline build=energy_baseline/ship_kestrel/wpn_pulse_laser_s seed=4242 firstHostile=0.05s firstKill=3.65s verbs=1@3.276898/min moments=17@27.853632/min quiet=2 quietAfterW1=n/a(wave 1 did not complete; quiet-after-wave-1 is undefined on a censored opener) deaths=1(cause=Reaver Pirate · unidentified weapon · FRONT · closing 0.1 hulls/s · hull breach,telegraph=Engine Flare) deathStory=Reaver Pirate · unidentified weapon · FRONT · closing 0.1 hulls/s · hull breach|Engine Flare@517ms/witnessed waves=w1:censored/censored:36.586667s cleanup=n/a(no cleanup interval observed) menus=0@0/wave firstDeath=36.633333s firstDeathMin=0.610556min
[swarm-bars] loadout=energy_baseline build=energy_baseline/ship_kestrel/wpn_pulse_laser_s seed=8008 firstHostile=0.05s firstKill=3.716667s verbs=2@11.730205/min moments=19@18.572825/min quiet=4 quietAfterW1=0 deaths=1(cause=Reaver Pirate · unidentified weapon · STARBOARD · closing 1.4 hulls/s · hull breach,telegraph=Engine Flare) deathStory=Reaver Pirate · unidentified weapon · STARBOARD · closing 1.4 hulls/s · hull breach|Engine Flare@917ms/witnessed waves=w1:completed/60.033333s,w2:censored/censored:0.546667s cleanup=w1:46t/0.766667s menus=0@0/wave firstDeath=61.4s firstDeathMin=1.023333min
[swarm-bars] loadout=energy_baseline build=energy_baseline/ship_kestrel/wpn_pulse_laser_s seed=13502 firstHostile=0.05s firstKill=12.05s verbs=3@15.174507/min moments=18@3.902016/min quiet=44 quietAfterW1=34 deaths=1(cause=Reaver Pirate · unidentified weapon · FRONT · closing 1.0 hulls/s · hull breach,telegraph=Engine Flare) deathStory=Reaver Pirate · unidentified weapon · FRONT · closing 1.0 hulls/s · hull breach|Engine Flare@1117ms/witnessed waves=w1:completed/60.033333s,w2:completed/60.033333s,w3:completed/60.016667s,w4:completed/60.016667s,w5:censored/censored:33.58s cleanup=w1:46t/0.766667s,w2:46t/0.766667s,w3:46t/0.766667s,w4:46t/0.766667s menus=0@0/wave firstDeath=276.8s firstDeathMin=4.613333min
[swarm-bars] loadout=physics_toolkit build=physics_toolkit/ship_hornet/wpn_concussion_cannon_m+wpn_gravity_marker_s+wpn_momentum_sink_s seed=4242 firstHostile=0.05s firstKill=1.75s verbs=2@9.775388/min moments=46@4.365707/min quiet=0 quietAfterW1=0 deaths=1(cause=Dreadnought 'Iron Maw' · Heavy Autocannon M · PORT · not closing · hull breach,telegraph=Broadside charge) deathStory=Dreadnought 'Iron Maw' · Heavy Autocannon M · PORT · not closing · hull breach|Broadside charge@967ms/witnessed waves=w1:completed/60.033333s,w2:completed/60.033333s,w3:completed/60.016667s,w4:completed/60.016667s,w5:completed/60.033333s,w6:completed/60.033333s,w7:completed/60.033333s,w8:completed/60.033333s,w9:completed/60.033333s,w10:completed/60.033333s,w11:censored/censored:24.183333s cleanup=w1:46t/0.766667s,w2:46t/0.766667s,w3:46t/0.766667s,w4:46t/0.766667s,w5:46t/0.766667s,w6:46t/0.766667s,w7:46t/0.766667s,w8:46t/0.766667s,w9:46t/0.766667s,w10:47t/0.783333s menus=3@0.272727/wave firstDeath=632.216667s firstDeathMin=10.536944min
[swarm-bars] loadout=physics_toolkit build=physics_toolkit/ship_hornet/wpn_concussion_cannon_m+wpn_gravity_marker_s+wpn_momentum_sink_s seed=8008 firstHostile=0.05s firstKill=5.633333s verbs=3@15.6/min moments=28@1.4/min quiet=70 quietAfterW1=70 deaths=0(none) deathStory=n/a(survived; no death story) waves=w1..w19:completed/60.03s,w20:censored/44.78s menus=4@0.2/wave firstDeath=censored@1200s(survived to 1200s (right-censored; not a run-length-to-death)) firstDeathMin=censored@20min
[swarm-bars] loadout=physics_toolkit build=physics_toolkit/ship_hornet/wpn_concussion_cannon_m+wpn_gravity_marker_s+wpn_momentum_sink_s seed=13502 firstHostile=0.05s firstKill=4.416667s verbs=3@26.5/min moments=49@2.45/min quiet=189 quietAfterW1=188 deaths=0(none) deathStory=n/a(survived; no death story) waves=w1..w19:completed/60.03s,w20:censored/44.78s menus=4@0.2/wave firstDeath=censored@1200s(survived to 1200s (right-censored; not a run-length-to-death)) firstDeathMin=censored@20min
[swarm-bars] loadout=massline_rig build=massline_rig/ship_drifter/wpn_concussion_cannon_m+wpn_gravity_marker_s+mod_engine_fusion_m+mod_elastic_whip_m seed=4242 firstHostile=0.05s firstKill=7.25s verbs=6@58.35/min moments=22@1.1/min quiet=402 quietAfterW1=397 deaths=0(none) deathStory=n/a(survived; no death story) waves=w1..w19:completed/60.03s,w20:censored/44.78s menus=4@0.2/wave firstDeath=censored@1200s(survived to 1200s (right-censored; not a run-length-to-death)) firstDeathMin=censored@20min
[swarm-bars] loadout=massline_rig build=massline_rig/ship_drifter/wpn_concussion_cannon_m+wpn_gravity_marker_s+mod_engine_fusion_m+mod_elastic_whip_m seed=8008 firstHostile=0.05s firstKill=3.45s verbs=6@124.95/min moments=40@2/min quiet=307 quietAfterW1=302 deaths=0(none) deathStory=n/a(survived; no death story) waves=w1..w19:completed/60.03s,w20:censored/44.78s menus=4@0.2/wave firstDeath=censored@1200s(survived to 1200s (right-censored; not a run-length-to-death)) firstDeathMin=censored@20min
[swarm-bars] loadout=massline_rig build=massline_rig/ship_drifter/wpn_concussion_cannon_m+wpn_gravity_marker_s+mod_engine_fusion_m+mod_elastic_whip_m seed=13502 firstHostile=0.05s firstKill=7.616667s verbs=5@60.7/min moments=27@1.35/min quiet=445 quietAfterW1=433 deaths=0(none) deathStory=n/a(survived; no death story) waves=w1..w19:completed/60.03s,w20:censored/44.78s menus=4@0.2/wave firstDeath=censored@1200s(survived to 1200s (right-censored; not a run-length-to-death)) firstDeathMin=censored@20min
```

Survivor wave lists are collapsed to `w1..w19:completed/60.03s,w20:censored/44.78s` here because nineteen identical 60.033 s duration waves add no information. Every named bar is on the line. The uncollapsed printer output is in `.devshots/camp0909/scratch/cells/`.

## What this is not

This is not a pacing pass and not a kit-balance pass. Quota, hit points, Pulse, kits, wave recipes, and `src/` were not touched. PQ-174 cannot close on these two Outcome clauses: a chase-bot does not die between eight and fourteen minutes as a distribution, and most long cells are not free of quiet seconds after wave one.

## Checks

- `node --check` on every edited JS file
- `node --test test/pq-174-packet-bars.test.mjs test/swarm-metrics.test.mjs test/crucible-swarm-bars.test.mjs` — 24 pass, 2 skipped
- live nine-cell sweep — 9/9
- `npm run check:baseline` — entry 12/15, exit 12/15. Same three reds: `pq020-ceres-topology`, `sim` (hash `371585f2…`), `sim-v3` (hash `cf864ee1…`). Exit list is not longer. Goldens were not re-recorded.
