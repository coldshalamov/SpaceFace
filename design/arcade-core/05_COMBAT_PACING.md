<!-- LIFETIME: DURABLE -->
# 05 — COMBAT PACING: swarm, squishiness, time-to-fun

Owner's words: "enemies are few, far between, hard to kill, and not fun to fight, and I don't
feel like I'm getting anything from killing them." 01 fixes the reward side. This fixes the
fight itself — **without** touching global speed (I-5).

## The four dials (in priority order)

### 1. Density — more, weaker enemies, closer together

- `src/systems/spawnBudget.js` + `encounterDirector.js` own this. Retune populated-island
  pockets (I-6) toward **groups of 3–7 light hostiles** as the default combat encounter, not
  singletons and pairs. Waves, not strays.
- Swarmers must be *disposable by design*: a swarmer dies to a short burst OR one good physics
  shove into terrain. If starter-fit TTK on a swarmer exceeds ~4 s of sustained fire, the
  hull/shield numbers are wrong, not the player.
- Escalation pressure: after a wing dies, a reinforcements timer can bring a slightly harder
  wing if the player loiters — keeps the vacuum-and-go rhythm (kill → collect → move).

### 2. Time-to-contact — fights start fast

- In populated islands, the player should be able to find a fight within ~10–20 s of arriving.
  Hostile spawn placement relative to player entry vectors must guarantee this; patrol/pirate
  ambient activity (07_LIVING_WORLD) provides the encounters.
- In empty space, the opposite holds by design: rare, scary ambushes. Contrast is the point.

### 3. Squishiness and lethality — rebalance the starter experience

- Audit light-enemy EHP against starter-weapon DPS: target swarmer TTK ≈ 2–4 s, brawler
  ≈ 8–12 s, ace = a fight. Enemy damage output vs starter hull tuned so a careless player
  survives ~30 s of focused fire — long enough to learn, short enough to matter.
- Mass classes make the physics kit the force multiplier: lights are ammunition (shoved,
  chained, burned), mediums need setup (mark/disrupt → shove), heavies are terrain.

### 4. Reward cadence — every fight pays, immediately

- Per 01: kills burst and vacuum now, in the fight, no menus.
- Credits per minute of combat in a populated island must sit meaningfully above costs of
  ammo/repair so combat is a viable income loop alongside mining/trading — priced against
  `CONTENT_BIBLE` scales, tuned in the lab.

## The starter ship (specific owner ask)

The starter hull is the reference experience: balanced, honest, and it must *demonstrate the
game's physicality out of the box* — enough impulse authority (or a cheap concussion-cannon
price point) that the player experiences an environment kill within their first few fights.
If the starter fit physically cannot produce a style kill, the onboarding of the entire
mechanic has failed.

Ship-class identity ladder stays intact (I-5): later ships change *what you can do* (nimble
dodger vs juggernaut ram/anchor), not just numbers.

## Bans

- No global speed/thrust raises (I-5).
- No HP-sponge difficulty. Difficulty comes from numbers, positioning, specialists, and
  collateral risk — per VISION.
- No spawn-closet pop-in on screen: reinforcements arrive from off-glass with engine-flare
  telegraphy.
- No hidden aimbot-accuracy inflation as difficulty design. A player-selected accuracy/ease
  setting may deliberately change lead error as specified in 56, while enemy damage and HP stay
  honest.

## Acceptance

- Bot route in the starter belt with starter fit: time-to-first-contact ≤ 20 s; swarmer TTK
  within band; kills/min and credits/min within the lab-tuned band; bot survives ≥ 3 wings
  using only starter weapons + terrain kills.
- Headless balance report: TTK table across enemy classes × starter weapons, regenerated as a
  check script.
- Human gate: owner plays 10 minutes and reports whether fights felt frequent, winnable, and
  worth it. Metrics inform; the owner's hand decides.
