# SpaceFace — Improvement Ideas (brainstorm + rating)

> **Process:** ≥25 ideas, each rated 1–10 on a weighted metric: *player-felt impact ×
> cost-to-build⁻¹ × alignment-with-vision*. Threshold to implement: **≥8**. Ideas below 8 go
> through up to 3 refinement passes to see if sharpening gets them over the line. Grounded in a
> real audit of the codebase (not imagination) — see audit findings cited inline.
>
> **Rating legend:** Impact / Cost / Vision → composite (higher = do it).
> Composite roughly = round( Impact × 0.5 + Vision × 0.3 + (10−Cost) × 0.2 ).

---

## PASS 1 — initial brainstorm (28 ideas)

### Real bugs found in audit (fix-first — these are pure wins)

**1. Fix the economy boom/shortage propagation bug**
`economy.js:821` — `dir = ev.type === 'shortage' ? -1 : -1` (both branches −1). Boom events
propagate as shortages. Comment confesses it.
- Impact 9 / Cost 1 / Vision 6 → **9.4** ✅ IMPLEMENT

**2. Fix NPC/drone trades running through the player's wallet**
`economy.js:412` hardcodes `isPlayer = true`; `aiTrader:requestTrade` and `miningDrone:sellOre`
debit/credit the *player*. NPC economy is a façade or a latent bug.
- Impact 8 / Cost 3 / Vision 9 → **7.6** (refine → see pass 2)

**3. Make crafting respect build time / queue**
Every recipe `timeS: 0`, `build()` synchronous. The `timeS` field is dead data. "Builder" is a
click-to-convert menu, not production.
- Impact 8 / Cost 5 / Vision 8 → **7.2** (refine → see pass 2)

**4. Fix the net-worth win condition placeholder**
`missions.js:997` `_netWorth()` returns just credits; owned ships/modules/assets ignored. Final
story beat can't be "won" by a fleet-builder.
- Impact 5 / Cost 2 / Vision 5 → **4.6** (refine → see pass 2)

### Feel / presentation gaps

**5. Dynamic point lights at muzzle/explosion/mining impact**
Lights that flash at events, lighting their surroundings. Huge sheen for low cost.
- Impact 8 / Cost 3 / Vision 7 → **7.6** (refine → pass 2)

**6. Tone mapping + color grading (ACES filmic)**
Fixes the flat/washed look every ungraded Three.js scene has.
- Impact 7 / Cost 2 / Vision 5 → **6.4**

**7. Distance fog / atmosphere**
Depth, mood, hides pop-in. Almost free.
- Impact 6 / Cost 1 / Vision 5 → **5.8**

**8. Subtle motion-blur + chromatic aberration during boost only**
The AAA tell without the AAA cost.
- Impact 5 / Cost 4 / Vision 4 → **4.4**

**9. Engine ribbon trails (GPU ribbon replacing particle trail)**
Currently particle-based (decent). A tapering ribbon mesh = cleaner, more pro.
- Impact 6 / Cost 6 / Vision 5 → **5.2**

### UX / clarity gaps

**10. Mini-map / sector overview with routes, threats, beacons**
Glanceable strategic view. Currently radar is tactical-only.
- Impact 7 / Cost 6 / Vision 9 → **7.0**

**11. Tooltip system: hover any stat/icon/commodity for info**
Mystery numbers = "I don't understand my own ship."
- Impact 6 / Cost 4 / Vision 4 → **5.0**

**12. Settings: text scale + color-blind palette**
Accessibility table-stakes (V2 §12). Currently missing.
- Impact 5 / Cost 3 / Vision 5 → **4.8**

**13. Loading screen with progress / animated starfield**
Currently silent black on init.
- Impact 5 / Cost 3 / Vision 3 → **4.2**

### Depth / coupling (V2 §18)

**14. Wire NPC haulers into the real economy (background sim)**
Faction traders run MOVE→INTERACT, their flows move prices. Your routes compete.
- Impact 9 / Cost 7 / Vision 10 → **8.2** ✅ IMPLEMENT (large — sequence after bugs)

**15. Threat escalation that mirrors player power (WANTED level)**
As net worth/fleet grows, world escalates visibly + fairly.
- Impact 8 / Cost 5 / Vision 9 → **7.6** (refine → pass 2)

**16. Wear/maintenance: drones/rovers/modules degrade, need upkeep**
Physical anti-idle; recurring cost turns "own" into "upkeep."
- Impact 7 / Cost 6 / Vision 8 → **6.8**

**17. Mass & inertia: cargo mass affects handling**
Carry-more vs stay-nimble as a loadout decision.
- Impact 6 / Cost 3 / Vision 6 → **5.6**

