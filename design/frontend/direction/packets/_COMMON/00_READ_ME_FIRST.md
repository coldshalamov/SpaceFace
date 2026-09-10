# Read me first

You are producing part of the user interface for **SpaceFace**, a 2026 desktop space game built to
an A-list standard. This zip is a self-contained work packet: everything the session needs is in
the archive, so nothing waits on a download. Your VM has internet (web search, fetch, curl, package
managers) and a GitHub connector that can read individual repository files by path and open pull
requests; it cannot clone the whole repository (it is ~20 GB). Use the network for typefaces,
libraries and reference study; use the connector for extra source files at the commit named in
`README.txt`, and to return code as a pull request where the packet says so.

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
7. `source/` — a snapshot of repository source at the commit named in `README.txt` (engine sessions).
8. `current/` — captures of the current screens: the content inventory and the *before* picture,
   never a look reference.

## Session mode

A session (`S1`–`S5`) is a full development sprint, not a single task: write `PLAN.md` first, work the
phases in order, overwrite the checkpoint zip after every phase, keep `PROGRESS.md` current, never stop
to ask — decide and record the decision in `NOTES.md`. Image generation is the scarce resource: generate
few masters, derive many assets by script. Prototypes must open from `file://` (classic scripts, inline
fixtures, relative paths).

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
