# SPEC3-F4 — Combat, Weapons & AI (specs 19–22)
**Thread:** F4 · **Reads:** GDD_2_0 §6, constitution · **Status:** PLAN
**Thread pitch:** combat where momentum is the defense, intent is always readable, and every named
enemy is a character. Builds directly on F3 (flight/tether) and F5 (builds).

Research anchors: **Highfleet** — enemy fire *leads your current velocity vector*; a last-second
vector break (ideally under afterburner, ×3 thrust) defeats the lead; homing missiles that lose LOS
coast ballistic and miss; **all released ordnance inherits carrier momentum**. **RGO** — cut features
lesson: they removed beam spam and capital-subsystem micro in favor of *turret-targeting only* —
focus beats breadth; turret auto-track modes (targeted/fighters/capitals/manual). **Freelancer** —
cruise disruptors as the "you must fight now" verb; encounter shapes (patrol scan, ambush at lane
break). **FTL** — power routing as mid-fight decision. **Starsector** — overload/vent as readable
commitment states.

---

## SPEC3-19 — Combat feel: the momentum defense & damage triangle surfaced
**One-line pitch:** make dodging a physics skill (velocity-lead aim + vector breaks) and make the
existing damage model legible at a glance.

### 1. Why
GDD §2: "combat weak — feedback whispery, AI intent unreadable, no physics verbs." The damage kernel
(shield/armor/hull/cap + resists) is sound but invisible; enemy aim is either perfect or random, so
*your* momentum never matters defensively. Highfleet's triad fixes that with three rules.

### 2. The design
- **Velocity-lead aim (all NPC fire).** NPCs aim at `pos + vel·t_impact` (current velocity, straight
  extrapolation — deliberately dumb). Therefore: constant-velocity flight = death; a sharp vector
  change inside the projectile's flight time = clean whiff. Boost/dash multiplies the break. Skill
  expression falls out: juke timing, not HP sponging. Accuracy knob per archetype = lead-noise σ.