**18. Time-windowed market events (blockades, floods, black-market windows)**
Prevents solved-economy; expert reads the news feed.
- Impact 7 / Cost 4 / Vision 7 → **6.6** (already partial via economy events — refine pass 2)

**19. Reputation as spatial: faction territory rendered on the map**
Rep closes/opens physical space. Deep, legible.
- Impact 7 / Cost 5 / Vision 8 → **7.0**

**20. Scanning verb: hidden prices/veins/threats revealed by scan module**
Info asymmetry the expert exploits.
- Impact 7 / Cost 5 / Vision 8 → **7.0**

**21. The intervention loop: automation failure → fly-out rescue missions**
Your empire generates your drama.
- Impact 9 / Cost 7 / Vision 10 → **8.2** ✅ IMPLEMENT (large — needs automation first)

### Content / aliveness

**22. Give the frontier POIs real behavior (boss, anomaly, vault, wormhole)**
Currently all POIs are identical scan markers. Make them distinct encounters.
- Impact 7 / Cost 5 / Vision 7 → **6.8** (refine → pass 2)

**23. Populate the dead frontier: NPC traffic in deep sectors**
Three deep sectors have `trafficPerMin: 0` — endgame feels hollow.
- Impact 6 / Cost 2 / Vision 6 → **5.8**

**24. Faction wars driven by NPC power, not just player kills**
`factions.js:332` confesses wars are player-only. Add a faction power table.
- Impact 7 / Cost 5 / Vision 8 → **7.0** (refine → pass 2)

**25. Drone Log: each drone keeps a rolling history (FTL/Rimworld emotion)**
The narrative = your save's history. Cheap, high emotional ROI.
- Impact 6 / Cost 3 / Vision 7 → **6.2**

### Structural (V2 pillars — large)

**26. Continuous zoom (no modes, one camera altitude)**
The signature feature. Replaces modal stovepipes.
- Impact 10 / Cost 9 / Vision 10 → **7.4** (huge — needs staged approach)

**27. Drill lens (ant-farm mining as a real verb)**
Mining becomes tactile; foundation for automation.
- Impact 8 / Cost 7 / Vision 9 → **7.4** (refine → pass 2)

**28. Unified automation alphabet (5 primitives, templates, beacons)**
The spine that connects everything.
- Impact 9 / Cost 8 / Vision 10 → **7.6** (refine → pass 2)

---

## PASS 2 — refinement of sub-8 ideas

Goal: sharpen each sub-8 idea to see if a *scoped* version clears 8. Often the trick is
"implement the cheapest slice that delivers the core fantasy."

**2→ refined: "NPC trades no longer touch the player wallet" + visible NPC traders near stations**
Split the fix: (a) `execute()` gets an explicit `actor` param so NPC trades use a synthetic
wallet/hold (1–2 hr), (b) spawn a *sample* of visible NPC hauler ships near stations consistent
with the aggregate flow (the §31 Q16 trick). The combination = "the economy feels alive" which
is a vision-10 beat.
- Impact 8 / Cost 4 / Vision 10 → **8.0** ✅ IMPLEMENT

**3→ refined: "Build queue with real time + station capacity"**
Just make `timeS` actually do something: a per-station queue, projects complete after `timeS`
of game-time, one slot per station (capacity = strategic). The data already exists; the system
just ignores it. Scoped: ~1 system rewrite.
- Impact 8 / Cost 4 / Vision 8 → **7.8** ✅ IMPLEMENT (borderline — do after the clear 8s)

**5→ refined: "Dynamic lights at hero events only"**
Scope it: lights only at player-fired muzzle, player-near explosions, player mining impact.
Capping to player-proximate events bounds the cost to ~3-5 simultaneous lights max. Sheen for cheap.
- Impact 8 / Cost 2 / Vision 7 → **8.0** ✅ IMPLEMENT

**15→ refined: "WANTED level as a visible, regional threat scalar"**
Scope it: a single `state.player.heat` scalar that rises with contraband/piracy/net-worth and
drives spawn-rate of bounty hunters / patrols in hostile space. One number, one UI readout, real
consequence. Not a full escalation FSM.
- Impact 8 / Cost 3 / Vision 9 → **8.2** ✅ IMPLEMENT

