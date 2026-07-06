# SPEC3 PLANNING CONSTITUTION — read this first, every Fable planning thread inherits it

**What SPEC3 is.** The ambitious expansion layer for SpaceFace. SPEC2 (`design/spec2/`) is a
taste-locked *experience overhaul on the proven engine*: make the existing game feel, read, and teach
well. SPEC3 goes further — it takes the same proven engine and design taste and plans the game up to a
**professional, genre-leading bar**: bigger, more alive, more strategic, more beautiful. Where SPEC2
asks "make what exists land," SPEC3 asks "what should this game *become*, and exactly how do we build it."

**Design authority stack (in priority order):**
1. `ARCHITECTURE.md` — the technical contract. Nothing SPEC3 proposes may violate it silently.
2. `design/GDD_2_0.md` — the design authority. SPEC3 *extends* it; it never contradicts its pillars.
3. This constitution — format, taste, and guardrails for all SPEC3 planning threads.
4. The `_context/` briefs (01–05) — the recon that lets you plan without re-scanning the codebase.

---

## 1. The mandate (what "professional bar" means here)

The finished game, once these plans are built, must be: **big, expansive, beautiful, impressive, fun,
physics-based in its signature moments, with a deep-but-approachable economy, creative and interactive,
borrowing the best of every great space game and improving on it.** Every SPEC3 doc is a step toward that.

Concretely, aim the game at these north stars:
- **Momentum is the toy.** Mass, inertia, tethers, slingshots, impulses are the signature. If a feature
  can be a physics verb instead of a menu, make it a physics verb. (GDD pillar 1.)
- **Read the battlefield at a glance.** Top-down is a readability superpower. Every entity, threat, and
  opportunity is identifiable in one screen glance. (GDD pillar 2.)
- **One voice at a time.** The game never says two things at once. (GDD pillar 3.)
- **The universe was here before you.** Charted space is charted; traffic flies its own routes; prices
  move without you; discovery means *frontier and secrets*, not "the map is blank." (GDD pillar 4.)
- **Depth without a cliff.** Complex, strategic systems (economy, production, territory) must be legible
  from the first hour and reward mastery for a hundred hours. Onboarding is a first-class feature.

## 2. Hard constraints — do not plan around breaking these

- **No engine swap. No new runtime dependencies** unless the spec explicitly flags it as *build-time
  only* (e.g. gltf-transform, esbuild) or names a specific vendored single-file addon with a license and
  an integration-cost note. The game ships as raw ES modules + importmap with a zero-dep static server.
- **No first-person / cockpit / visor motifs.** This is a third-person top-down game. No screen-edge
  arcs, helmet avatars, or diegetic visor framing. (GDD §9, rejected by the user.)
- **Determinism is sacred.** The 60 Hz fixed-timestep sim, the 47a golden replay, and the `check:*`
  harness gate the build. Never plan to edit `test/*.expected.json` to pass. Sim-affecting changes must
  describe how they preserve or deliberately re-record goldens (a named batch, with reasons). The
  `typeof window`-gated heat-vent in `weapons.js` exists to preserve determinism — do not "fix" it.
- **The XZ-plane top-down sim is a feature, not a limitation.** No true-3D/6DOF flight.
- **Respect the perf reality.** Target zero >32 ms frames on mid hardware in a browser. Some machines
  fall back to SwiftShader software rendering (2–3 fps) — that is an environment trap, not a code bug;
  plan a GPU-detect + dynamic-resolution path, don't chase it as a game-code regression.
- **Web-shippable.** Everything must run in a normal browser tab and the Electron shell identically.
  Desktop packaging is a shell concern only; it must not change gameplay, assets, or reachability.

## 3. What every planning thread must do (token discipline)

- **Read only your assigned `_context/` brief(s)** (named in your dispatch) + this constitution +
  `design/GDD_2_0.md`. Do NOT re-scan the codebase — the Opus recon already did it. If you need a file
  detail the brief didn't capture, cite what you'd verify and where, but keep planning; don't burn tokens
  spelunking. You are the project manager and taste-master, not the code archaeologist.
- **Advise the builder how to search/generate** when a later implementer will need code they must find,
  an asset they must author, or a library they must fetch — give the exact grep/glob, the exact Blender
  step, the exact image-gen prompt, or the exact `npm i -D` line. You decide *what* to make and *how*.
- **Own your slice's taste.** You are the decision-maker for your domain. Make the call, justify it in
  one line, and move on. When interpolating between options, choose the one that serves the pillars.

## 4. Required spec format (every SPEC3-XX file)

Each spec is a self-contained build plan an implementing agent (Codex/Claude/etc.) could execute without
you present. Use this skeleton:

