# Detail Gold Packets — Lane F: Comms · Audio · Onboarding

> **Clusters O (comms/audio/music, 261–300) + P (onboarding / first-15 proof ritual, 301–330).**
> Destination: comms/audio fold into **BP-05 / BP-10 addenda through `voiceArbiter`**; the first-15 ritual
> is a **`REVAMP_MASTER` named proof surface** (written below as PKT-RITUAL for the master to absorb).
>
> **THE ONE FILTER applied to every item:** *see it · predict it · change it — else it's cost, not detail.*
>
> ### What is already shipped in this lane (read before the packets)
> This lane is unusually far along. Curation found that the four biggest O/P asks are **shipped**:
> - **`src/ui/voiceArbiter.js`** — the global comms cap + one-line ownership priority queue. **VALIDATED.**
> - **`src/data/barks.js`** — all 8 factions × 8 situations, each in a distinct register (Concord procedure,
>   Vael clause-language, Reach toll-wolves, Quiet deniability, …). The *cadence data* is **VALIDATED**; what is
>   missing is **surfacing** it (barks only fire on encounter-spawn today) and **shaping** it (decay, silence).
> - **`src/systems/onboarding.js`** — the `BEATS` table (B0 beacon → B1 derelict/tether → B2 seam/mining →
>   B3 pirate tolls-then-flees → B4 dock sell + one job → B5 first choice) with `SILENCE_S` mentor-silence and
>   `player.hints` tutorial-memory. **The proof ritual is VALIDATED**; deltas are surfacing/naming it.
> - **`src/presentation/cueSchema.js` + `cueRecipes.js` + `presentationAdapters.js` + `presentationOrchestrator.js`**
>   — the SG-08 semantic-cue pipeline: sim event → `{ importance, playerRelevance }` → audio recipe + UI cue +
>   **caption**, with `CRITICAL_SLICE_EVENT_IDS`. **The audio-priority + captions substrate is VALIDATED.**
> - **`src/audio/audioSystem.js`** — categories (ui/engine/mining/weapon/story), `_duckMusic`, and
>   `_playSquelch(category)` comms squelch. The bus is VALIDATED; specific *signatures* are the delta.
>
> Because so much is shipped, the honest work here is **thin, high-visibility surfacing** — extend the cue
> table with a few new `importance`-ranked signature ids; wire barks to fire on the situations they already
> cover; add captions for the cues that lack them. Every packet below creates only NEW files and lists the
> hot files it must not touch (merge protocol).

---

## BP-10 addendum (BP-10.1) — Audio signatures & the mask-proof priority bus

> All packets here **reuse** the SG-08 cue pipeline: they register new cue ids in a new
> `src/presentation/cueRecipesSignatures.js` (recipe + `importance`/`playerRelevance`) and a new
> `src/systems/signatureAdapters.js` (caption + UI title). The orchestrator emits them from existing sim
> events. **They do NOT edit `audioSystem.js`, `cueSchema.js`, `presentationAdapters.js`.**