- **Projectiles inherit shooter momentum** (Highfleet). Your speed adds to your shells; a strafing
  run *feels* like a strafing run. (Determinism-safe: it's just initial velocity.)
- **Missiles: LOS + fuel.** Seekers track only with line-of-sight; break LOS behind an asteroid →
  they coast ballistic. Fuel 6 s → inert. Flares (existing countermeasure X) force 1.2 s of no-track.
  Asteroids become *cover*, feeding F3's slingshot-around-rock play.
- **Damage triangle surfaced (GDD §6.1 kept, numbers locked):** Energy ×1.5 shield / ×0.6 armor;
  Kinetic ×0.6 shield / ×1.4 armor; Explosive ×1.0 hull + radial impulse (physics!). Target panel +
  in-world thin arcs show the three bars; enemy silhouette tint shifts subtly as layers strip.
- **Commitment states readable:** active-vent (F5) and overload glow states on NPCs — you *see* the
  window open ("his shields are down AND he can't fire — go").

### 3. Architecture & wiring
- `src/systems/weapons.js`: projectile spawn adds shooter velocity (respect the `typeof window`
  heat-vent determinism gate — do not touch that code path). Lead calc into `src/ai/` gunnery util
  (one function, shared by all archetypes; noise from the sim RNG stream).
- Missiles: `losBlocked(raycast)` each sim tick (cheap: 1 ray per live missile, cap 24 live).
- Damage panel arcs: hud.js target panel + a pooled in-world arc sprite (SPEC3-34's pool).
- Events already exist for shield-break/kill (F3 camera consumes them).

### 4. Key code
```js
// ai/gunnery.js — the dumb lead IS the game design. Do not "improve" it with iterative solvers;
// smarter aim deletes the player's counterplay. σ noise is per-archetype personality.
export function leadPoint(shooter, target, projSpeed, rng, sigma) {
  const dp = sub(target.pos, shooter.pos);
  const t = len(dp) / projSpeed;                       // one-step, no iteration — intentional
  const p = add(target.pos, scale(target.vel, t));
  return add(p, gaussJitter(rng, sigma * t));          // noise grows with range: close = deadly
}
```

### 5–6. Assets / deps
No new assets (arcs use pooled sprites); no new deps.

### 7. Build plan
1. Lead aim + σ per archetype + `scripts/check-velocity-lead.mjs` (scripted straight-line dummy gets
   hit ≥80%; scripted juke dummy ≤25%). This check is the *design* — protect it forever.
2. Projectile momentum inheritance; re-record affected goldens as one deliberate batch.
3. Missile LOS/fuel/flare rules + check (behind-asteroid break test).
4. Triangle multipliers to data + target-panel bars + in-world arcs.
5. Regression floor: `check:sim:compare`, `check:ai:telegraphs`.

### 8. Anti-patterns
Iterative/perfect intercept solvers; hitscan-only enemies (nothing to dodge); damage numbers by
default (bars + VFX carry it); missiles that never miss (helplessness is the worst feeling in the
genre).

---

## SPEC3-20 — Weapons, loadouts & tactics
**One-line pitch:** a compact, tactical weapon grammar — turret policies, ammo verbs (impulse
charges, disruptors, mines), and heat as the pace-setter.

### 1. Why
~35 weapons exist but read as stat rows. RGO's lesson: fewer, sharper categories with real *policies*
beat breadth. F3/F5 create the slots (mounts, budgets) — this spec makes what goes in them tactical.

### 2. The design
- **Turret policies (RGO):** per-turret stance set in outfitting, cycled in flight (long-press Tab on
  target panel): *My target / Fighters / Biggest / Manual-only*. This is fleet-command-lite without
  an RTS UI; haulers with PD turrets become real builds.
- **The verb ammo family** (all inherit momentum, all physics-first):
  - **Impulse charge** (F3-17 owns the impulse; here: the launcher item, 6 s arm, friendly fire on).
  - **Cruise disruptor** (Freelancer): slow missile, ~0 damage, drops target from cruise + 0.5 s
    stumble. Pirates get it *first* (interdiction, SPEC3-21); the player earns it mid-game — being
    the interdictor is a fantasy graduation.
  - **Snare mine:** deployable web, 2.5 s slow-field — zone control for defense play (SPEC3-27).
  - **Breacher torp:** slow, PD-vulnerable, big alpha vs shields-down targets only (the vent/overload
    window pays off).
- **Heat is the pace-setter:** sustained fire heats to soft-cap (damage −25% while amber), the F5
  vent stance is the reset. Weapon families get heat *shapes* (lasers ramp, cannons spike, missiles
  ~0) so loadouts have rhythm signatures.
- **Fixed vs turret doctrine** (F5-23): fixed = +damage +mount HP, aim skill; turrets = arcs +
  policies. Both viable lanes, chosen at the fit screen.

### 3. Architecture & wiring
`src/data/weapons.js` gains `family, heatShape, policyCapable`; turret policy = per-mount field in
the fit (saved). Targeting util shared with SPEC3-19 gunnery. Disruptor/snare effects = status flags
consumed by cruise.js / flight (`slowFieldMul`). All new projectiles through the existing pooled
projectile system.

### 4. Key code
```js
// Turret policy resolver — one pure function, called per turret per AI tick (4 Hz, not 60).
function turretTarget(policy, contacts, playerTargetId) {
  switch (policy) {
    case 'mytarget': return playerTargetId;
    case 'fighters': return nearest(contacts.filter(c => c.class === 'fighter'));
    case 'biggest':  return maxBy(contacts, c => c.mass);
    default:         return null;                       // manual: fires only on player trigger
  }
}
```

### 5–6. Assets / deps
Charge/mine/torp reuse existing projectile meshes + tint; disruptor gets a distinct blue-white
corkscrew trail (SPEC3-34 recipe). No new deps.

### 7. Build plan
1. Weapon family/heat-shape data pass + soft-cap; extend heat checks (respect weapons.js vent gate).
2. Turret policies (fit UI + cycle input + resolver) + `scripts/check-turret-policy.mjs`.
3. Disruptor + stumble integration (F3) — pirate variant first, player item at T3 shops.
4. Snare mine + slow-field status; breacher torp + PD interaction test.
5. Golden batch for projectile changes (with SPEC3-19's).

### 8. Anti-patterns
Weapon bloat (every addition must create a *decision*, not a +5%); policies that need a pause menu;
homing that ignores the LOS rule; disruptor spam on the player before mid-game (one snare per
encounter, SPEC3-21 enforces).

---

## SPEC3-21 — Enemy AI & the encounter director
**One-line pitch:** archetypes that telegraph intent, read *your* build, and arrive via a
deterministic director that shapes encounters like a DM — this is SPEC2/04 World-Alive's combat half,
specified.

### 1. Why
`CURRENT_BUILD_STATUS`: `src/systems/encounterDirector.js` is NOT BUILT — the biggest missing system
in the repo. The FSM archetypes are solid but mute and context-blind. Fights spawn as stat lumps, not
situations.

### 2. The design
- **Telegraph grammar (GDD §6.2 kept + locked):** 0.5 s engine-flare + sting before attack runs;
  wind-up glow on heavies; flee = cargo dump + smoke + bark. One bark channel, 4 s global cap
  (pillar 3). All barks through the attention arbiter (SPEC3-40).
- **Build-reading AI (cheap, huge):** archetypes read F5 derived stats — brawlers avoid targets with
  high `turnRate` unless escorted; pirates prefer `cargoMass > x` and *hail before firing* ("drop 20
  ore, live") — the toll event card feeds economy/faction sims; snipers hold at your-vmax × 1.15.
- **The director (deterministic, budgeted):** per-sector *pressure budget* accumulates from player
  noise (mining loudness exists in `dangerModel.js`), wealth visible (cargoMass), faction standing,
  and story beats. Director spends budget on encounter *shapes* from a weighted deck: patrol-scan,
  pirate-toll, ambush-at-snare, distress-bait, convoy-passing, bounty-hunter (if player bounty > 0),
  rescue-op. Each shape = spawn recipe + script + exit conditions. Budget spent = quiet period
  (pacing valve — the game *breathes*).
- **One-snare rule:** max one cruise-snare per shape instance; no chain-stunning.
- **Difficulty = composition, not stat inflation:** higher pressure buys escorts/gimmicks (cutter,
  PD screen, disruptor), never +HP%.

### 3. Architecture & wiring
- New `src/systems/encounterDirector.js` (the missing SPEC2/04 system — this spec IS its build
  order): consumes `dangerModel` noise, faction state, story flags; seeded from sector RNG stream;
  emits `encounter:spawned {shape, seed}` / `encounter:resolved {shape, outcome}` for telemetry +
  missions. Runs at 1 Hz in the fixed step.
- Shapes as data: `src/data/encounters.js` (deck weights per sector class, spawn recipes referencing
  existing enemy defs, script = small FSM per shape).
- Wire cruise snare (F3), disruptor (F4-20), formations (`check:sg06:formation` steering), comms
  hails (existing comms + event-card choice UI from GDD §6.4).

### 4. Key code
```js
// encounterDirector.js — the deck draw. Determinism: sector stream RNG, budget integer math only.
function maybeSpawn(state, rng) {
  const s = state.sector, budget = s.pressure;
  const deck = ENCOUNTERS[s.class].filter(e => e.cost <= budget && e.gate(state));
  if (!deck.length || rng.next() > spawnChance(budget)) return;
  const shape = weightedPick(deck, rng);
  s.pressure -= shape.cost;                      // spending = pacing. The subtraction IS the design.
  spawnShape(state, shape, rng.fork(shape.id));  // forked stream: shape internals can't desync sector
}
```

### 5–6. Assets / deps
No new assets (shapes recombine existing enemies/VFX); no new deps.

### 7. Build plan
1. Director skeleton + pressure model + 2 shapes (patrol-scan, pirate-toll) +
   `scripts/check-encounter-director.mjs` (deterministic deck draws over 36k ticks; budget conserved;
   quiet periods exist ≥30% of time).
2. Telegraph pass on all archetypes (extend `check:ai:telegraphs`).
3. Build-reading policies (derived-stat inputs) + hail/toll event cards.
4. Remaining shapes (ambush, distress-bait, convoy, bounty-hunter, rescue).
5. This closes SPEC2/04 — reconcile `CURRENT_BUILD_STATUS.md` when green.

### 8. Anti-patterns
Random spawn timers (pressure budget or nothing); stat-inflation difficulty; two shapes running at
once in one sector; barks outside the arbiter; snare chains; distress calls that are *always* traps
(60/40 real — trust must be worth something or bait means nothing).

---

## SPEC3-22 — Bosses, named enemies & setpieces
**One-line pitch:** twelve hand-authored named hunters with builds, gimmicks, and grudges — the
campaign's faces and the loot system's destinations.

### 1. Why
GDD §6.4 wants bounties as "characters, not stat lumps." F5-24's legendaries need named sources.
Nothing in the sim is memorable *by name* yet — that's the gap between good and beloved.

### 2. The design
- **12 named hunters**, one per faction-flavor pairing, each = hull + F5 build + ONE gimmick +
  escort doctrine + 3 barks + a legendary drop. Examples: *Mother Cormorant* (salvage queen —
  tether-cutter + winch-yanks YOUR ship; drops Cormorant Winch), *Deacon Glass* (sniper — glasspoint
  array, breaks off at 40% and returns with +1 escort next time; the grudge persists in save),
  *The Tollman* (ex-patrol capital — PD screen + breacher volleys; only fights if you've stiffed 3+
  tolls). Gimmicks are *verbs from this plan* turned against you — the game examining the player.
- **Escalation, not respawn:** each escape/defeat mutates their next appearance (escort +1, new
  gimmick module) up to 3 tiers. Kill = permanent, marked on the codex, legendary guaranteed.
- **Setpiece staging:** hunters arrive via director shapes with a 10 s *entrance* (comms bark →
  silhouette at range → engines flare) — never teleport-ambush. The kill gets the F3-18 kill-cam
  micro-beat (the one sanctioned camera performance).
- **Discovery:** rumors at bars sell hunter locations (existing rumor plumbing + SPEC3-31 intel).

### 3. Architecture & wiring
`src/data/namedEnemies.js` (12 defs: build, gimmick flags, barks, dropId, escalation table);
`state.world.hunters[id] = {tier, alive, lastSector}` (saved). Spawn via director shape
`named-bounty` gated on rumor/mission state. Gimmicks reuse F4/F3 systems via modifier flags —
no bespoke boss code paths beyond the entrance script.

### 4. Key code
```js
// The grudge is 6 lines of save state. Memorability per byte, best deal in the plan.
bus.on('encounter:resolved', ({ shape, outcome, hunterId }) => {
  if (shape !== 'named-bounty') return;
  const h = state.world.hunters[hunterId];
  if (outcome === 'playerKill') { h.alive = false; grantDrop(h.dropId); }
  else h.tier = Math.min(3, h.tier + 1);          // he remembers. Next time he brings friends.
});
```

### 5. Assets & generation
Reuse hulls with a *named treatment*: unique hue + one swapped signature part (F9-37 authors 12
signature parts, small queue) + name chip on target panel. Barks: text only. No portrait requirement
(codex chip = initials + hue).

### 6–7. Deps / build plan
No new deps. Build: 1) data + grudge state + 3 hunters + `scripts/check-named-hunters.mjs`
(escalation table, drop guarantee, entrance timing); 2) remaining 9; 3) rumor gating; 4) kill-cam
beat. Parallel-safe after director ships.

### 8. Anti-patterns
HP-sponge bosses; teleport ambushes; gimmicks that ignore player verbs (every gimmick must be
counterable by tether/vector-break/vent play); more than one hunter active per sector; killing a
hunter off-screen via automation (they only spawn on the player).

### 9. Ambition ceiling
Hunter *alliances* at tier 3: two surviving hunters arrive together once — the "oh no" screenshot
moment the trailer uses.
