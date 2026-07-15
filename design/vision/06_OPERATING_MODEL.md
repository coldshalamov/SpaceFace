# 06 — Operating Model (how agents work on SpaceFace)

**Status:** LIVE process law (2026-07-09).  
**Applies to:** any open-ended product sprint under `design/vision/`.

This is how we get **maximum quality with no sore thumbs** — not how we farm green checkboxes.

---

## 1. Mandate: open-ended competence

You are not limited to “only what the human typed.”

| You must | You must not |
|---|---|
| Research peer games and **deduce** polish/features no serious title would ship without | Wait for the user to spell every common-sense feature |
| Plan *and* implement when capacity allows | Dump a plan and stop if the brief said “build” |
| Spawn subagents for parallel research, review, asset gen, checks | Pretend one pass is enough for visual/feel work |
| Use **image gen, video gen, Blender MCP, screenshots** in the asset/UI pipeline | Treat clay boxes and cartoony portraits as final |
| Judge **fun vs lame** with eyes and play, not only scripts | Mark DONE because a check is green |
| Kill **sore thumbs** (floating white box, unreadable UI, broken bank) before adding features | Ship new content next to an obvious visual bug |

When ambiguous: **choose the more playable, more beautiful, more original** option, then document the choice in the handoff.

---

## 2. Tool stack (use them)

| Tool | Use for |
|---|---|
| **Screenshot / browser capture** | Every visual or flight feel change — baseline → iterate |
| **Image generation** | Concept boards, textures, UI mockups, env references, **portrait plates** (photoreal/semi-real, not sticker-cartoon) |
| **Video generation** | Motion references (bank, cruise streak, gate transit), short feel clips for review |
| **Blender MCP** | Hero meshes, stations, landmarks, hard-surface iteration |
| **Subagents** | Parallel: explore code, plan, review fun, run checks, draft assets |
| **Structured critique matrix** | Name visible/player-facing defects and compare evidence (see §4) |
| **Automated tests** | Expand when a bug class recurs; never sole acceptance |

Generated art is **authoring input** until wired through the real pipeline (`release` → manifest → runtime map → `check:assets:live`). Reference-only dumps in `assets/concept/` do not count as shipped.

---

## 3. Outcome-driven quality loop

Use **capture → critique → fix the largest justified defect → recapture**.

### For any visual surface (ship, station, UI, VFX, portrait)

1. **Baseline shot** (`.devshots/vision/<wave>/<thing>-00-baseline.png`)  
2. List **sore thumbs** (anything a player would mock in 2 seconds)  
3. Make the largest coherent improvement supported by the evidence.
4. Recapture in comparable framing and record what improved, regressed, or remains.
5. Stop only when objective defects are closed and independent in-context review accepts the result;
   iteration count and self-score are not evidence.

### For flight / massline / combat feel

1. Scripted or manual clip (boost turn, latch flyby, undock, dock)  
2. Review piloting dimensions (see matrix) and name concrete failure evidence
3. Tune constants / assists / visuals  
4. Re-capture; do not rely on headless telemetry alone  

### For AI / world density

1. 5–10 min play notes: deaths, empty minutes, intentional enemy beats  
2. Fix fairness/density/intention  
3. Re-play same route  

**Transcripts and self-scores are not proof. Current captures, public-route play notes, checks, and
independent review are.**

---

## 4. Critique matrices

Use these dimensions to prevent blind spots. The former weights are retained only as relative
attention hints; do not compute a composite, threshold, or DONE claim from them. Acceptance is a
reasoned defect verdict against current captures and public play.

### 4.1 Visual / asset surface

