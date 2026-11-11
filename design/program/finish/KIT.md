<!-- LIFETIME: ACTIVE_PROGRAM -->
> **HISTORY — not a source of work.** Superseded on 2026-11-11 by `design/program/fleet/QUEUE.md`
> (work) and `design/game/` (design). Read for background only; do not take tasks from this file.

# THE KIT — stretch every asset: visible fits, endless variants, places from parts

*Creative direction, 2026-11-06 (see `DIRECTION.md`). Owner: "don't we have mostly pieces that we
put together to make ships? … like Freelancer where you could buy a new gun for your ship and the
actual gun on the ship model would change … those sound like things that could benefit from a lot
of parallel processing from some vision agents."*

## 1. The idea

A ship is not a model. **A ship is a recipe:**

> **Hull + Kit + Fit + Livery + Wear = the ship you see.**

- **Hull** — the Forge body (`tools/blender/forge/ships/*.py`), with typed sockets.
- **Kit** — bolt-on pieces that change silhouette: armour plates, scrap welds, cargo racks, antenna
  masts, fins, extra tanks (the Foundry's `kit_<family>_vNN.glb`).
- **Fit** — what you actually equipped: guns, drives, shields, Line heads, utilities. **Every fitted
  part is a visible part on the hull**, Freelancer-style, and the real muzzle is where the shot comes
  from.
- **Livery** — paint scheme, faction marks, decals, emissive pattern.
- **Wear** — grime, scorch, dents, missing panels, live damage.

Recipes multiply assets: 15 hulls × 30 kit pieces × 40 fittings × 12 liveries × 4 wear levels is
more distinct, *readable* ships than we could ever model one by one. The same grammar at large
scale builds stations and Hotspots (§K7).

**References (from what you know, no videos needed):** *Freelancer* — buy a gun, see it on your
wing. *Armored Core* — parts change the silhouette and you can read a build. *Borderlands* — every
manufacturer has a visual grammar, so you know who made a gun at a glance. *Mad Max (2015)* — the
Magnum Opus visibly grows as you upgrade it. *Star Wars* used-universe — ships patched with
mismatched parts tell a story. Our version: **you can read a ship's role, faction, fit and history
from the top-down camera.**

## 2. What exists (verified 2026-11-06)

- The **Forge**: every whole-ship body is a Blender Python script, previewed with
  `node scripts/fleet-look.mjs` and published with `node tools/blender/forge/publish.mjs`
  (`assets/ships/AGENTS.md`, `tools/blender/forge/FORGE.md`).
- The **Foundry**: kit-bash pieces, faction variants and scenery with naming rules and a render /
  validation harness (`design/foundry/FOUNDRY_CONTRACT.md`, `tools/foundry/`).
- **Faction surface language** (`design/foundry/FACTION_SURFACE_LANGUAGE.md`).
- The machine records: `assets/ships/parts/parts_manifest.json`, `release/release_manifest.json`,
  the maps in `src/render/partsLibrary.js`. Hull models carry sockets/hooks.
- ~1,650 ship GLB files (bodies, parts, LODs) — plenty of raw material; **no grammar that combines it
  for the player or for NPC variety.**

## 3. The quality bar

At the **gameplay camera** (top-down, the distance the player actually flies at):
1. You can tell **role** (fighter, hauler, tug, police, pirate) from silhouette alone.
2. You can tell **faction** from livery and kit style alone.
3. You can see **what's fitted**: a heavy gun looks heavy; a turret turns toward its target; a
   different drive changes the engine glow and plume.
4. You can see **history**: a pirate hauler is visibly patched; a police cutter is clean; a ship that
   took damage this fight shows it.
5. **No clipping, no floating parts, no scale mistakes** at close zoom (the hangar / ship sheet).

## 4. The workstreams

#### K1 — Part census with vision tagging (parallel)
Render every part, kit piece, fitting visual and hull (contact sheets via `fleet-look` and the
Foundry harness at gameplay + close views). **Vision agents** (batch prompt, §6) tag each one:
role, size class, socket type, style family / manufacturer, faction fit, silhouette strength (1–5),
quality issues. Output: `assets/ships/kit/catalog.json` + contact sheets. **Done:** every GLB in the
manifests tagged by two independent vision passes; disagreements resolved.

#### K2 — The mount standard
One socket vocabulary on every hull: `weapon.{S,M,L}.{fixed,turret}`, `drive.{S,M,L}`,
`shield.emitter`, `utility.{S,M}`, `line.head`, `armour.panel.{n}`, `kit.{top,side,rear}`. Each hull's
Forge script declares its sockets with transforms and clearance. Each weapon/module def in
`src/data/weapons.js` / `modules.js` maps to a **visual part id** per size. **Done:** every hull has
sockets for every slot it offers; every purchasable fitting has a visual; a validation script fails
on a missing mapping.

#### K3 — Visible loadout (the Freelancer moment)
Runtime mounter: when the fit changes, the mesh on the socket changes (with a short mount animation
in the hangar). Turrets rotate to the aim. **The real muzzle socket is the projectile origin** —
gameplay truth, not decoration. Drives change plume colour/shape/length; shields change the hull
sheen. Works for the player and every NPC. (Takes over master-plan **P4**.) **Done:** a lineup of
one hull in five fits that an independent reviewer tells apart from the picture alone; shots leave
the visible muzzles; no frame-time regression (E10).

#### K4 — The variant factory
A deterministic generator: `recipe(role, faction, seed) → hull + kit + fit + livery + wear`, with
faction rules (pirates: mismatched guns, scrap plates, heavy wear; police: clean, uniform, strobes;
miners: tools, ore racks, dust; racers: fins, bright livery, light kit). Every NPC role has **≥ 3
distinct variants per faction** at gameplay camera, and named NPCs get a bespoke recipe. **Done:** a
role × faction contact sheet where vision reviewers score role and faction readability ≥ 4/5.

#### K5 — Livery and wear
Parametric material layers (paint scheme, faction marks, decals, emissive pattern, grime, scorch,
dents, missing panels) on the shared hull materials — no per-ship baked texture sets (Forge rule).
Player paint is **earned** (pilot milestones, Swarm records, notoriety). **Done:** one hull in 12
liveries × 4 wear levels on one sheet; reviewers can name each faction.

#### K6 — Parts that break off
Fitted parts and armour panels are separate pieces: heavy hits knock them off as physical debris
(shoot the gun off a pirate; rip an armour panel off with the Line). Ties to CHAOS (CH-02, CH-03)
and SWARM (boss plates). **Done:** captures of a gun shot off, a panel torn off with the Line, and
the ship flying on visibly damaged.

#### K7 — Places from parts
The same grammar at megastructure scale: station and Hotspot modules (docking arms, tanks, solar
wings, racks, antennae, light rigs, conveyor arms, cutter heads) as kit pieces with sockets, so a
Hotspot is assembled from a kit and every module is breakable (CHAOS CH-03). Feeds the Hotspots lane
(`DIRECTION.md` §7, §10). **Done:** two Helios Hotspots assembled from the kit; modules reused across
both without reading as copies.

#### K8 — The vision QA swarm (standing workflow)
Every new or changed asset goes through **two independent vision reviews** against §3 at gameplay +
close views: silhouette, role read, faction read, fit visibility, clipping/scale, style consistency
with the art direction (master-plan X1). Findings feed a fix queue. Many cheap vision agents can run
in parallel on batches (§6). **Done (per asset):** both reviews ≥ 4/5 on every §3 criterion.

#### K9 — Fill the real gaps
Only after K1's census: list what's missing (by role, faction, socket type, place module) and build
it through the Forge route, highest-impact first (`DIRECTION.md` §8). **Every asset has a job.**

## 5. Order and collisions

Order: **K1 → K2 → K3 → K5 → K4 → K6 → K7 → K9**, with K8 running continuously.
Coordinate: master-plan **Lane 4** hands P4 (fits you can see) to this program — Lane 4 keeps the
ship sheet and stat model; **Lane 3** (renderer) owns residency/batching — mounted parts must batch
(same-family instancing) and go through its residency path; **Lane 6** (look) owns the art direction
(X1) and hero/place assets (X2) — K7 supplies the module kit; **CHAOS C1** owns breakage rules — K6
supplies the breakable pieces. Never hand-edit a GLB; never bypass the Forge publish route.

## 6. Prompts

### Lead — the KIT lane

```text
You are the KIT lane of SpaceFace — the system that turns our parts into endless readable ships and
places: Hull + Kit + Fit + Livery + Wear = the ship you see.
Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch
master, ONE shared checkout other agents edit at the same time).

READ FIRST, ALL OF EACH: design/program/finish/KIT.md (this program — §3 is the quality bar);
design/program/finish/DIRECTION.md (§1, §2 three ways to fly, §8 assets, §9); assets/ships/AGENTS.md;
tools/blender/forge/FORGE.md; design/foundry/FOUNDRY_CONTRACT.md; design/foundry/
FACTION_SURFACE_LANGUAGE.md; docs/visual-assets/README.md; design/program/finish/MASTER_LANES.md
(collisions); design/program/finish/MASTER_PLAN.md Part 0; AGENTS.md; design/program/NOW.md.

YOUR WORKSTREAMS, IN ORDER: K1 census (you run the batches; launch vision batch workers with the
batch prompt in KIT.md §6) → K2 mount standard → K3 visible loadout → K5 livery and wear → K4 variant
factory → K6 parts that break off → K7 places from parts → K9 fill the gaps; K8 vision QA on every
asset throughout. Each workstream's "Done" in KIT.md is your finish line.

COORDINATION: you take over master-plan P4 from Lane 4 (tell them in NOW.md); mounted parts go
through Lane 3's residency/batching path; Lane 6 owns the art direction (X1) — follow it; CHAOS C1
uses your breakable pieces; the HOTSPOTS lane uses your place kit. Never hand-edit a GLB; ship bodies
only through the Forge route.

HOW YOU WORK: before any edit, write design/program/finish/campaigns/KIT/DIAGNOSIS.md (what exists,
what the gaps are, the chosen road). Every visual claim: contact sheets at gameplay + close views,
two independent vision reviews ≥ 4/5 on every KIT.md §3 criterion. Gameplay truth: muzzles are real
projectile origins. No frame-time regression (E10 dashboard) — mounted parts batch by family.
Shared checkout: claim paths in NOW.md; git add/commit exact paths only; never -A, reset, stash,
clean, rebase or force-push; publish only your paths when local master carries others' unpublished
commits (temp GIT_INDEX_FILE, read-tree origin/master, ls-tree HEAD -- <paths> | update-index
--index-info, write-tree, commit-tree -p origin/master, push, merge back). End commits with:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Keep design/program/finish/campaigns/KIT/STATUS.md current.

FINISH: every workstream meets its "Done". If blocked, finish everything else and name the blocker
in one plain sentence. Report in plain words — done / not done, what changed for the player.
```

### Batch — vision worker (launch many in parallel, cheap models are fine)

```text
You are a SpaceFace vision batch worker. You look at pictures of game assets and judge them.
Repository: C:\Users\93rob\Documents\GitHub\SpaceFace.

READ FIRST: design/program/finish/KIT.md §1 and §3 (the quality bar); design/program/finish/
DIRECTION.md §2 (three ways to fly); design/foundry/FACTION_SURFACE_LANGUAGE.md.

YOUR BATCH: <PASTE: a list of up to 20 asset files or contact-sheet images, and the mode: TAG or REVIEW>.

For each asset: if you only have the GLB, render it with
`node scripts/fleet-look.mjs --file=<glb> --views=inspect,close,top` and OPEN every PNG. Then:
- TAG mode: write role, size class, socket type it fits, style family/manufacturer, faction fit,
  silhouette strength 1–5, and any quality issue (clipping, floating, wrong scale, unreadable at
  gameplay camera, off-style), each in a few plain words.
- REVIEW mode: score 1–5 on each KIT.md §3 criterion (role read, faction read, fit visible, history
  visible, no clipping/scale errors, style matches the art direction), with one sentence of evidence
  per score and the single most important fix.
Write results to design/program/finish/campaigns/KIT/batches/<batch-id>.json (one object per asset).
Do not edit assets or code. Do not guess about an image you did not open. Commit only your batch
file with: git add -- <that file>; git commit -m "kit: vision batch <id>" -- <that file>
(end the message with: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>). Never -A.
Report: batch id, count, and the three worst assets with their fix.
```
