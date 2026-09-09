# SPEC3-F6 — Bases, Claims & Tower Defense (specs 26–28)
**Thread:** F6 · **Reads:** `_context/02_SIM_ECONOMY_WORLD.md` §6, GDD §12 note · **Status:** PLAN
**Thread pitch:** the ambitious layer — a place that is *yours*, sieges you defend like a flying
tower-defense, and a faction war you can finally see and swing. Built almost entirely from systems
that already run.

Ground truth: TWO parallel base systems exist — **Outposts** (abstract nodes: production, storage,
autosell −20%, raid roll every 600 s `clamp(danger·0.4/defenseMult, 0, .5)` → lose 70% storage,
frozen 300 s) and **Claims** (in-world bodies: CLAIM_COST 15k, slots by size S:2/M:3/L:4, modules =
Cargo Depot 4.5k / On-Site Refinery 12k / Quantum Teleporter 45k / Defense Battery 8k, each mapping
to real tech nodes). Only **2 claimable bodies exist in the whole world** (Io Reach M, Charon S).
Alphabet drone programs (`mine_to_depot / patrol_guard / scout_report`) already bridge automation →
claims. Faction war layer: power scores, 5 contested pairs `{tension, state, playerLean, momentum}`,
war at tension≥75, **sector flips owner at |momentum|≥100** — fully simulated, invisible. Fleet
wingmen with guard orders cut raid probability (`_guardCountFor`). GDD §12 deferred this layer
("depth for later") — SPEC3 is that later.

**Thread-level decision (the recon asked):** Outposts and Claims UNIFY. Claims (in-world bodies)
become the *only* player base; outpost *functionality* (production/storage/autosell/raids) migrates
into claim modules. One system, one screen, one mental model. Outpost purchase UI retires; existing
saves migrate outposts into claim-equivalents at the nearest claimable body (one-time migration).

---

## SPEC3-26 — Player bases: the claim system, grown up
**One-line pitch:** claims become real places — visible from space, modular, staffed by your drones,
supplied by your lanes — the mid-game's home and the endgame's stake.

### 1. Why
Recon §7.4-2/3: the claims layer is "starved of places to build" (2 bodies!) and split across two
overlapping systems. A base you can *see grow* is the strongest retention structure in the genre
(X4 stations, NMS bases) — and every ingredient is already simulated here except the content and
the unification.

