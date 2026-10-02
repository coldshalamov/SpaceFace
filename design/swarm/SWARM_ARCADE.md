# Swarm Arcade — making Swarm its own game

2026-10-02 — owner brainstorm, recorded as direction. Builds on
[`SWARM_PROGRAM.md`](./SWARM_PROGRAM.md) (the sandbox layer: stakes, opening armory, exhaustive
shop, hulls for sale, arena events — shipped). This document is the next layer: the meta-game, the
juice, the curated ladder, the front door, and the crossover into Adventure.

## 1. Owner direction (2026-10-02)

Condensed from the owner's words:

- Swarm is a **main attraction**, not "a slapdash version of Adventure with premade settings". It
  must be a fully immersive, fun, **arcade-style** game with its own character.
- Swarm is **curated**: "more or less the same each time, but you get further if you're better."
- Swarm is **additive**, like a tower-defense game: money carries over from previous runs, buys
  better stuff, and that stuff carries you further on later waves.
- The interface going in and setting up a run must be **engaging, modern and exciting**.
- **Artistic license**: Swarm may go beyond what is tasteful in Adventure — gratuitous toasts and
  effects when attacks and chained attacks happen.
- **Crossover**: things unlocked in Swarm (the Saucer is the example) can be used in Adventure.
- Find every small place the experience can improve, **without feeling inhibited by how Adventure
  gameplay works**.

### 1.1 Laws this reverses — Swarm only

These were law in code, docs and tests. For Swarm they are superseded by §1. Adventure keeps them.

| Old law | Where it lives | Now (Swarm) |
|---|---|---|
| "Possibility, never power": account unlocks may never raise damage, hull, shield, speed, credits, XP or score | `src/data/survivalUnlocks.js` (`SURVIVAL_POWER_AXES`), `src/systems/survivalUnlocks.js` (`validateUnlockCatalog`), `test/crucible-meta.test.mjs`, `test/crucible-phase-10b.test.mjs` | Swarm meta-progression grants real power. The existing Crucible unlock rows may stay possibility-only; the new Hangar catalog (§4) is a separate catalog with its own tests. Do not delete the old test to make room — scope it. |
| The purse "dies with the run"; the armory reads "RUN CREDITS · NOT CAMPAIGN CREDITS" | `src/data/swarmStakes.js` header, `src/ui/screens/crucibleDraft.js` | Run earnings bank into a persistent Swarm currency (§3). |
| "No Adventure-wallet leakage" | `design/planbank/.../domains/05-swarm.md` domain contract | Unlocks (hulls, blueprints, cosmetics) cross into Adventure. Credits still do not (§11 decision 3). |
| Feedback restraint: 5 voice lines per wave, at most 3 callouts, "a line per kill would be noise", chain toasts only at 10/25/50/100/200 | `survivalAnnounce.js` `MAX_LINES_PER_WAVE`, `stuntCallout.js` `MAX_CALLOUT_LINES`, `swarmChain.js` `SWARM_CHAIN_MILESTONES` | Swarm gets its own arcade feedback layer (§5) with its own, much larger budget. The one-voice arbiter keeps owning *danger* lines, so warnings still cut through the celebration. |
| Pressure is concurrency, never hit points | `src/data/swarmMode.js` rule 1 | Still the default curve. But a player with permanent upgrades needs a deeper ceiling, so Threat tiers and elite affixes (§6.4) may change enemy toughness and behaviour. |

Kept without change: determinism (same seed → same waves), single-writer ownership, one game path,
accessibility (every effect obeys reduced-motion and reduced-flash), the performance floor.

## 2. Where Swarm is today (ground truth, 2026-10-02)

