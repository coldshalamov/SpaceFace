# Changelog

All notable changes to SpaceFace are documented here. This project is in **public beta** —
expect rough edges; report what you find.

## [0.2.0-beta.1] — 2026-10-23

First public beta. The goal of this build is **trust**: honest screens, recoverable saves,
and a readable first flight.

### Highlights

- Line Class I–VIII: the Line logs true tonnage held, advances your class, and strains —
  winch heat, reel/turn clamps, and a grace-window snap — when you tow past your ceiling.
- Swarm room legendaries (Domino, Graviton Heart) — run-scoped effects with authored deaths.
- Records Wall, Crucible daily board, and Range Licence with medals and best-time memory.
- Situation-taught powers in the first ten minutes: Pull, Shove, Pin, Bomb, Rig.
- World pressure: the Tide, gate audits, the Slow Gray, and chart receipts for both.
- Truthful screens: mission/map paperwork, loading destination slate, honest dialog
  dismiss semantics, mixer channels that read what they mix.

### Known issues

- Line heads (the 14 attachments) are visible in outfitting data but their P0 behaviours
  are not all live yet — treat them as cosmetic this build.
- The Bloom faction ladder is authored data awaiting its runtime laws.
- Player-truth gates: some deep-run acceptance walks still report UNKNOWN on low-end GPUs.
- Crash-recovery receipts and the retail-bundle boot check are still being wired (O1–O7,
  O24); Electron builds are experimental.
- Old saves load, but the migration-gap fixture suite is not complete — back up saves you
  care about.

### Feedback

- **Bugs:** open an issue at https://github.com/coldshalamov/SpaceFace/issues —
  include the version line from the title screen (`SpaceFace v0.2.0-beta.1 · BETA`)
  and, if you can, the save slot or replay clip.
- **Feel/balance:** same tracker, tag it `feel`.
- The title-screen version line carries the build hash on hover for diagnostics.
