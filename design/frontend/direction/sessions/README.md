# The five sessions — the hand-off plan

The interface is produced in **five development sessions**, each a multi-hour,
multi-phase sprint that uses image generation, hand-written SVG, code and 3D together and returns
**one coherent, runnable artifact**. Between sessions, local lanes (Codex with Blender, the
controller in the repository) do the work that needs the engine. The detailed briefs under
[`../packets/`](../packets/README.md) are the **phase specs** each session bundles; they are never
handed out alone.

**A session runs one of two ways.** The preferred route is now **local Codex**
(`codex exec`, model `gpt-6-astra` at `xhigh`): the worker runs inside the repository with the
accepted kit at `assets/ui/kit/` and the approved frames at `design/frontend/direction/approved/`
in front of it, uses its built-in `image_gen` (same model family the ChatGPT rule names) for mood
imagery and the Blender harness for manufactured surfaces, and returns a branch plus a receipt.
The alternative is the original courier: a session zip handed to **ChatGPT 6 Pro**, whose VM gets
everything by attachment because it cannot clone the repository. Both routes run the same phases
and the same return contract; `_COMMON/00_READ_ME_FIRST.md` states which tool makes which kind of
image.

The professional shape is the one studios use: **design → prototype outside the engine → port →
QA.** After session 3 the entire frontend exists as a runnable prototype; session 4 ports it into
the game; session 5 corrects it against live captures.

| Session | Returns (one zip) | What the owner can look at | Local lane it unlocks |
|---|---|---|---|
| **S1 — The design system** | Style frames for the three hero screens (title ×3 shots, Crucible door, HUD resting + wanted); design tokens; the surface, control and instrument kits; the 80-glyph icon family and the marks; the motion library and sound recipes; **a kit page and the three hero screens as HTML prototypes** built from the produced assets | Open `kit/index.html` and `screens/title.html` in a browser: the new interface, real strings, real materials, moving | **L-A The stage** (P20): the main renderer draws a lit hangar behind the title, on one GPU context |
| **S2 — The bench register** | Frames for docking, market, THE SHIP, chart, settings, load; the assets those need; keyart tiles and backdrop plates; **HTML prototypes of every station tab, THE SHIP, the chart, settings, load**; procedural 3D drafts and Blender scripts for the hangar and berth with a preview page | Every docked screen and the map, running outside the game | **L-B Blender sets** (P16): the hangar, berth and arena finished to the asset standard from S2's scripts |
| **S3 — The prototype app** | Remaining frames (results, game over, missions, codex; pause, new game, help, tech tree, credits, photo derived); remaining assets; **one navigable prototype of the whole frontend** with motion, sound, keyboard/pad focus, reduced-motion and forced-colours; an audit script suite | Play the entire interface end to end in a browser, no game needed | — |
| **S4 — The engine port** | The prototype ported into the game's own modules against a pinned commit: the kit runtime, every screen module, the HUD sections, the chart shell, a draft of the stage module; full files + a patch + a port map; the repo's own static checks left green | Nothing new to look at until integration | **L-C Integrate** (P21 → P22 the title live = the veto point → P30–P38 surfaces) |
| **S5 — QA and the second pass** | Live captures reviewed beside the frames: a punch list with exact fixes, assets v2, motion and sound corrections, the blind-comparison protocol and the reel plan | The finished screens, corrected | **L-D Sweep and proof** (P40–P42) |

S1 is the big one: it front-loads everything the other sessions consume. S5 waits on L-C, so it is
not "five sessions in five days" — it is five sessions across the program.

## What a session can and cannot do

Images follow `_COMMON/00_READ_ME_FIRST.md`'s production law: **manufactured surfaces and world
plates come from the repository's Blender harness** (modelled geometry, Cycles, real game GLBs —
the way the approved kit was made); **mood imagery** (keyart tiles, backdrops, nebula fields)
comes from the running harness's **native `image_gen`** — ChatGPT's GPT Image 2.5 or Codex's
built-in tool. Never a third-party connector, never a silent substitution, never flat fills drawn
in a script; a return whose masters were substituted is rejected however good it looks. If no
capable tool exists the session writes `BLOCKED` and stops rather than faking.