### PKT-AUD-01 · Mask-proof cue priority (shield-break / lock / tether-break never buried)
- **name:** Nothing-masks-the-kill-shot audio priority
- **fantasy:** The one sound you *had* to hear cuts through the firefight — you never lose your shield-break to a laser loop.
- **pillar:** glance · one-voice
- **wave/BP:** W3 / BP-10.1
- **reuses:** `presentationAdapters` `importance`/`playerRelevance` fields, `CRITICAL_SLICE_EVENT_IDS`, `audioSystem` categories + `_duckMusic`
- **newFiles:** `src/audio/cuePriorityBus.js` (a tiny pre-mix arbiter: when a cue with `importance ≥ 0.8` plays, briefly ducks weapon/engine loop buses by a fixed dB, mirroring `_duckMusic`'s pattern for the SFX bus)
- **noTouch:** `src/audio/audioSystem.js`, `src/systems/presentationAdapters.js`, `src/presentation/cueSchema.js`
- **budget:** spawn:none · voice:none (audio bus, not text) · draw:none
- **rng:** none / pure presentation
- **acceptance:** with the beam loop + engine hum both playing, firing `shield.collapse` (importance 1.0) audibly foregrounds the collapse cue for ~250 ms; headless test asserts the duck envelope is applied only for `importance ≥ 0.8` cues; 47-A golden telemetry unchanged (this is `typeof window`-gated cosmetic audio).
- **failureModes:** ducking the *whole* mix reads as a dropout — duck only weapon/engine loops, never the critical cue itself; over-ducking the music twice (this + `_duckMusic`) — share one duck target.
- **size:** M

### PKT-AUD-02 · Tether-strain by tension derivative (a rope that *sounds* like it's about to go)
- **name:** Massline-strain rising whine (tension-derivative)
- **fantasy:** You *hear* the line load up before the STRAIN banner — the pitch climbs with how hard you're pulling, not just that you're pulling.
- **pillar:** momentum-toy · glance
- **wave/BP:** W3 / BP-10.1
- **reuses:** `tether:nearBreak` bus event (`attachments.js:431`), the shipped `tether.near_break` cue + `sfx_ui_alert`, `presentationOrchestrator`
- **newFiles:** `src/presentation/cueRecipesSignatures.js` (adds `tether.strain` recipe: a filtered tone whose playbackRate maps to d(tension)/dt bucketed into 3 seeded-domain-free presentation steps)
- **noTouch:** `src/combat/attachments.js`, `src/audio/audioSystem.js`, `src/presentation/cueRecipes.js`
- **budget:** spawn:none · voice:none · draw:none
- **rng:** none / pure presentation (derivative is read from sim tension, not rolled)
- **acceptance:** reeling a heavy mass ramps the strain tone up; letting off drops it; `near_break` still fires its distinct alert on top (the two are layered, not merged). Observable in the 47-A "Mass Discrepancy" slice (heavy tether pull).
- **failureModes:** per-frame pitch churn = zipper noise → bucket the derivative into 3 steps and slew; must not double with the existing `near_break` alert — strain is *continuous*, near-break is *the threshold ping*.
- **size:** M

### PKT-AUD-03 · Hostile-lock vs scan tone (two sweeps you can tell apart blind)
- **name:** Lock-tone ≠ scan-tone
- **fantasy:** A scan is a shrug; a weapons-lock is a spike — you never confuse "being appraised" with "being targeted."
- **pillar:** glance
- **wave/BP:** W3 / BP-10.1
- **reuses:** existing `sfx_lock_acquired` recipe, `scan:pulse` bus event, `scanner.isHostileToPlayer` (to decide lock vs benign scan)
- **newFiles:** entries in `src/presentation/cueRecipesSignatures.js` (`sensor.scan` = soft two-note sweep; `sensor.lock` = rising urgent doublet, higher `importance`), caption/title in `src/systems/signatureAdapters.js`
- **noTouch:** `src/audio/audioSystem.js`, `src/systems/scanner.js`, `src/presentation/presentationAdapters.js`
- **budget:** spawn:none · voice:none · draw:none
- **rng:** none / pure presentation
- **acceptance:** a neutral scan and a hostile weapons-lock produce audibly distinct cues; caption reads "Scanned." vs "Weapons lock." Blind A/B test distinguishes them in ≤1 s.
- **failureModes:** if hostility flips mid-sweep both fire — debounce so only the resolved state cues; do NOT couple to `factionId` (use `scanner.isHostileToPlayer`, contract §2).
- **size:** S

### PKT-AUD-04 · Customs-scan tone (the sound that makes a smuggler sweat)
- **name:** Customs-scan dread tone
- **fantasy:** The customs cone paints you and a slow, official tone crawls up — you feel watched before anyone says a word.
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-10.1 (pairs with BP-12 customs gameplay; audio ships independent)
- **reuses:** the `sensor.scan` base recipe (PKT-AUD-03), Concord customs zones (`sectorZones.js`, `sectors.js` customs stations), `_playSquelch('warning')`
- **newFiles:** `customs.scan` cue in `src/presentation/cueRecipesSignatures.js` (a longer, colder variant of the scan tone with a held tail), caption "Customs sweep." in `signatureAdapters.js`
- **noTouch:** `src/systems/economy.js`, `src/audio/audioSystem.js`, `src/data/sectorZones.js`
- **budget:** spawn:none · voice:none · draw:none
- **rng:** none / pure presentation
- **acceptance:** entering a Concord customs cone with contraband aboard plays the dread tone once on scan-start; without contraband it's the plain scan tone. Distinct from combat lock.
- **failureModes:** looping the tone every frame in-cone = nagging → play once on scan-*start* edge; must not fire in every secure sector, only at customs zones.
- **size:** S

### PKT-AUD-05 · Line-cut whipcrack + large-mass groan (the tether has a body)
- **name:** Whipcrack on cut, groan on the big haul
- **fantasy:** Cutting a taut line *cracks*; hauling something huge *groans* — the physics has weight in your ears.
- **pillar:** momentum-toy · glance
- **wave/BP:** W3 / BP-10.1
- **reuses:** existing `tether:released`/`tether:broke` events + `sfx.tetherSnap`, tether tension + towed-mass already in sim, `presentationOrchestrator`
- **newFiles:** `tether.cut_whipcrack` (transient click→noise burst, gated on tension-at-cut being high) and `mass.groan` (low sub-tone whose gain scales with towed mass) in `cueRecipesSignatures.js`; captions in `signatureAdapters.js`
- **noTouch:** `src/combat/attachments.js`, `src/audio/audioSystem.js`
- **budget:** spawn:none · voice:none · draw:none
- **rng:** none / pure presentation
- **acceptance:** cutting a slack line = soft; cutting a taut line = whipcrack; towing a heavy wreck adds a sustained groan that fades when released. Visible in 47-A heavy-tether slice.
- **failureModes:** whipcrack on *every* cut cheapens it → gate on tension threshold; groan droning forever → tie gain to live towed mass, silence at zero.
- **size:** S

### PKT-AUD-06 · Ore-seam chime & vent-bonus chime as a rhythm reward
- **name:** Seam-strike chime and vent-payoff chime
- **fantasy:** Hitting a rich seam *rings*; a clean overheat-vent *rewards* you with a bright chime — mining has a beat you can play to.
- **pillar:** momentum-toy · glance
- **wave/BP:** W3 / BP-10.1
- **reuses:** shipped `sfx_vent_chime` + `sfx_core_bell`/`sfx_mining_impact`, mining seam/heat events, `_onSeamHit` throttle already in `audioSystem`
- **newFiles:** `mining.seam_chime` (pitched by seam richness) + `mining.vent_bonus` (bright arpeggio on clean vent) in `cueRecipesSignatures.js`; captions in `signatureAdapters.js`
- **noTouch:** `src/audio/audioSystem.js`, `src/systems/mining*.js`
- **budget:** spawn:none · voice:none · draw:none
- **rng:** none / pure presentation
- **acceptance:** beaming a rich seam plays an ascending chime distinct from the dull impact of poor rock; a clean forced-vent plays the bonus chime. Rhythm is learnable within one mining session.
- **failureModes:** chime on every impact = mush → gate on seam-richness delta and reuse the existing 0.5 s throttle; must not fire the vent chime on the determinism-gated forced vent path in a way that touches golden telemetry (audio is window-gated).
- **size:** S

### PKT-AUD-07 · Captions for every critical cue (accessibility parity)
- **name:** Critical-cue caption parity
- **fantasy:** A player with sound off still *reads* the shield-break, the lock, the customs sweep — nothing important is audio-only.
- **pillar:** glance · one-voice
- **wave/BP:** W3 / BP-10.1
- **reuses:** the shipped `CAPTIONS` map in `presentationAdapters.js` (already captions the 10 SG-08 cues), the a11y caption bus
- **newFiles:** caption entries for every new signature id (AUD-02…06) live in `src/systems/signatureAdapters.js` (a sibling `CAPTIONS_SIGNATURES` map merged at emit, never editing the shipped `CAPTIONS`)
- **noTouch:** `src/systems/presentationAdapters.js`
- **budget:** spawn:none · voice:none · draw:none
- **rng:** none / pure UI
- **acceptance:** with captions enabled, each signature cue surfaces one short caption line; audit lists zero critical cues without a caption.
- **failureModes:** caption spam during a firefight → captions inherit the same `importance` gate as the audio bus (PKT-AUD-01) so only high-importance cues caption.
- **size:** S

---

## BP-05 addendum (BP-05.1) — Faction radio cadence surfaced through voiceArbiter

> **`barks.js` already holds the distinct registers** (Concord procedure, Meridian contracts, Drift grit,
> Reach toll-wolves, Quiet deniability, Choir liturgy, Frontier exhausted, Vael clause-language). Today only
> `encounterDirector` speaks a single spawn bark. These packets **surface the corpus** through `voiceArbiter`
> on the situations the AI is *already in*, with decay and post-combat silence. **No new voice channel** — all
> route through `ctx.helpers.voice.say({ channel: 'bark' })`, which is already rate-limited (`BARK_MIN_GAP_MS`).

### PKT-BARK-01 · Situational bark surfacing (the register you already wrote, on the beat it fits)
- **name:** Radio-cadence surfacing (scan/warn/demand/attack/flee/reinforce/taunt)
- **fantasy:** You know who's hailing you before the IFF resolves — Concord cites a ref code, Reach threatens, the Quiet says one word.
- **pillar:** one-voice · world-was-here
- **wave/BP:** W3 / BP-05.1
- **reuses:** `barks.js` `barkFor(factionId, situation, rng)`, `voiceArbiter` `bark` channel + rate-limit, existing AI intent states (SG-06), `scanner.isHostileToPlayer`, seeded `makeStream(seed)` for line pick
- **newFiles:** `src/systems/barkDirector.js` — a listener that maps AI state-transitions (intercept→"scan", warn→"warn", demand→"demand-cargo", fire→"attack", flee→"flee", rally→"reinforce") to `voice.say({ channel:'bark', factionId, text: barkFor(...) })`
- **noTouch:** `src/ai/*`, `src/systems/encounterDirector.js`, `src/data/barks.js`, `src/ui/voiceArbiter.js`
- **budget:** spawn:none · voice:`bark` (arbiter-capped, one at a time) · draw:none
- **rng:** seeded — `hash32(state.meta.seed, 'bark:'+shipId+situation)` → line index (replayable)
- **acceptance:** a Concord patrol intercept surfaces a Concord scan line; the same ship escalating to fire surfaces a Concord attack line; two ships hailing at once → only one surfaces (arbiter). Deterministic across replay.
- **failureModes:** every state flicker barks → debounce per-ship per-situation (one bark per situation-entry); firefight spam → already capped by `BARK_MIN_GAP_MS`; must draw from a *seeded* domain, never `Math.random` (contract §1).
- **size:** M

### PKT-BARK-02 · Ambient-bark decay + post-combat silence (let the beat land)
- **name:** Barks fade, then the void goes quiet
- **fantasy:** After the last kill, the radio stops — the silence is the emotional beat, not another line.
- **pillar:** one-voice
- **wave/BP:** W3 / BP-05.1
- **reuses:** `voiceArbiter` queue (stale-drop already implemented), `SILENCE_S` pattern proven in `onboarding.js`, combat-end signal
- **newFiles:** logic in `src/systems/barkDirector.js` (from BARK-01): a `postCombatSilenceUntil` window that suppresses `patrol-greeting`/`taunt` (flavor) barks for N seconds after combat ends; ambient greetings decay in frequency the longer a sector is quiet
- **noTouch:** `src/ui/voiceArbiter.js`
- **budget:** spawn:none · voice:`bark` · draw:none
- **rng:** seeded (ambient greeting cadence off `hash32(seed, 'ambientBark:'+sectorId+bucket)`)
- **acceptance:** for N seconds after the last hostile dies, no flavor bark surfaces; alert/story lines still pass (they're higher channels). Post-fight feels intentional, not chatty.
- **failureModes:** suppressing *all* voice (incl. mission-critical) — only gate the `bark` flavor situations, never `alert`/`story` channels; decay that permanently silences a sector — floor the ambient rate, don't zero it.
- **size:** S

### PKT-BARK-03 · Vael unsettling-translation garble (the HUD half-understands them)
- **name:** Vael clause-language HUD distortion
- **fantasy:** When the Vael speak, the caption *almost* resolves — a clause number, a word that isn't quite a word — and it's unsettling.
- **pillar:** one-voice · world-was-here
- **wave/BP:** W3 / BP-05.1
- **reuses:** `barks.js` `faction_vael` corpus (already clause-numbered/alien), `voiceArbiter` bark channel, comms squelch `sfx_squelch_story`
- **newFiles:** a presentation-only transform in `src/systems/barkDirector.js` that, for `factionId === 'faction_vael'`, renders the bark with a brief typewriter-garble-then-resolve effect (UI only; the underlying text is the real bark)
- **noTouch:** `src/data/barks.js`, `src/ui/voiceArbiter.js`, `src/ui/comms.js`
- **budget:** spawn:none · voice:`bark` · draw:none
- **rng:** none / pure UI presentation (garble pattern is deterministic per line)
- **acceptance:** a Vael hail visibly resolves from garble to the authored clause line; other factions render plainly. Text is still readable (garble is brief, ≤400 ms).
- **failureModes:** garble that never resolves = illegible → cap the effect duration and always settle on the real line; must not desync captions (caption shows the resolved text).
- **size:** S

---

## REVAMP_MASTER named proof surface — the First-15 Ritual

> Per DETAIL_DOCTRINE §6, the first-15 proof ritual folds into **a `REVAMP_MASTER` named proof surface**.
> The ritual itself is **shipped** in `onboarding.js` (`BEATS` B0–B5, `SILENCE_S`, `player.hints`). This packet
> **names it as the proof surface** REVAMP_MASTER should absorb, plus the *thin* deltas that turn it from a
> tutorial into a legible ritual. It is one packet, not a rebuild.

### PKT-RITUAL · The First-15 Proof Ritual (name it; surface its two missing legibility beats)
- **name:** First-15 as proof ritual (mercy + silence made legible)
- **fantasy:** In fifteen minutes I *did* the whole game once — saved something, mined a rhythm, spared a beaten pirate, sold, chose my path — and nobody lectured me.
- **pillar:** one-voice · momentum-toy · world-was-here
- **wave/BP:** W3 / REVAMP_MASTER §6 proof surface (the second proof surface beside 47-A)
- **reuses:** `onboarding.js` `BEATS` (B0 beacon → B1 tether-by-saving → B2 seam-rhythm → B3 pirate-tolls-then-flees → B4 sell+one-job → B5 first-choice), `SILENCE_S` mentor-silence, `player.hints` tutorial-memory, `voiceArbiter` for the single objective voice, `barkFor(faction_reach,'demand-cargo'/'flee')` for the toll-then-flee mercy beat
- **newFiles:** `design/revamp/PROOF_RITUAL.md` (the named proof-surface doc REVAMP_MASTER links, spelling out the five beats + their success test) — this is a *doc*, no code file
- **noTouch:** `src/systems/onboarding.js` (shipped; hard-freeze — deltas below are separate later addenda, never inline edits)
- **budget:** spawn:1 pirate via `spawnBudget` (B3, already a budget client) · voice:`story`/`alert` (arbiter) · draw:none
- **rng:** seeded (derelict/pirate placement + bark lines off `state.meta.seed`; the ritual must replay identically)
- **acceptance:** a fresh game reaches B5 "first choice" with (1) exactly one objective voice on screen at any time, (2) ≥`SILENCE_S` of silence after each success, (3) the B3 pirate visibly *tolls* (Reach demand-cargo bark) then *flees at ≤30% hull* (Reach flee bark) — teaching combat AND mercy in one beat. The two deltas below are the only gaps.
- **failureModes:** the ritual is shipped, so the risk is *over-editing* it — treat `onboarding.js` as frozen and land the two deltas as BP-05.1/BP-10.1 addenda, not inline; if the pirate is killed before fleeing the mercy lesson is lost → the flee is hull-gated, not time-gated, so a slow player still sees it.
- **size:** S (naming + two thin deltas; the machinery exists)

**The two legibility deltas the ritual is missing (each a tiny addendum, not a rewrite):**
1. **Mercy is unlabeled.** B3 teaches mercy by *mechanics* (the pirate flees) but never *names* it. Delta: a single post-B3 `voice.say({channel:'story'})` line — "You let it run. Some don't." — surfaced once, only if the player did NOT finish the fleeing pirate. Reuses the shipped Reach flee bark as the trigger edge. (BP-05.1)
2. **The rhythm isn't heard.** B2 teaches the mining beat visually; PKT-AUD-06 (seam/vent chimes) is what makes it *audible*. The ritual's B2 should be the showcase for the seam chime — no new code, just sequencing PKT-AUD-06 to land in the tutorial window. (BP-10.1)

---

## CUT / DEFER

| Item (source O/P) | Action | Reason |
|---|---|---|
| Adaptive music state (investigation/pressure/combat/reversal/aftermath) | **DEFER** | Doctrine §8 names adaptive-music-state as gold-plating; the lane brief explicitly defers it. `_duckMusic` already covers the one high-value beat (mission/kill ducking). |
| Music drop-out on false-mass / story-contradiction | **DEFER** | Rides on adaptive-music-state (deferred); the 47-A false-mass beat is carried by cue + caption, not a music engine. |
| "No voice-acting-required" design (text barks + audio signatures) | **VALIDATED as constraint** | Already the shipped architecture (`barks.js` is text; audio is procedural). It's a design constraint we meet, not a packet. |
| Objective-arrow language (distance/risk/route/recommended-action) | **DEFER to BP-03/onboarding** | Onboarding already renders a direction hint + story objective; the richer arrow language is a map/nav (BP-03) enrichment, not comms/audio. |
| "Ask station contact: why does this matter?" | **DEFER to BP-11/BP-05** | Station-contact dialogue is Station Life (BP-11) / story (BP-05) surface, not this lane. |
| Codex-unlock-from-action (not menu dump) | **DEFER to BP-05** | Narrative/codex ownership is BP-05; onboarding's `player.hints` already does the action-triggered reveal for mechanics. |
| Failure-hint only after repeated failure | **VALIDATED (partial)** | `onboarding.js` `_showHint` already fires contextual one-shot hints; the "only after repeated failure" refinement is a thin onboarding addendum, not a new packet. |
| Any bark not through `voiceArbiter` | **HARD CUT** | Contract §4 — all player-facing text through the arbiter. BARK-01 routes through it by construction. |
| Per-frame flavor audio without a seeded/derivative source | **CUT/RESHAPE** | Contract §1 — signature packets read from sim state (tension derivative, seam richness) or seeded `hash32`, never per-frame `Math.random` in sim. |

---

## VALIDATED (already shipped — reframed, NOT rebuilt)

- **Global comms cap + one-line ownership** ≡ `src/ui/voiceArbiter.js` (priority queue, one floor at a time, same-id replace, bark rate-limit). The single biggest O-cluster ask — **done**.
- **Per-faction radio register** ≡ `src/data/barks.js` (8 factions × 8 situations, distinct voices incl. Vael clause-language, Reach toll-wolves, Quiet deniability, Concord procedure). The *cadence data* is shipped; BARK-01/02/03 only surface/shape it.
- **Audio priority + captions substrate** ≡ SG-08 pipeline (`cueSchema.js` `importance`/`playerRelevance`, `presentationAdapters.js` `CAPTIONS` + `UI_CUES`, `CRITICAL_SLICE_EVENT_IDS`). AUD-01/07 extend it; they don't invent it.
- **Comms squelch by category + music ducking** ≡ `audioSystem.js` `_playSquelch(category)` + `_duckMusic()`.
- **The first-15 proof ritual** ≡ `onboarding.js` `BEATS` B0–B5 + `SILENCE_S` mentor-silence + `player.hints` tutorial-memory. PKT-RITUAL *names* it as the REVAMP_MASTER proof surface; it does not rebuild it.
- **Contextual first-time hints (codex-from-action for mechanics)** ≡ `onboarding.js` `_showHint` + `state.player.hints` (persist across saves, never repeat).