**The engine is good.** A pure seeded wave planner; a pressure curve (10 → 30 hulls on you);
a twelve-archetype roster that introduces one new silhouette at a time; a four-boss rotation every
10th round; arena event cards every 5th; a mass-and-gap geometry round every 6th; earned breathing
room after burst kills; a kill chain that pays double for varied kills and carries across rounds;
repair cells that drop inside the swarm; credit chips you must physically scoop; an exhaustive
armory (95 items + 15 hulls + services + a free demo trial); four stakes; ghosts; a daily seed and
weekly mutator; share codes; killcam; and genuinely excellent death forensics.

**Why it still reads slapdash** — it is dressed as Adventure, and most of the excitement it already
computes never reaches the screen:

- **The door is a settings form.** Three tabs (Encounter / Ship & Kit / Armory), rows of tiles. No
  wallet, no progress, no goal, no "your best". It asks for configuration, not excitement.
- **The armory is a price-sorted catalogue.** 95 rows in a list, a spec sheet, a yellow Purchase
  bar. No rarity, no "new", no recommended picks, no sense of the next fight.
- **The flight HUD is Adventure's HUD with a small run card in the corner.** In the bench still
  (`node scripts/ui-bench.mjs --shot=crucibleHud`) the swarm screen also shows a world-news line,
  objective/beacon distances and a drive-arrival readout — none of which mean anything in an
  arena. Confirm on a live run; the still is synthetic.
- **The chain — the number the mode is "actually played for" (`swarmChain.js`) — is a small
  figure in the top-left.** The ×2 bonus for varied kills is invisible.
- **Results is a post-mortem.** "RUN OVER", a forensic death dial, raw base64 share codes, and
  copy like "No chained tricks — 31 flat kills, no multiplier." Nothing is banked, nothing is
  unlocked, nothing says "come back".
- **Nothing persists that makes you stronger.** The only account progress is possibility-only
  unlocks (other starter kits, mutators, trials, marks).
- **On the title menu it is "Crucible", third in the list** outside the demo.

## 3. The shape of the new game

**Swarm is a run-based arcade defense: fight a fixed ladder of waves, bank what you earn, spend it
in the Hangar, come back stronger, go deeper.**

```
HANGAR  ──spend Bounty, pick hull + perks──▶  RUN  (fight ▸ armory ▸ fight ▸ … ▸ boss)
   ▲                                            │
   └──── RESULTS: count-up, bank Bounty, unlocks pop, next goal ◀───┘
```

Two wallets, both always visible:

- **Run credits** — today's wallet. Earned from kills and chips, spent in the between-round armory,
  gone at the end of the run. Unchanged.
- **Bounty** (working name) — persistent. Banked at the end of every run from: rounds cleared,
  bosses killed, best chain, stars earned, challenges completed, and a share of unspent run
  credits. Death keeps part of it; cashing out after a boss keeps all of it (§11 decision 2).

The test for every feature below: does it make the next run feel *closer*, or the current run feel
*louder*? If neither, it is not this program.

## 4. Pillar A — The Hangar (the "one more run" loop)

### 4.1 Workshop — permanent upgrade tracks
A tower-defense tech board. Each track has 5–10 ranks with escalating Bounty prices. Starting set:

| Track | Per rank | Why it is fun |
|---|---|---|
| Plating | +5% hull | survive one more mistake |
| Shield capacitor | +5% shield | |
| War chest | +100 cr starting purse | open the armory rich |
| Broker | −4% armory prices | the shop gets deeper |
| Rerolls | +1 free reroll per run | |
| Magnet | +15% chip pickup radius | less flying back into the swarm |
| Fuse | +0.25 s chain window | longer chains, louder screen |
| Medic | repair cells drop more often | |
| Second Wind | one revive per run (rank 1 only, expensive) | the run you would have lost |
| Head start | unlock checkpoint starts (§6.2) | skip what you have mastered |

Numbers are starting points, tuned from play. A fully upgraded account should be noticeably
stronger (aim ~+30–40% effective durability/economy), not invincible — Threat tiers (§6.4) are the
counterweight.

### 4.2 Hulls you own
Hulls bought in the Hangar are permanent: start any run in any owned hull. The in-run armory still
sells hulls for that run only. Marquee hulls are earned, not bought — **the Saucer** is the first
(§8).

