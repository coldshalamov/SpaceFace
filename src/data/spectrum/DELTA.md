# Spectrum delta — what the scanner already does

Read against `src/systems/scanner.js`, `src/ui/signalInvestigationPrompt.js`,
`src/data/researchGrants.js`, and `src/systems/world.js` before this folder existed.

## Already in the game

- Active scanner pulse (`scan:pulse` from `scanner._pulse`) with cooldown, range, and a player origin.
- Anomaly triangulation: `recordAnomalyBearing` accepts a bearing only after a 350 WU baseline and an 8° shift, holds the fix for 3 pulses (2 with a Triangulation Suite), and emits `anomaly:bearing` / `anomaly:triangulated`. The hidden position is not copied onto the in-progress row; `fixedPos` appears only when the scanner itself reveals.
- Signal investigation: `signal:scanResults` → prompt deck → `signal:track` or `signal:investigate` → `signal:tracked` / `signal:investigating` → close approach → `signal:investigated`. The prompt prints bearing `FIX n/m` or strength / range / pass.
- Research firsts pay 3 RP once per anomaly and once per signal. That payout stays on those two events.
- Clues, ghost contacts, wreck manifests, and planet returns are scanner-owned.

## Not in the game (this folder)

- A moving source. Scanner bearings assume the POI sits still, and a revealed anomaly publishes the true coordinates.
- Uncertainty that shrinks and can stay wrong. The scanner's fix is exact once the ping count is met.
- Motion tone. Nothing compares a return's chirp to the ship's own velocity.
- Occlusion and multipath. A rock does not delete or fold a return.
- A decoy or a jammer that fails a consistency check instead of a random roll.
- A countermeasure that moves a physical prop so the lie points somewhere else.
- Twelve authored signal situations with a physical payoff (brake alongside, tow a relay, block a line).

Spectrum listens to `scan:pulse` and reuses `recordAnomalyBearing` as the baseline gate. It does not emit `anomaly:triangulated` or `signal:investigated`, so it does not take the scanner's research payout or its course plot.