**18→ refined: "Make economy events time-critical + visible in a news feed"**
Events already exist (shortage/boom/blockade/piracy). Add: (a) visible "news" ticker on dock,
(b) sharper time-boxing so missing one matters, (c) fix the propagation bug (#1) so they actually
move neighbor prices. Mostly wiring existing data to UI.
- Impact 7 / Cost 3 / Vision 7 → **7.2** (close — fold into #1)

**22→ refined: "Ancient Vaults as a real scavenger encounter"**
Pick ONE POI type to make real (Vault = a boarded wreck with a loot room + a guard). The other
types stay scan markers for now. One distinct encounter > four fake ones.
- Impact 7 / Cost 5 / Vision 7 → **6.8** (defer — single-encounter scope still high for payoff)

**24→ refined: "Faction power table driving war momentum"**
Add a per-faction `power` scalar moved by their NPC hauler counts, kills, and sector holdings.
Wars resolve based on power, not player kills. Makes #14 (NPC traders) pay double.
- Impact 8 / Cost 4 / Vision 9 → **8.0** ✅ IMPLEMENT (after #14)

**27→ refined: "Drill lens as a self-contained 2D screen, not a 3D descent"**
Scope M1 honestly: a 2D overlay screen (like the station hub) for mining, NOT the full continuous
zoom. Reuses the engine, locks controls to L/R + up/down, shows a vein cross-section. The continuous
zoom is a *later* polish; the verb works as a screen first.
- Impact 8 / Cost 5 / Vision 9 → **8.0** ✅ IMPLEMENT

**28→ refined: "Automation alphabet — template + rover first"**
Scope M2: the 5 primitives exist as data, ONE rover type runs them, ONE template (mine→move→sell).
No conditional nodes yet, no fleet UI. Proves the fantasy, then expands.
- Impact 8 / Cost 5 / Vision 10 → **8.2** ✅ IMPLEMENT

---

## PASS 3 — final sharpening of remaining sub-8s

**4→ refined: "Net-worth = credits + ship value + module value"**
Trivial: sum current-ship trade-in + module trade-ins + credits. Fixes the win condition.
- Impact 5 / Cost 1 / Vision 5 → **5.4** (still low priority — do as a 5-min tag-along)

**10→ refined: "Strategic map as a station-screen tab, not a flight overlay"**
Scope: a starmap screen (already may exist as M key?) enhanced with route drawing + threat colors.
If a starmap screen exists, this is enhancement; if not, it's a new screen.
- (depends on existing M-key map — verify before rating)

**16, 17, 19, 20, 25** — all solid 5.6–7.0. They're *good* but not top-priority given the 8s
above. Defer to a post-implementation pass; revisit after the 8s land and the game's shape is
clearer. Specifically:
- #16 wear/maintenance (6.8) — becomes meaningful only after drones exist (#28).
- #17 mass (5.6) — nice but niche.
- #19 rep-as-spatial (7.0) — strong, but depends on map work (#10).
- #20 scanning (7.0) — strong, but depends on hidden-info existing first.
- #25 drone log (6.2) — depends on drones (#28).

---

## IMPLEMENTATION CUT LIST (composite ≥ 8, in dependency order)

These are the ideas that made the threshold. Ordered so each enables the next:

1. **#1 Fix economy boom/shortage propagation bug** (9.4) — pure bug fix, do first
2. **#5 Dynamic lights at hero events** (8.0) — cheap sheen, do early
3. **#15 WANTED heat level** (8.2) — standalone depth, cheap
4. **#2+ NPC traders with real wallets + visible haulers** (8.0) — fixes bug + aliveness
5. **#24 Faction power table driving wars** (8.0) — builds on #4
6. **#14 NPC haulers wired into the real economy** (8.2) — the big background-sim payoff
   - **DELIVERED by #2 + #24 in combination** (commits 84e304b + 7fe6b01): #2 fixed the wallet bug
     so NPC trades use real stock-pressure (prices actually move) and spawned visible haulers that
     emit `aiTrader:requestTrade`; #24 made their presence feed faction power. Together: NPC haulers
     ARE wired into the real economy, their flows move prices, and the player's routes compete with
     a market that shifts on its own. **Deferred polish:** inter-sector hauler flow (currently
     in-sector only) — would add cross-system price arbitrage driven by NPC traffic.
7. **#27 Drill lens as 2D screen** (8.0) — mining becomes a verb
8. **#28 Automation alphabet + first rover** (8.2) — the spine
9. **#21 Intervention loop** (8.2) — automation generates drama (needs #8)
10. **#3 Crafting build queue with time** (7.8) — borderline; do if time remains

**Plus tag-alongs while in the neighborhood:** #4 net-worth fix (5 min when touching missions),
#23 frontier traffic (5 min when touching sectors).

---

## DEFERRED (good ideas, below threshold, revisit later)

#6 tone mapping, #7 fog, #8 motion blur, #9 ribbon trails, #11 tooltips, #12 text-scale/colorblind,
#13 loading screen, #16 wear/maintenance, #17 mass, #18 news feed (folded into #1), #19 rep-spatial,
#20 scanning, #22 vault encounter, #25 drone log, #26 continuous zoom (huge — its own milestone).

These aren't rejected — they're sequenced behind the cut list. Several (#16, #19, #20, #25, #26)
become higher-value *after* the automation/economy work lands because they depend on it.