### 4.3 Perks — a small loadout you bring in
2 slots at first, 4 at most. Passive, build-defining, chosen per run. Examples:
- *Chain Reactor* — kills above chain 25 detonate the body.
- *Scavenger* — every 10th kill drops a bonus chip.
- *Ram Plate* — collisions with your hull deal damage.
- *Overclock* — boost recharges on every kill.
- *Gambler* — rerolls cost half, offers are wilder.
- *Bounty Hunter* — elites pay ×3 run credits.
Perks unlock from challenges and stars, so the collection keeps growing.

### 4.4 Collection
Every armory item has a first-seen / first-bought state. A collection page shows what you have
found, how many runs it has been in, and best wave reached with it. "NEW" pips everywhere until
seen.

## 5. Pillar B — Juice (Swarm-only, gratuitous allowed)

All of it lives in one Swarm-only feedback layer, gated on a live swarm run, with one setting:
**Arcade effects: Full / Reduced / Off**, which also obeys `motionReduce` / `flashReduce`. Popups
are pooled — 30+ bodies die per minute.

1. **The chain is the hero.** Big, top-centre, with a draining ring for its 4 s window. Named tiers
   with their own colour and sound — e.g. 10 IGNITION · 25 FLARE · 50 NOVA · 100 SUPERNOVA ·
   200 SINGULARITY. Show the variety bonus every time it fires ("+2 MIXED"). A broken chain gets a
   shatter, not silence.
2. **Kill popups at the kill point**: "+120", "+4 cr", and a cause tag — SLAMMED, MINED, SLUNG,
   BANKED, SHREDDED, PILE-UP, FRIENDLY FIRE. The cause words already exist
   (`styleCauseFromKill`); the screen just never says them.
3. **Multi-kill announcer**: DOUBLE · TRIPLE · QUAD · SWARM WIPE within ~0.6 s; PILE-UP ×N when
   one collision takes several; COLLATERAL (an enemy killed an enemy); REVENGE (you killed what
   last hit you); CLOSE CALL (kill under 10% hull); LAST ONE (the round's final kill, in slow-mo).
4. **Physical punch**: hit-stop of 40–80 ms on big kills scaled by chain tier, camera shake that
   grows with the chain, a bloom/colour flash on tier-up, bigger "arcade" explosions and debris in
   Swarm. Reuse `bulletTime.js`, `camera:shake`, and the killcam.
5. **Round beats**: a "ROUND 7" slam with a 3-2-1; on clear, "ROUND CLEAR" and a count-up tally —
   Flawless (no hull lost), Speed clear, Room kills ×N, Best chain — each line with a stinger, the
   money rolling into the wallet.
6. **Boss**: a versus-style intro card (name, hull render, one line of tells), a boss health bar
   top-centre, phase flashes, and "BOSS DOWN" in slow-mo with a payout shower.
7. **New threat card**: when the roster clock introduces an archetype, a card slides in — the
   silhouette, its name, and its counter in five words ("It explodes. Throw it.").
8. **Money feels like money**: chips vacuum to the ship with a rising-pitch ka-ching sequence; the
   wallet ticker rolls; every banked bonus has a sound.
9. **Music that follows the chain**: adaptive layers that stack with chain tier and drop out when
   it breaks; kill sounds pitch up through a chain.

## 6. Pillar C — The curated ladder ("the same each time, further if you're better")

### 6.1 A fixed arcade seed per arena
The main "Play" uses one authored seed per arena, so the ladder is the same every time and
learnable — the wave planner is already pure and seeded, so this is a launch choice, not new
generation. Daily (exists) and Custom seed stay as side doors.

### 6.2 Zones of ten
The endless wave count becomes named **Zones** of 10 rounds, each ending in its boss (the rotation
already exists). Zone 1 "The Pack", Zone 2 "The Wing", Zone 3 "The Anvil", Zone 4 "The Choir",
then the cycle hardens. Clearing a zone's boss unlocks a **checkpoint start** at the next zone with a
purse sized to a typical run's purse at that point.

### 6.3 Stars and goals
Three stars per zone: ★ beat the boss · ★★ beat it without dying (or with Second Wind unused) ·
★★★ hit the zone's chain target. Stars unlock the next arena (Foundry → Lagrange → Cinder → Cryo →
Storm), perks and cosmetics. A map shows every arena × zone with your stars and best wave.

