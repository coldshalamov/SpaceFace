# UI production packets

Each folder is one hand-off: `PACKET.md` is the brief, `_COMMON/` is the shared core that goes into
every zip. The series, order and routing are in
[`../FIELD_HARDWARE_PROGRAM.md`](../FIELD_HARDWARE_PROGRAM.md) §4–§5.

## Build a packet zip

```bash
node scripts/build-ui-packet.mjs P01
```

Output: `.devshots/ui-packets/P01-<slug>.zip` (gitignored). The builder reads the YAML block at the
top of `PACKET.md`:

- `current:` — surface ids copied from `test/ui-frame-references/<id>-default-1920x1080.png` into
  `current/` (the *before* pictures and content inventory);
- `inputs:` — repo-relative files copied into `inputs/` (approved frames, kit-notes, source
  excerpts). Missing inputs are listed in `inputs/MISSING.txt` instead of failing, so a packet can
  be built for reading before its dependencies have returned; a packet whose inputs are missing
  must not be handed off.

## Hand a packet to ChatGPT 6 Pro

Start a new conversation with the Pro model, attach the zip, and send exactly:

> Unzip the attached packet and read `_COMMON/00_READ_ME_FIRST.md`, then `PACKET.md`. Do the work
> it describes with your image, scripting and file tools. Return one zip named as the packet says,
> with `manifest.json` and `NOTES.md`. Keep your reply short: what is in the zip, what is missing
> and why.

One packet per conversation. If the return is partial, reply once with the exact missing items
from `NOTES.md`; do not start a third turn — bring it back to the controller.

## Bring a return back

Save the returned zip as `.devshots/ui-packets/returns/<PACKET>-return.zip` and say "review
<PACKET>". The controller unpacks it, validates the manifest, judges the deliverables against the
packet's acceptance list, and either commits the accepted files (frames to `../approved/`, assets to
`assets/ui/kit/`) or writes a correction turn.

## The series

| # | Folder | Lane | Tool |
|---|---|---|---|
| P01 | `P01-frames-title-crucible` | FRAMES | ChatGPT 6 Pro |
| P02 | `P02-frames-flight-hud` | FRAMES | ChatGPT 6 Pro |
| P03 | `P03-frames-station-ship` | FRAMES | ChatGPT 6 Pro |
| P04 | `P04-frames-chart-settings-load` | FRAMES | ChatGPT 6 Pro |
| P05 | `P05-frames-results-gameover-missions` | FRAMES | ChatGPT 6 Pro |
| P10 | `P10-kit-surfaces` | IMG | ChatGPT 6 Pro |
| P11 | `P11-kit-controls` | IMG | ChatGPT 6 Pro |
| P12 | `P12-kit-instruments` | IMG+SVG | ChatGPT 6 Pro |
| P13 | `P13-icon-family` | SVG | ChatGPT 6 Pro / Codex |
| P14 | `P14-marks-logotype-crests` | SVG | ChatGPT 6 Pro |
| P15 | `P15-keyart-tiles-plates` | IMG | ChatGPT 6 Pro |
| P16 | `P16-3d-sets-and-render-harness` | 3D | Codex + Blender (local) |
| P17 | `P17-motion-and-sound-spec` | CODE | ChatGPT 6 Pro |
| P20 | `P20-ui-stage` | CODE | local agent |
| P21 | `P21-kit-runtime` | CODE | local agent |
| P22 | `P22-title-live` | CODE | local (veto point) |
| P30 | `P30-crucible-screens` | CODE | local agent |
| P31 | `P31-hud-instruments` | CODE | local agent |
| P32 | `P32-hud-sensors-and-law` | CODE | local agent |
| P33 | `P33-station-shell-market-ledger` | CODE | local agent |
| P34 | `P34-station-contracts-factions-industry-bar` | CODE | local agent |
| P35 | `P35-ship-shipworks-footprint-range` | CODE | local agent |
| P36 | `P36-chart` | CODE | local agent |
| P37 | `P37-shell-screens` | CODE | local agent |
| P38 | `P38-reading-screens-and-works` | CODE | local agent |
| P40 | `P40-motion-pass` | CODE | local |
| P41 | `P41-sound-pass` | CODE | local |
| P42 | `P42-sweep-and-proof` | CODE | local |

Local (CODE/3D) packets are briefs for an agent working inside an isolated checkout of this
repository; they are built with the same command so the brief travels with `_COMMON`, but the
agent reads the repo directly.
