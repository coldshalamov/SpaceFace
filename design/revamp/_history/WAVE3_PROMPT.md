# WAVE 3 PROMPT — THE DETAIL LAYER — paste this as the first message of a fresh session

> **AUTHORITATIVE — pre-authored by the planning session with the full detail-doctrine context.** This
> supersedes the brief "finishers" sketch of Wave 3 in `WAVE2_PROMPT.md` §6: the finishers moved to **Wave 4**.
> **If you are the Wave 2 session completing your §6 handoff: do NOT overwrite this file** — just confirm the
> addenda list matches what you shipped and append a one-line completion note.
>
> **How to use:** start a fresh session in the SpaceFace repo and paste below the line (or say "follow
> `design/revamp/WAVE3_PROMPT.md`"). This is the wave that kills the **flat, empty, cheap** feeling — it makes
> the systems already shipped **visible, legible, and causal.** Code only; Blender is Grok's lane.

---

You are running **Wave 3 of the SpaceFace revamp — THE DETAIL LAYER.** Optimize for the most correct, verified
result. Bounded parallel fleets/workflows welcome. This wave is judged on two proof surfaces: the **first-15
minutes** and the **47-A slice**.

## 0. Read first (do not skip)
1. **`design/revamp/DETAIL_DOCTRINE.md`** — the constitution. **The one filter you apply to every packet:**
   *"A detail earns its place only if the player can see it, predict it, or change it. If none of the three,
   it's not detail — it's cost."* Obey its load-bearing rules, pillar filter, gold-packet schema, hard-freeze.
2. **`design/revamp/DETAIL_PACKETS.md`** — the 91 curated gold packets, ranked (the Top-24), assigned to BPs,
   with the convergent-validation list (56 already-shipped — **do not rebuild**) and cut/defer list (58).
3. Your BPs: **`BP-11_SECTOR_ATMOSPHERE.md`**, **`BP-12_CAUSAL_ECONOMY.md`**, **`BP-13_PIRATE_ECOLOGY.md`**, and
   the addendum targets `BP-02.1 / BP-05.1 / BP-07.1 / BP-09.1 / BP-10.1` whose packets live in `detail/A..G_*.md`.
4. `design/revamp/REVAMP_MASTER.md` (§3 contracts, §8 doctrine + the first-15 proof ritual) and
   `design/revamp/_BASELINE.md` (diff 47-A against this).
5. Memory: `spaceface-revamp-2-1`. **Verify what Wave 2 actually shipped** before assuming — the codebase has
   repeatedly proven more complete than the skeletons; grep before you build, and mark convergent-validation
   items done instead of rebuilding them.

## 1. Scope — IN (sequenced; each gate-verified before the next)
Build the packets in `DETAIL_PACKETS.md` in this dependency order. **Every packet is authored in the gold-packet
schema and passes the see/predict/change filter.**
1. **W2 detail addenda** (apply now that Wave 2's lanes merged — they were held out of Wave 2 by the hard-freeze):
   **BP-02.1** intent banner · threat-tier + class badge · silhouette threat language · telegraph tell + counter
   window · post-hit readability · scan-reveals-loadout · subsystem targeting · posture/stability · kills-less-
   central outcomes. **BP-02 mining fold** seam-sight · core-breach · tow-the-chunk · loud-drill. **BP-05.1**
   faction radio cadence · bark decay + post-combat silence · Vael garble · ledger-corruption readout · sensor-
   contradiction beat · fact-graph validator. **BP-07.1** mass-feel · mass-personality · overload-handling ·
   drive-voice. **BP-10.1** mask-proof cue priority · tether-strain audio · hostile-lock-vs-scan tone · customs
   dread tone · seam/vent chimes · caption parity. **BP-09.1** loadout-silhouette · build-id · synergy-tells ·
   module-drawback-glyphs.
2. **BP-11 Sector Atmosphere & Station Life** (widest-felt, lowest-risk, mostly surfacing): sector postcard ·
   station orbit bubbles · sealed berth · station broadcasts · station side-events · hazard language · gate
   traffic-control · per-role contact glyph + radio vocab + attack-consequence + movement signatures.
3. **BP-12 Causal Economy Missions & Contracts** (needs the cause-ledger seam): cause-ledger tooltip · economy-
   born missions · convoy-loss investigation · customs moment · cargo-reputation glyph · route-risk preview
   (dedup: this ONE packet, rendered on galaxyMap) · collateral/clauses/moral-trap contracts · price-forecast cone.
4. **BP-01.1 Wreck provenance + salvage depth** (needs `sectorSim` loss hooks): wreck provenance ("who died
   here") · salvage-distinct-from-mining · survivor-pod triage · ghost-convoy rumor · battle-aftermath persistence.
5. **BP-13 Pirate Ecology — LAST** (every packet is a `spawnBudget` client; depends on 3+4): pirate toll ladder ·
   doctrines · named crews & aces (flee-and-remember + faction news) · rumor heat · bounty-hunter neutrality ·
   hunter's signature trick · ambush-leaves-a-grave.
6. **First-15 proof ritual** (REVAMP_MASTER §8) — assemble the shipped verbs (tether-save / mining-rhythm / weak-
   pirate-toll-then-flee / station loop / first choice) into the named ritual with tutorial-memory + mentor-silence.

## 2. Scope — OUT
- **No Blender / GLB authoring / `parts_manifest` edits** (Grok's lane). Asset-gated visuals (station silhouettes,
  landmark/ring-gate GLBs, PBR) → build the code seam, defer the pretty with a TODO.
- **Wave 4 finishers are NOT in this wave:** wingman orders → SG-06 tactics, anomaly/POI distinct behaviors,
  overload/active-vent player mechanics, **one-map cutover** (BP-03 parity → retire old maps), tooltips + text-
  scale + colorblind (BP-10 UX), flight-feel if it slipped. You set up Wave 4 in §6.
- **Anything on the cut/defer list** (`DETAIL_PACKETS.md` §4): keep-two-maps, gate sabotage, used-ship market,
  trick medals, adaptive music, slaver/boarding, local station rep, always-on turrets. Do not build these.

## 3. Contracts (enforce in every packet + subagent prompt)
Determinism (seeded domains; no `Math.random` in sim) · `factionId` cosmetic, hostility via `scanner` ·
**`spawnBudget` client** for every spawn (BP-13 especially; MAX 12, ambient headroom 8) · **`voiceArbiter`** for
all text (one voice at a time) · `sectorZones` is the placement substrate · **budgets are hard caps** (map-glyph,
ship/station silhouette, comms/min, VFX-per-significance) · merge protocol (lanes create NEW files + return
registration; you integrate hot files sequentially).

## 4. The advisor (Fable 5 — the `advisor` tool is broken)
`Agent(subagent_type:"Plan", model:"fable", name:"FablePlanner", prompt:"<digest>. Do NOT call tools; return a
plan.")`; resume via `SendMessage`. **Consult it: (a) before BP-13 (the spawnBudget-client-heavy lane), and
(b) if any packet seems to fight a shipped system.**

## 5. Sequencing & verification (per packet + per BP)
- Run the sequence in §1. **Gate after each BP:** `check:bundle` / `check:mining:2` / `check:ai` green; **diff
  `check:sim:compare` (47-A) against `_BASELINE.md`** — must still fail only on the projectile-collision
  precondition. Boot the headless preview, drive the packet, confirm **zero console errors** + capture proof.
- **Detail-specific gates:** the **five-second-screenshot test** (every entity/station identifiable at a glance);
  the **one-voice audit** (no two player-facing lines at once — `voiceArbiter`); **budget checks** (live ships ≤
  cap via `spawnBudget`; glyph/comms/VFX within budget); **world-cause-ledger** (every surfaced economy/danger
  change has a machine-traceable cause). Never edit `test/*.expected.json` to pass.

## 6. WHEN WAVE 3 IS VERIFIED-COMPLETE — hand off to Wave 4
1. Update `design/revamp/STATUS.md` (or `CURRENT_BUILD_STATUS.md`) + the `spaceface-revamp-2-1` memory with what
   shipped + evidence + any packets deferred as asset-gated (pending Grok).
2. **Author `design/revamp/WAVE4_PROMPT.md`** from this template, scoped to the **finishers & cutover**: wingman
   orders → SG-06 tactics; anomaly/POI distinct behaviors (as `encounters.js` data); overload/active-vent player
   mechanics; **one-map cutover** (BP-03 parity checklist → delete `localmap.js`/`starmap.js`); tooltips + text-
   scale + colorblind (BP-10); flight-feel if it slipped from Wave 2. Keep the same Scope-OUT (no Blender),
   contracts, advisor, verification, and self-continuation sections. Have Wave 4 **declare the revamp
   code-complete** when BP-01..BP-13 + all `BP-0X.1` addenda are done and only Grok's asset production + the
   asset-gated PBR/registration wiring remain.
3. Tell the human: Wave 3 (the detail layer) done, the flat/empty/cheap feeling addressed on the two proof
   surfaces, Wave 4 prompt ready, and what (if anything) is asset-gated pending Grok.

Be decisive, verify everything you claim, leave the tree clean and playable, and remember the filter: **if the
player can't see it, predict it, or change it, it's not detail — it's cost.**
