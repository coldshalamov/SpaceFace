<!-- LIFETIME: DURABLE -->
# 48 — BOUNTY & LAW: being wanted, and wanting

`lawSecurity.js`, `bountyHunt.js`, `bountyHunters.js` exist. Both sides of the badge get a
career-shaped loop under I-7's rules.

## Being wanted (the lifecycle, I-7 compliant)

Witnessed crime → **fine notice** (pay at any station, gone) → ignore it → **local hostile**
status (that faction's patrols, that region) → keep running it up → **bounty posted** and
hunter NPCs (bountyHunters.js) start appearing *in that region* → leave the region, lay low,
pay restitution, or kill a hunter (worse). Deliberate major crimes (station destruction,
convoy massacres) are the only *persistent* stains, per I-7.

- Wanted play is a *mode*: stations deny dock (dockDeny exists), black markets welcome you,
  prices invert. It should be fun-bad, not unplayable-bad.

## Being the hunter (the career)

- Board contracts → intel (last-seen, known fit, known gimmick from 16) → track via rumors
  and patrol chatter → the fight.
- **Capture beats kill**: disable (EMP/RCS) → tether → tow to a station. Pays ~1.5×, uses
  the whole physics kit, and the tow home past other pirates is the mission.
- Hunter rank unlocks: kill/capture license tiers, better intel, hunter transponder (some
  pirates just run — a free chase).

## Acceptance

- Full wanted lifecycle route including decay and restitution. Capture-tow route against a
  mid ace with an interception attempt mid-tow.