```
# SPEC3-XX — <Title>
**Thread:** <Fx domain>  ·  **Reads:** <_context briefs>  ·  **Status:** PLAN
**One-line pitch:** <what this delivers and why it matters>

## 1. Why this / what's holding us back
The specific current-state gap (cite the brief / GDD / file:line where you can). Name the anti-pattern
this avoids.

## 2. The design — how it should work and feel
The player-facing experience, the loop, the numbers where they matter, the feel targets. Prose + tables.

## 3. Architecture & wiring — how to build it on THIS engine
Which systems/files it touches, which event-bus events it emits/consumes, which GameState fields it
adds, how it respects determinism and save/load. Name the extension seams from the brief.

## 4. Key code — the tasteful / tricky / illustrative parts
Real code snippets (JS, matching the codebase idiom) for the parts that are hard to get right or that
show the intended shape. Not the whole feature — the parts a smart implementer would otherwise botch.

## 5. Assets & generation instructions
Exact instructions for any Blender assets (mesh spec, manifest entry, contract fields), image-gen assets
(the prompt, resolution, tiling/seamless requirement, palette, how it's used at runtime), procedural
audio cues, or shaders. If none, say "no new assets."

## 6. Libraries / tooling
Any open-source library or tool to adopt, with license + runtime-vs-build-time classification + a
one-line integration cost + a caution. If none, say "no new deps."

## 7. Build plan — phased tasks with acceptance
Ordered, bite-sized tasks. For each, the acceptance check (ideally a `check:*` script an agent writes)
and the regression floor it must not break. Mark which tasks are parallel-safe.

## 8. Anti-patterns & pitfalls specific to this feature
What would make this feature bad, boring, confusing, or unshippable — and the rule that prevents it.

## 9. Ambition ceiling (optional)
The "if we nail this, here's the dream version" — the stretch that would make this genre-leading.
```

Length target per spec: **substantial but focused — roughly 250–600 lines.** Density over padding.
Real numbers, real code, real asset prompts. A spec that could be handed to a builder tomorrow.

## 5. The full SPEC3 manifest (your thread owns a contiguous block)

Threads are independent (distinct files, no write conflicts). Each thread writes ALL specs in its block.

| Thread | Reads | Specs (file: `design/spec3/SPEC3-XX-slug.md`) |
|---|---|---|
| **F1 Economy & Trading** | 02, 04, 05 | 10 living-economy-depth · 11 trading-ux-market-intel · 12 contracts-blackmarket-econ-warfare |
| **F2 Mining & Resources** | 02, 04 | 13 mining-mastery-minigame · 14 refining-materials-production · 15 prospecting-exploration-loop |
| **F3 Flight, Physics & Feel** | 01, 04 | 16 flight-model-helm-assist · 17 tether-momentum-verbs · 18 camera-juice-game-feel |
| **F4 Combat, Weapons & AI** | 01, 04 | 19 combat-feel-damage-triangle · 20 weapons-loadouts-tactics · 21 enemy-ai-encounter-director · 22 bosses-named-setpieces |
| **F5 Ships, Modules & Progression** | 02, 01 | 23 ship-roles-verb-kits-outfitting · 24 modules-tech-tree-crafting · 25 fleet-wingmen-crew |
| **F6 Bases, Claims & Tower Defense** | 02, 04, 01 | 26 player-bases-claim-system · 27 sector-tower-defense-siege · 28 territory-control-faction-war |
| **F7 World & Living Universe** | 02, 04 | 29 living-universe-encounter-director · 30 sector-content-identity-map · 31 exploration-anomalies-secrets · 32 narrative-faction-story-spine |
| **F8 Graphics & Visual Direction** | 03, 04, 05 | 33 render-pipeline-postfx · 34 vfx-juice-systems · 35 sector-visual-identity-art · 36 hud-2-0-ui-visual-system |
| **F9 Asset Pipeline** | 03, 05 | 37 blender-ship-asset-pipeline · 38 imagegen-procedural-textures · 39 procedural-audio-expansion |
| **F10 UX, Meta & Capstone** | 03, 02, all | 40 ux-onboarding-attention-arbiter · 41 save-meta-telemetry-liveops · 42 TASTE-MASTER-antipatterns-and-the-bar |

**33 specs.** SPEC3-42 is the capstone: the taste-master doc — the attention-to-detail bible, the
anti-pattern catalogue, and the "how it all coheres" statement. The lead session writes `INDEX.md` +
`00_ROADMAP.md` from the completed set.

## 6. Cross-cutting taste rules (the quiet-luxury bar)

- **When interpolating, choose the quieter option.** Restraint reads as premium. Glow means state
  change, not decoration. Nothing pulses at rest.
- **Every system must answer "what does the player DO, second to second?"** before "what does the sim
  compute." Depth that never surfaces as a decision or a feel is not depth — it's cost.
- **No spreadsheet without a story.** The economy/production/territory systems must always have a
  human-legible read: a color, a route, a threat, a payoff. If a feature is only numbers, it's not done.
- **Teach by doing, once, then be silent.** Every new verb gets exactly one teaching moment; then the
  game trusts the player. No nag text, no permanent tutorial furniture.
- **Physics comedy and physics drama are content.** Sling an asteroid into a pirate nest; whip 180°
  around a station at full burn. Lean into the toys.
- **Coherence over quantity.** 33 specs must feel like one game, not 33 features bolted on. Reference
  sibling specs by number when your feature depends on or feeds another (`see SPEC3-17`).

*Written by the lead SPEC3 session, 2026-07-04. Inherits `design/GDD_2_0.md` and `design/spec2/00_MASTER_TASTE.md`.*