| Dimension | W | 0–3 sore | 8–10 excellent |
|---|---:|---|---|
| Silhouette readability | 15 | Blob / floating junk | Instant ship class ID |
| Material / lighting | 15 | Flat gray / pure white emissive cubes | Believable metal, night emissives |
| No sore thumbs | 20 | Detached boxes, z-fight, wrong pivot | Clean hero frame |
| Motion / animation | 10 | Pin-spin bank, frozen thrusters | Bank + plume + heat |
| Originality | 10 | Obvious franchise rip name/mesh | Own identity |
| Consistency with scene | 10 | One part looks from another game | Unified palette |
| Performance honesty | 10 | 30fps crater for one prop | Within budget |
| Pipeline correctness | 10 | Fallback procedural | Authored path wired |

**Acceptance:** no unresolved critical failure in silhouette, identity, materials, scale, framing,
runtime stability, or player-camera readability.

### 4.2 Flight / massline / combat feel

| Dimension | W | 0–3 sore | 8–10 excellent |
|---|---:|---|---|
| Controllability | 20 | Can’t hold a heading / dies to own physics | Intuitive in 60 s |
| Mass / front-back identity | 15 | Puck on a pin | Nose leads, tail follows, bank reads |
| Massline usability | 20 | Pixel latch only | Soft latch + Flyby Focus fun |
| Fairness / TTK | 15 | Death every few seconds | Die rarely, learn why |
| Enemy intention | 10 | Zip chaos | Approach / orbit / break |
| Feedback juice | 10 | Whisper hits | Hits/kills/latch answer |
| Discoverability | 10 | Hidden autopilot | Modes obvious |

**Acceptance:** controllability, fairness, enemy intention, feedback, and discoverability survive an
unassisted public route without a critical defect.

### 4.3 UI / strategy front

| Dimension | W | 0–3 sore | 8–10 excellent |
|---|---:|---|---|
| Hierarchy / scannability | 20 | Wall of text | Numbers first, 5 s parse |
| Beauty / polish | 15 | Debug overlay | Coherent clean chrome |
| Density (good kind) | 15 | Empty or spam | Data-rich, quiet labels |
| Mode / control clarity | 15 | Mystery keys | Always know mode |
| Consistency | 10 | Each screen different OS | One kit |
| A11y / contrast | 10 | Unreadable | Passes contrast |
| No nonsense copy | 15 | Tutorial essays | Short professional |

**Acceptance:** the supported resolutions and inputs remain clear, accessible, coherent, and free of
duplicated or obstructive instruction.

### 4.4 World / density

| Dimension | W | Score guide |
|---|---:|---|
| Landmarks findable | 20 | ≥3 named near start |
| Empty-time | 20 | No 60 s void in play belt |
| Traffic / life | 15 | Ships with jobs |
| Travel feel | 15 | Gates no load slap |
| Visual variety | 15 | Not 6 prop types forever |
| Danger fairness | 15 | Threat telegraphed |

---

## 5. Must-have polish (genre common sense)

Serious space sandboxes are rarely caught dead without these. **If SpaceFace lacks one, treat it as a defect**, not a “nice to have.”

### Always-on product floor

1. **Readable self-status** — hull/shield/energy/heat/cargo/credits without hunting  
2. **Clear target** — who, range, threat, shield/armor/hull  
3. **Input → ACK < 50 ms** — light, sound, or motion on every verb  
4. **Brake / stop assist** — or equivalent “I can halt”  
5. **Map that answers “where do I go?”** — stations, gates, objective  
6. **Autopilot / set course** — discoverable  
7. **Docking that isn’t a skill trial** on first hour  
8. **Soft failure** — death doesn’t delete the save (unless ironman)  
9. **Save / continue that works**  
10. **Pause**  
11. **Rebind or visible control legend**  
12. **Audio for thrust, weapons, hits, UI**  
13. **Sector/place identity** — color, lighting, landmarks  
14. **Traffic or ambient life** so space isn’t a void  
15. **Trade numbers that mean something** — buy/sell, stock, trend  
16. **Outfit preview** — what changes if I equip this  
17. **Threat telegraph** — something before you’re dead  
18. **Loot/payoff clarity** — what I got and why  
19. **Performance stability** — no multi-second hitches in normal play  
20. **No placeholder geometry in hero shots** — no floating white boxes  