### 2. The design
- **Claimable bodies everywhere they make sense:** 12–16 total (from 2): every sector gets 1–2
  except Helios (0 — core worlds don't sell land) and Ashfall (1, endgame trophy site). Mix of
  sizes: S (2 slots) common, M (3) fringe, L (4 — NEW size) exactly three, deep in dangerous space.
  Placement is authored data (`claimableBodies.js` + sector POIs) per F7-30's sector identity map.
- **Module roster (unified, all tech-gated as today):** Depot (drone sell-point + player storage),
  Refinery (F2-14 purity rules), Defense Battery (F6-27's turret anchor), Teleporter (the map-
  rewriter, late-game), + NEW: **Hangar** (stations 1 wingman on-site for defense, F5-25),
  **Habitat** (passive cr/min — the old habhub outpost, now a module), **Sensor Post** (extends
  scanner/intel radius sector-wide, feeds F1-11 memory freshness).
- **Visible growth:** each module adds a visible structure part on the body mesh (authored part per
  module, SPEC3-37 queue — 7 small parts). Your claim silhouette tells its story from across the belt.
- **Supply lines as content:** modules consume `cmdty_base_parts` (F2-14 sink) to build and upkeep
  in credits; alphabet drones (exist) run your ore→refinery→depot line. The base is a *logistics
  puzzle you fly inside of*, not a menu.
- **The ledger honesty rule:** the claim screen shows net cr/min including upkeep, raid losses
  trailing-average, and the passive cap (A(T)·0.45 funnel — recon §6.2 — stays sacred: bases are
  *texture and strategy*, never an idle-game exploit).

### 3. Architecture & wiring
`claims.js` absorbs outpost production/storage/raid logic from `automation.js:669-742` (move, don't
rewrite — the math is proven). Migration shim on `save:loaded`: each legacy outpost → claim at
nearest body with equivalent modules, one summary toast. Claim state already serializes with stable
poiId re-attach (recon §6.6). New module defs in `claimableBodies.js` `BODY_MODULES` (same
`techReq` pattern). Drone programs unchanged (depot MOVE target exists). Passive income all still
routes `creditPassive()` — the cap funnel is untouchable.

### 4. Key code
```js
// Migration — the only dangerous step. One pass, idempotent, logged. Never delete on failure.
function migrateOutpostsToClaims(state) {
  if (state.claims.migratedV1) return;
  for (const o of state.automation.outposts ?? []) {
    const body = nearestClaimableBody(state, o.sectorId);
    if (!body) { keepLegacy(o); continue; }              // no body? outpost keeps running, flagged
    claimIfNeeded(state, body, { free: true });
    addModule(body, OUTPOST_TO_MODULE[o.type], { carryStorage: o.storage, carryLevel: o.level });
  }
  state.claims.migratedV1 = true;
  bus.emit('claims:migrated', { count: n });
}
```

### 5. Assets & generation
Author a coherent visible module suite for the shipped roster (hopper, battery, hangar, habitat,
sensor, depot, and teleporter are the initial needs). Choose geometry, materials, animation, LOD, and
reuse from each module's silhouette, interaction, viewing distance, and measured scene cost; no
triangle or material count in this plan is a quality ceiling. Existing asteroid/moonlet bodies may be
reused where the result remains distinctive, with authored bodies available when reuse weakens the
claim's identity.

### 6. Libraries / tooling
Prefer existing seams, but allow build/runtime dependencies when they materially improve the result
and document license, bundle/memory/performance, determinism/save, parity, and maintenance impact.

### 7. Build plan
1. Unification: move outpost math into claims; migration shim; retire outpost purchase UI;
   `scripts/check-claims-unified.mjs` (migration idempotent, cap funnel intact, legacy saves load).
2. Body content pass: 12–16 bodies + L size (data, with F7-30).
3. New modules (Hangar/Habitat/Sensor Post) + build/upkeep sinks.
4. Visible-growth part bindings.
5. Claim ledger panel (honest math).
6. Floor: `check:sim:compare`, automation offline-catchup check, `check:balance`.

### 8. Anti-patterns
Two base systems (the unification IS the spec); tile-grid building (node+slots is the taste — this
is not a city builder); bases that print money past the passive cap; mandatory basing (a pure
combat/trade run must never require one); off-screen base death without the F6-27 defense chance.

### 9. Ambition ceiling
Claim naming + beacon broadcast: your base name appears on the local map for NPCs too — traders
route to your depot to *buy from you* (one OFFER_MIX hook), pirates name-drop it in threats.

---

## SPEC3-27 — Sector tower defense: the siege
**One-line pitch:** raids stop being a dice roll and become a playable defense — waves you meet with
batteries, snare mines, wingmen, and your own hull; the game's tower-defense mode, flown not placed.

### 1. Why
The raid system today: an invisible roll every 600 s, −70% storage on a loss. Real stakes, zero
drama, zero counterplay beyond a defense stat. That's a tower-defense game with the game deleted.
The user's explicit ambition ask — "tower-defense playtype in different sectors" — lands exactly here.

### 2. The design
- **Raid becomes an event, not a roll.** When the (existing) raid roll trips *while you're in-sector*
  or *within one jump* (sensor post extends this), it converts to a **siege**: 2–4 waves over ~4 min
  approach your claim from seeded vectors. Off-sector with no warning coverage → today's abstract
  roll stands (absence has costs; presence has gameplay).
- **The defense toolkit (all existing verbs, aimed at defense):**
  - *Defense Battery modules* = real autonomous turrets (turret policies from F4-20) with fields of
    fire you position by choosing which body slot they occupy — slot geometry becomes tactics.
  - *Snare mines* (F4-20) laid on approach vectors — the "maze" of this tower defense.
  - *Hangar wingman* launches on siege start (stance: cover the depot).
  - *Your ship* is the hero tower: tether-sling rocks into the wave (F3-17), vent-bomb clusters
    (impulse charges), kite with cruise denial (they carry disruptors at higher tiers, F4-20).
- **Wave grammar (readable, escalating):** raiders telegraph the *target module* (amber beam-mark
  10 s out — GDD telegraph doctrine). Wave 1 probes (fighters), wave 2 brings breachers targeting
  batteries, final wave = a named lieutenant (mini-F4-22 with a gimmick). Between waves: 20 s to
  re-position, re-lay mines, repair a battery (hold-interact).
- **Stakes & mercy:** losing a siege = raiders strip 70% storage + disable (not destroy) one module
  (repair cost). Winning = salvage + rep + a *deterrence window* (pressure −50% for 20 min) + the
  ticker headline. Never full base loss — grief-quitting is a design failure, not player failure.
- **Difficulty scaling:** siege budget = claim value × sector danger (the director's pressure
  economy, F4-21, reused at claim scope). Rich quiet-sector bases stay quiet; a fortune parked in
  Sker Haven *will* be contested. Player chooses their risk address — that's the strategy layer.

### 3. Architecture & wiring
New `src/systems/siege.js`: converts `claims` raid triggers into director shapes (`encounter:spawned
{shape:'siege'}`), owns wave FSM + intermission timers + outcome application (reusing the existing
raid-loss math for the lose branch — one source of truth). Batteries = turret entities using F4-20
policy resolver; battery state persists on the claim. Seeded approach vectors from sector stream.
Emits `siege:started/waveCleared/resolved` (telemetry + ticker + music intensity, SPEC3-39).
Determinism: waves fully seeded; sieges only spawn player-present (no offscreen sim divergence —
offscreen keeps the legacy roll).

### 4. Key code
```js
// The conversion rule — presence upgrades dice into gameplay. This single branch is the spec.
function onRaidTrip(claim, state, rng) {
  const coverage = playerInSector(state, claim.sectorId)
    || (hasSensorPost(claim) && playerWithinJumps(state, claim.sectorId, 1));
  if (!coverage) return legacyRaidRoll(claim, state, rng);        // absence: old math, untouched
  bus.emit('siege:started', { claimId: claim.id, budget: siegeBudget(claim, state), seed: rng.fork(claim.id).state() });
}
```

### 5–6. Assets / deps
Battery turret = existing turret meshes on a mount part; beam-mark telegraph = existing decal pool.
Existing assets are a starting point, not a dependency ban. Add build/runtime dependencies when they
materially improve the result and document license, performance, determinism/save, parity, and
maintenance impact.

### 7. Build plan
1. `siege.js` skeleton + conversion rule + 2-wave probe siege; `scripts/check-siege.mjs`
   (seeded waves deterministic; lose-branch math equals legacy raid; deterrence window applies).
2. Battery-as-turret entities + slot fields of fire + repair interact.
3. Wave grammar (telegraphs, intermissions, lieutenant) + mercy rules.
4. Budget scaling via director pressure; ticker/music hooks.
5. Floor: `check:sim:compare`, claims checks, `check:ai:telegraphs` extension.

### 8. Anti-patterns
Base-destruction death spirals; sieges while you're 6 jumps away with no warning (coverage rule);
turret micromanagement UI (policies + slot choice only — you FLY, the base fights); waves that
ignore your toolkit (every wave must be solvable by ≥2 of: batteries/mines/tether/wingman/kiting);
siege spam (deterrence window + pressure economy meter it).

### 9. Ambition ceiling
Escort-the-convoy inversion: after 3 defended sieges, the raiding faction sends a *hauler-killer*
after your drone supply line instead — defend the lane, not the base. Same systems, inverted board.

---

## SPEC3-28 — Territory & the visible faction war
**One-line pitch:** surface the running war sim as a map layer + campaign chains, and let claims,
sieges, and econ-warfare push it — the strategic metagame that was already true, finally shown.

### 1. Why
Recon §5.1/§7.3-2: an entire strategy layer (power, tension, war state, sector flips) runs daily and
invisibly. Players influence it already (kills nudge tension) *without knowing*. Invisible agency is
wasted agency.

### 2. The design
- **War map overlay (nav chart):** contested pairs get a front-line treatment: tension gauge
  (cold/tense/war), owner hue wash, momentum arrow. One toggle, one glance = the state of the war.
- **The campaign chains (playing the war):** at `tense`, both sides' stations offer strike chains
  (3 missions: supply strike → patrol sweep → siege support) built from existing types + F1-12's
  econ strikes. Completing a chain applies a momentum nudge (±15 of the 100 flip threshold — wars
  are pushed, not won, by one player… until the final blow).
- **The flip event:** at |momentum|≥100 the (existing) flip fires visibly: ticker headline, station
  services/OFFER_MIX re-skin over 1 game-day, gate tolls change hands, palette accent shifts
  (SPEC3-35 hook). If the player's chain landed the last nudge: a named beat — comms from the
  faction lead, rep +40, a claim charter discount in the new territory.
- **Claims in the crossfire:** your claim in a *war* sector gets siege pressure from the losing
  side (they need your depot). Sensor posts and Hangars in war zones become the difference between
  empire and rubble. Territory play and base play close the loop.
- **Neutrality is a stance:** ignoring the war keeps rep-neutral prices but pays war-zone spreads
  (frontier penalty already widens spread — recon §1.3, it just starts *meaning* something).

### 3. Architecture & wiring
War state already lives in the faction day-tick — expose read API `factions.getWarState()`.
Overlay renders in `starmap.js`. Chains: mission templates gated on pair state; momentum nudges via
the existing playerLean/tension fields (bounded ±15/chain, cooldown 1 game-day per pair). Flip
consequences: station reskin = data swap on `stationId → factionId` (services table + OFFER_MIX
already key off faction/station type); emit `faction:sectorFlipped` for ticker/palette/claims.
Determinism: war sim already deterministic; chains are missions (seeded boards).

### 4. Key code
```js
// Momentum nudge — bounded, cooldown-gated, logged. The player is a thumb on the scale, not the hand.
function applyChainOutcome(pair, side, state) {
  if (state.sim.day <= pair.lastPlayerNudgeDay) return;           // one nudge per pair per day
  pair.momentum += side === pair.a ? +15 : -15;
  pair.lastPlayerNudgeDay = state.sim.day;
  bus.emit('war:nudged', { pair: pair.id, momentum: pair.momentum });
}
```

### 5–6. Assets / deps
Overlay starts from current map styling; flip reskin starts from current palette/services data.
Dependencies remain allowed under the documented repository impact policy when they improve quality.

### 7. Build plan
1. War-state read API + map overlay; `scripts/check-war-overlay.mjs` (overlay mirrors sim state).
2. Strike chains + momentum nudge rules.
3. Flip event surfacing (ticker, reskin, tolls, named beat).
4. War-zone siege pressure + claim charter discounts.
5. Floor: faction day-tick determinism check, `check:sim:compare`.

### 8. Anti-patterns
Letting one mission flip a sector (chains nudge, never decide alone); war UI that needs a wiki
(gauge + arrow + hue, done); punishing neutrality into nonviability (spreads, not lockouts); wars
resolving while the player literally cannot see them (every flip headlines, always).

### 9. Ambition ceiling
A war *epilogue* card per flip (one screen: what changed, who holds what, your part in it) — the
Crusader Kings trick: history you feel authored by. Zero sim, pure read.
