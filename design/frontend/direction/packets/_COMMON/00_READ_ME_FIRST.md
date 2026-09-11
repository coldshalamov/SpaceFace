# Read me first

You are producing part of the user interface for **SpaceFace**, a 2026 desktop space game built to
an A-list standard. A session runs one of two ways:

- **Locally under a terminal agent (the preferred route — Codex, `gpt-6-astra` at xhigh).** The
  repository is in front of you; there is no zip courier. Wherever the packet names an `inputs/`
  path, read the repository path it lists instead — in particular the accepted S1 kit lives at
  `assets/ui/kit/` and the approved frames at `design/frontend/direction/approved/`. You can run
  Blender, the repo's own checks, and your built-in image generation. You return a branch plus a
  receipt, not an archive.
- **From a zip under ChatGPT 6 Pro.** This zip is a self-contained work packet: everything the
  session needs is in the archive, so nothing waits on a download. Your VM has internet (web
  search, fetch, curl, package managers) and a GitHub connector that can read individual
  repository files by path and open pull requests; it cannot clone the whole repository
  (it is ~20 GB). Use the network for typefaces, libraries and reference study; use the connector
  for extra source files at the commit named in `README.txt`, and to return code as a pull request
  where the packet says so.

## Read in this order

1. `PACKET.md` — the task: objective, inputs, exact deliverables, acceptance, stop conditions.
2. `_COMMON/01_GAME_DOSSIER.md` — what the game is, its screens, the exact strings it shows, what
   has been rejected before.
3. `_COMMON/02_ART_DIRECTION.md` — the look you are building to ("Field Hardware"), its two tests,
   registers, materials, type, colour, motion, and the anti-pattern guard.
4. `_COMMON/03_CONVENTIONS.md` — file formats, naming, the manifest schema, the quality checks,
   the return contract.
5. `phases/` — the detailed phase specs a session bundles (deliverable inventories, acceptance,
   and "the way this gets faked" per phase). `PACKET.md` is the plan; these are the details.
6. `inputs/` — prior session returns, fonts, libraries and reference files this packet depends on.
   If `inputs/MISSING.txt` says a prior return must be attached, it was handed to you as a second
   zip (`S1-return.zip`, `S2-return.zip`, …): unzip each into `inputs/` before starting. If a listed
   return was not attached at all, record it under `BLOCKED` in `NOTES.md` and do every phase that
   does not depend on it.
7. `source/` — a snapshot of repository source at the commit named in `README.txt` (engine sessions).
8. `current/` — captures of the current screens: the content inventory and the *before* picture,
   never a look reference.

## Session mode

A session (`S1`–`S5`) is a full development sprint, not a single task: write `PLAN.md` first, work the
phases in order, overwrite the checkpoint zip after every phase, keep `PROGRESS.md` current, never stop
to ask — decide and record the decision in `NOTES.md`. Image generation is the scarce resource: generate
few masters, derive many assets by script. Prototypes must open from `file://` (classic scripts, inline
fixtures, relative paths).

## Image production — which tool makes what (a hard rule)

Two different jobs need two different tools. Confusing them is the one failure this program has
already shipped once: a rejected S1 return whose "plates" were flat fills painted by a script,
whose "world plates" were upscaled recovered renders, and whose 86 icons were one silhouette
repeated. Do not repeat it.

**Manufactured surfaces are rendered, not painted.** Plates, keys, controls, gauges, radar faces,
windows, sockets, badges, tapes, wear overlays — anything that must hold pixel-exact registration
across states, nine-slice integrity, or true alpha — is produced by the repository's Blender kit
harness: modelled geometry rendered in Cycles (`assets/ui/kit/tools/bl_common.py` + `bl_kit.py`,
the same tools that produced the approved kit). A diffusion model cannot hold registration across
a state set, and a script-drawn flat fill is "flat colour with words on it" — it fails the
Asteroid Works test by construction. Running inside the repository: run the harness. Running
from a zip without it: an image tool's output for these is a *mood reference* the local lane
reproduces through the harness — label it as such in `NOTES.md`.

**The world is the game's own world.** Scene plates behind frames are Cycles renders of the
game's real GLBs (`bl_scenes.py`, `bl_world.py`). From a zip, the native image tool may stand in
for a plate the local lane re-renders; in the repository, render the real scenes.

**Mood imagery may come from the running harness's native image tool** — `image_gen` (ChatGPT's
native tool is GPT Image 2.5; Codex's built-in `image_gen` is the same model family): arena/mode/
difficulty keyart tiles, backdrop plates, nebula and dust fields — anything where pixel-exactness
across files is not required. Never a third-party connector (Adobe or otherwise), and never
silently: name the tool beside every master in `NOTES.md` and in `manifest.json` → `tools`.

**If no capable tool exists, write `BLOCKED: <tool>` with the exact request in `NOTES.md`,
deliver everything that does not need it, and stop.** Never substitute programmatic flat fills,
recovered or upscaled art, or another generator quietly: a return whose masters came from a
substitution is rejected on return, whatever it looks like.

Getting the most from the native image tool:

- Ask for a **transparent background** explicitly whenever an asset needs alpha, then verify real
  alpha (a painted checkerboard or a flat colour is a failure — regenerate).
- Generate at the largest size the tool offers and downsample yourself; never upscale.
- Generate **master sheets** — several related assets on one canvas, on a flat magenta or
  transparent ground — and cut them by script; iterate on one master until it passes the two tests
  in `02_ART_DIRECTION.md` §2 before deriving anything from it.
- Feed the tool your own earlier output as the reference when consistency matters (the approved
  frame, a crop, the material swatch), and say "match this exactly" in the request.
- Keep `prompts.md` with the exact request used for every master so any of them can be regenerated.

## How to work

- Plan first, in `NOTES.md`: list every deliverable from `PACKET.md`, then produce them in that
  order. Generate, inspect, correct, and only then package.
- Use your tools for real: image generation for raster work (then cut, align and alpha-clean in a
  scripting environment), hand-written SVG for vector work, scripts for anything repeatable. Look
  at what you made at 100 % and at 50 % before you package it. If something reads as a web page, a
  cockpit, a hologram, or a flat gray box, redo it.
- Reuse the game's exact strings and nouns. Invent nothing that the dossier does not give you.
- Secure the deliverable zip **before** writing a long reply. If you are running out of turn,
  package what exists and record the gaps in `NOTES.md`.
- Your reply in chat should be short: what is in the zip, what is missing and why, and any question
  the next packet needs answered. Do not restate the brief.

## What "done" means

The packet's acceptance list is met, every file it names exists in the zip, the manifest validates
against the schema, the quality checks in `03_CONVENTIONS.md` §7 have been run and their results
written into `NOTES.md`, and every deliverable passes the two tests in `02_ART_DIRECTION.md` §2.
A partial return with an honest `NOTES.md` is worth more than a complete-looking return with
invented files.