### 6.4 Depth for strong accounts
- **Threat tiers** (opt-in, stack, each adds a Bounty multiplier): the existing stakes and
  mutators become cards — Thick Pack (+concurrency), No Rerolls, Thin Purse, Draftless, Fast Lane
  (+enemy speed), Armoured Elites.
- **Elite affixes** from Zone 3 or under Threat: Shielded (pop the bubble), Splitter (bursts into
  two wasps), Volatile (explodes on death — chain fuel, rewards throwing), Magnetic (steals your
  chips), Commander (hardens nearby hulls), Hasted. Affixes should feed the room-kill grammar,
  not just add hit points.

### 6.5 Plan around the next fight
The armory shows **the next round**: body count, archetypes, any newcomer, the event card, the boss.
All of it is already in the plan (`swarmPlanBlock`, `swarmEventFor`). Buying becomes
counter-planning, which is the tower-defense feeling.

### 6.6 Between-round wagers
Optional contract cards in the armory: "Kill 10 with mines this round: +150 cr", "Take a Threat card
for the next round: ×1.5 Bounty from it". Risk you choose is the most addictive kind.

## 7. Pillar D — The screens

The frontend redesign belongs to the ORRERY lane (`design/frontend/ORRERY.md` §Crucible already
calls for an arena carousel, offers as a fanned hand of cards, and a salvage burst into the purse —
compatible with everything here). The Swarm arcade layer is deliberately louder than ORRERY's
"light is the only material" (§11 decision 4).

### 7.1 Title menu
"SWARM" as its own word, high in the list (not "Crucible", not third). The attract mode already
plays a Crucible replay behind the title — let it.

### 7.2 The Hangar (replaces the door form)
- Your hull, large, on a lit pad. Bounty balance big in the corner.
- One huge **PLAY** that says exactly where it goes: "Ricochet Foundry · Zone 2 · from Round 11".
- A next-goal strip: "Best round 14 · Saucer unlocks at round 30 — 16 to go."
- Around it: Workshop · Hulls · Perks · Arenas (star map) · Challenges (daily/weekly with timers and
  rewards) · Records.
- Quick Play = last setup, one key. Gauntlet and Foundry Block move under "More modes".

### 7.3 The armory
- Big item cards, coloured by rarity (tier), "NEW" badges, a **Recommended for your build** shelf of
  three at the top (the old three-card draft feel, kept as the headline), the full catalogue below.
- Green/red stat deltas against what is fitted; one-click Buy & Fit; sell back at half; lock a card
  for next round.
- The next-round preview (§6.5) on the same screen.
- Owned hulls should not list as "Hornet · 0 cr" at the top of the shelf.

### 7.4 Results
- Celebrate first: run → Bounty count-up flying into the Hangar total; NEW BEST stamps; stars
  earned; unlocks revealed as card flips; a bar to the next unlock.
- Then the post-mortem (the death forensics are excellent — keep them, as the second panel).
- Share codes behind a Share button, never as raw strings on the plate.
- Positive copy: never "No chained tricks — no multiplier."
- Buttons: Again · Hangar · Main menu.

### 7.5 The flight HUD in a swarm run
- Hide Adventure instruments: world news, objective/beacon distances, drive-arrival readout,
  cargo/bay rows that do nothing in an arena.
- Arcade HUD: round + enemies-left bar top-centre, chain hero (§5.1), rolling score, wallet ticker,
  boss bar, off-screen threat arrows, ability cooldown rings.