### SpaceFace-specific floor (our wedge)

21. **Massline works under adrenaline** (latch + lever + feedback)  
22. **Flyby Focus** (or equivalent assist) for high-speed tag  
23. **Ship bank that sells flight**, not pin-spin  
24. **Original names & voice** — inspired by Freelancer, not cosplay  
25. **Strategy UI density without prose walls**  

Agents should **add** to this list when research finds another universal (document in handoff).

---

## 6. Anti-derivative identity

**Inspired by** Freelancer / ES / Star Valor / Rebel Galaxy / X.  
**Not a skin of Freelancer.**

| Rule | Example |
|---|---|
| No famous hull names as player ships | **Rename Kestrel** (Freelancer association); revisit Wasp/Pelican if they read as clones |
| No copy-paste faction pastiche without twist | Own factions, voice, icons |
| Signature verb is ours | Massline, not “just another laser trader” |
| Portraits | Semi-real cinematic headshots, not cartoony stickers |
| UI | Clean data-dense SpaceFace chrome, not default Three.js debug |

Rename work is a **real backlog item** (data ids may stay for saves with display-name remap + migration notes).

---

## 7. Sore-thumb protocol

When a sore thumb is reported or seen (e.g. **floating white emissive box on starter hood**):

1. **Reproduce** with screenshot (label the mesh if possible)  
2. **File in** `01_CURRENT_STATE.md` under PLAY defects  
3. **Priority ≥ feature work** in the same surface (ship visual fix before new greebles)  
4. Fix → reshoot → obtain independent confirmation that the defect is gone without a worse regression

Likely Kestrel candidates (code-native hero): high-intensity `sensor` emissive materials on boxes/slits/nav lights (`kestrelHero.js` — `mat.sensor` intensity ~3.2 on box meshes). Treat as **W1/W4 visual hotfix** lane.

---

## 8. Tests: expand, then judge

| Layer | Role |
|---|---|
| Unit/sim checks | Regress determinism, latch math, AI envelopes |
| Browser probes | Boot, assets live, visual stability |
| **Play rubric** | Fun/lame judgment (required) |
| **Critique record** | Named defects, comparison evidence, and independent verdict (§4) |

If a class of bug escapes twice, **add a check**. If a check is green but play is lame, **the wave is not done**.

Subagent **reviewer** role: after implementation, a second agent uses §4 to list concrete defects
from shots/clips and gives a reasoned accept/reject verdict. The implementer addresses every critical
or major defect before DONE.

---

## 9. Subagent patterns

| Pattern | When |
|---|---|
| Explore | Find bank/tether/UI owners fast |
| Plan | Multi-file waves |
| Implement | Single wave row |
| Art pass | Image gen portraits/textures + Blender |
| Review / fun judge | Use critique matrices, reject concrete lame/unreadable results |
| Check runner | Parallel `npm run check:*` |

Parallelize art + code when file ownership doesn’t collide. Blender lock remains exclusive.

---

## 10. Definition of DONE (any vision wave)

- [ ] Constitution-aligned  
- [ ] Wave deliverables implemented  
- [ ] Relevant automated checks green (or debt named)  
- [ ] Quality loop complete; independent review has no unresolved critical/major defect
- [ ] Play notes: fun ≥ lame for the wave’s fantasy  
- [ ] `.devshots/vision/...` evidence  
- [ ] `01_CURRENT_STATE.md` updated honestly  
- [ ] No known sore thumb left on touched surfaces  

---

## 11. Open-ended research duty

At the start of a large wave, spend a short research pass:

1. What do top peers do for this fantasy?  
2. What would look unfinished if missing?  
3. Add 1–5 items to the must-have list or wave backlog  
4. Implement the highest-leverage gaps inside the wave  

Do not invent multiplayer or SC interiors under this duty; stay inside constitution non-goals.
