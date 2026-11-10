# src/ai/ agent notes

This library supplies the live tactical AI used by `src/systems/tacticalAI.js` and executed through
`src/systems/aiPorts.js`.

- `engagementAuthority.js` is the final hostility/fire authorization seam. Squad votes, perception,
  and target selection are advisory and may not bypass it.
- Lawful behavior uses canonical WANTED heat from `src/systems/heat.js`; do not revive compatibility
  fields or infer hostility from team mismatch alone.
- Enemy placement, motive, telegraph, response time, doctrine, formation, disengagement, and station
  jurisdiction are player-facing behavior—not interchangeable tuning constants.
- Preserve deterministic decisions and stable tie-breaking.
- A combat-AI change needs focused authority/doctrine tests plus a representative encounter/play
  route. Headless green checks alone do not prove fair or intelligible behavior.