The ChatGPT 6 Pro VM has internet — web search, fetch, curl, package managers — so a session may
download any typeface or library it wants (subject to the bundling-licence rule in
`_COMMON/03_CONVENTIONS.md` §4) and study the named references at their official galleries. It has
a GitHub connector that reads individual repository files by path and opens pull requests, but it
**cannot clone the repository** (~20 GB). That is why each session zip carries everything it needs
(prior returns, fonts, libraries, a pinned source snapshot for the engine sessions): nothing waits
on the connector, and S4/S5 return their code both as a pull request and as a zip.

## Sizing rationale

One session = one ChatGPT 6 Pro conversation with its VM, run as a sprint: a written plan first,
phases in order, a **checkpoint zip overwritten after every phase**, `PROGRESS.md` kept current,
never stopping to ask. Image generation is the scarce resource, so every brief says: generate few
**masters**, derive many assets by script. Code, SVG and packaging are cheap in the VM; they are
where the session's hours go. If a session runs out before its last phase, the checkpoint zip is
still coherent and the next session's brief lists the remainder as its first phase.

## Build a session zip

```bash
node scripts/build-ui-packet.mjs S1
```

Output: `.devshots/ui-packets/S1-design-system.zip`. The builder bundles `_COMMON/`, the session's
`PACKET.md`, the phase specs it names under `phases/`, prior session returns it names under
`inputs/`, current-screen captures under `current/`, and (S4 only) a source snapshot under
`source/` stamped with the commit it was cut from. It prints the zip size; S2–S4 carry earlier
returns and can be tens of megabytes — that is expected.

## Run order — what to attach to each session

All five zips are built up front and can be read today. Sessions 1–4 run **back to back**: each
one needs only the previous session's return zip attached beside it. The controller's review of a
return runs in parallel and never blocks the next hand-off; its corrections ride along in the
next return or the next session's `inputs/`. Session 5 is the only one that waits, because it
reviews the integrated game.

| Hand-off | Attach | Waits on |
|---|---|---|
| **S1** | `S1-design-system.zip` | nothing |
| **S2** | `S2-bench-register.zip` + `S1-return.zip` | S1's return |
| **S3** | `S3-prototype-app.zip` + `S1-return.zip` + `S2-return.zip` | S2's return |
| **S4** | rebuild first (`node scripts/build-ui-packet.mjs S4`, so the source snapshot is current) → `S4-engine-port.zip` + `S3-return.zip` | S3's return; the local stage and Blender lanes should have landed |
| **S5** | rebuild first (it then carries the integration captures and the post-integration snapshot) → `S5-integration-qa.zip` | local integration of S4 (the title veto has happened) |

Each zip's `inputs/MISSING.txt` names exactly what to attach. Returns go in
`.devshots/ui-packets/returns/<S>-return.zip`; if you also unzip them there, the next rebuild packs
them inside and nothing needs attaching. **Under the local Codex route none of this applies:**
the worker reads the repository paths the session's `inputs:` names and returns a branch plus a
receipt instead of a zip.

## Hand a session to ChatGPT 6 Pro

New conversation, Pro model, attach the session zip and the return zip(s) the table names, send
exactly:

> Unzip the attached session packet and read `_COMMON/00_READ_ME_FIRST.md`, then `PACKET.md`. If
> other zips are attached, they are previous sessions' returns: unzip each into the packet's
> `inputs/` folder first. This is a full development session: plan it in `PLAN.md`, work phase by
> phase, overwrite the checkpoint zip after every phase, keep `PROGRESS.md` current, and never
> stop to ask a question — decide and record the decision. For every image, use only your native
> `image_gen` tool (its model is GPT Image 2.5; you may not know that name — use the native tool
> anyway); never Adobe or any other connector or plugin, and never substitute another image model
> silently. Return the final zip named as the packet says, with `manifest.json`, `NOTES.md` and
> `QA.md`. Keep your reply short: what is in the zip, what is missing and why.

If the session still reaches for another image tool mid-run, reply once: "Stop. Use only the native
image_gen tool for images; regenerate every master that was not made with it, and note the tool
beside each master in NOTES.md." A return whose masters came from another generator is rejected.

One session per conversation. If the return is partial, one follow-up turn may ask for the exact
missing items named in `NOTES.md`; after that the remainder goes into the next session's brief.

## Bring a return back

Save the return as `.devshots/ui-packets/returns/<S>-return.zip` and say "review S1". The
controller validates the manifest, opens the prototypes, judges frames and assets against the two
tests and the guard, picks among variants (recorded in the return as `DECISIONS.md`), commits
accepted frames to `../approved/` and accepted assets to `assets/ui/kit/`, and starts the local lane
the session unlocks. None of that has to finish before the next session is handed off.