## 8. Pillar E — Crossover with Adventure

- **Unlock ledger.** The Crucible profile already persists separately from Adventure saves
  (`sf.save.crucible_meta`, `survivalRecords.js`). Adventure reads "earned crossovers" from it; it
  never writes Swarm progress and Swarm never writes an Adventure save.
- **What crosses:** hulls (the Saucer first — earned at round 30 / Zone 3 boss, and earnable
  *only* in Swarm; see §11 decision 3), paints and decals, weapon blueprints "proven in the
  Crucible", titles.
- **What does not:** Bounty and run credits (protects the Adventure economy — §11 decision 3).
- **Later, the other way:** hulls you own in Adventure appear in the Swarm Hangar.

## 9. Small things (grab bag)

- Chain number tiny in the corner → hero (§5.1).
- Variety ×2 invisible → say it.
- Milestone toasts only at 10/25/50/100/200 → named tiers with a visible "next tier" mark.
- Wave quota progress is a thin bar → "ENEMIES LEFT 12" counter.
- Repair cells → bright pulse, ping, edge arrow while they live.
- Event telegraphs → a banner with a countdown ring, not just an alert line.
- Boss arrival → intro card + health bar.
- Chips left behind at round clear → a visible vacuum sweep into the wallet (the sweep already
  exists, silently).
- Stake tiles show pressure % but not the reward → show "×1.5 Bounty".
- Starter kits are all the same hull → the Hangar's owned hulls replace this.
- Score shown small → rolling arcade digits.
- Pause in a swarm run → show the build, the chain best, the next round.
- Death → offer Second Wind if owned, with a 3-second countdown.
- Results share strings → Share button.
- Results negative copy → celebratory copy.
- Daily seed and weekly mutator exist but hide under "Challenges, seed & records" → put them on
  the Hangar with a timer and a reward.
- Local leaderboard → show "your rank today" on the Hangar.

## 10. Build order

Each step ships something the player can feel on its own.

1. **Bank & Hangar backbone** — Bounty banked at run end (death keeps a share), persistent Hangar
   profile (extend the Crucible meta bag), the first 6 Workshop tracks applied at run start, owned
   hulls, results screen shows the bank. Scope the possibility-only law/tests to the old catalog
   and give the Hangar catalog its own. *This alone makes Swarm additive.*
2. **Juice pack 1** — chain hero, kill popups with cause tags, multi-kill announcer, round slam and
   clear tally, boss bar and intro, the Arcade effects setting.
3. **Curated ladder** — arcade seed per arena, Zones with names and stars, checkpoint starts,
   next-round preview in the armory.
4. **Screens** — Hangar hub, armory cards, results celebration, Swarm HUD strip (with the ORRERY
   lane).
5. **Depth & crossover** — Saucer unlock and the Adventure ledger, perks, Threat tiers and affixes,
   challenges and daily rewards, adaptive music.

## 11. Owner decisions (answered 2026-10-02)

1. **How strong can a maxed account get?** Clearly stronger (~+30–40%), never invincible; Threat
   tiers keep the top end hard.
2. **What does dying cost?** Death banks 50% of the run's Bounty; cashing out after any boss banks
   100% and ends the run.
3. **The Saucer.** Owner: "it should be unlocked in swarm only." Read as: Swarm is the *only* way to
   earn the Saucer — Adventure's research route to it (`requiresTech: 'tech_graviton_drives'` in
   `src/data/ships.js`) is retired, and once earned in Swarm it becomes buyable at Adventure
   shipyards (the owner's original ask: "unlocked in the swarm mode and used in adventure mode").
   If the owner meant the Saucer stays out of Adventure entirely, drop the Adventure half; the
   Swarm unlock is unchanged. Credits never cross.
4. **How loud may Swarm look?** The in-flight arcade layer (popups, slams, tier colours, rarity
   colours) is Swarm's own louder style; menus keep ORRERY's components.
