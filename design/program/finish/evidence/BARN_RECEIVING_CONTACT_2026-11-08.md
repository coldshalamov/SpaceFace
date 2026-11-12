# E-21 receiving: making the first homestead assembly leg readable

## Route and experience

After Book 3's Foreman, Book 4 offers three doors. This increment follows the Free branch's actual Helios board contract, **Barn Raising — homestead frame**, into Io Reach. It does not choose a branch for the player or change the Traders/Patrol alternatives.

The existing Frontier owner plants or adopts a frame and six distinct modules. Its real snap rule is simpler than the mission brief's suggestion of matching spatial slots: an eligible module's **center within 130 WU of the frame** is sufficient; the owner then assigns its kind a ring position. No stationary, release or tether requirement is imposed by that snap test. The new scene displays that actual receiving boundary rather than inventing another interaction.

A nonphysical, nonpersistent receiving ring uses existing beacon/circuit-mark presentation. Its scan label reports committed seated count and missing module kinds, so repeated visits and a lost piece remain understandable. A nearby undocked pilot hears the **E-21 weld crew** explain staging before the first snap, the actual window and the solid frame inside the ring. After the first committed seat, the crew acknowledges the seated count, reads the current remaining clock, names missing pieces and distinguishes the separate gate audit clock. There is no invented named NPC, reward or cargo transfer.

The resulting player action is to bring distinct physical modules into a readable receiving area, see their existing snaps change the count and learn what the crew needs next. The original owner still snaps modules, starts/retries the window, restocks lost pieces, welds the homestead and issues the completion receipt. This helper does none of those actions.

## Implementation and boundaries

- `src/systems/faction_frontier.js`: three additive lines, importing the helper, calling it after authoritative raising, and permitting survival-mode cleanup before the existing early return.
- `src/missions/barnReceivingContact.js`: validates the actual active mission/attempt, sector, frame identity/generation and site. Counts only live canonical module IDs/generations, kind, frame bond and owner slot. A forged snap event cannot produce feedback.
- The marker is `physicsBody:false`, untetherable and not persistent. Mode/sector/end/frame-identity changes remove it; movement of the frame replaces its old-position marker. It changes no authored module poses, hulls, masses or inventories.
- One-shot contact memory lives in the existing serialized Frontier attempt. A malformed primitive/array memory is repaired. Docked or distant pilots do not consume narration.
- Receiving range is not collision clearance. The crew explicitly warns about the physical frame. No safe approach lane is claimed.

Review caught a real state/copy edge: zero seated modules does not mean the clock never started. If the first seated piece is destroyed before the player's first nearby visit, the owner retains its deadline. Arrival now reads that finite deadline even at 0/6. A regression performs the actual snap, destroys its module, advances ten seconds and checks the first local arrival says **0/6, 230 seconds remaining**, not a fresh-window promise. Window duration is read from the owner's data rather than hardcoded in the initial instruction.

## Verification

```sh
node --test test/barn-receiving-contact.test.mjs test/frontier-barn-mission.test.mjs test/faction-frontier-expansion.test.mjs test/w534-books-3-4.test.mjs
```

**49/49 pass**, including six new tests. Log: `/tmp/barn-contact-combined.log`.

New coverage accepts the actual Book 4 Free branch board offer after recording its prior branch-intro fact, then executes the real Frontier owner. It verifies the ring, no premature clock, local contact, 131 WU rejection versus 130 WU committed snap, truthful 240-second feedback, missing-kind list, forged-event resistance, duplicate suppression, docking/distance gating, frame-generation rejection, mode/sector/completion cleanup, zero display-generated payment, actual Frontier serializer/deserialize boundary and the lost-first-module clock edge.

The new snap-boundary test deliberately positions its module fixture. It is not an ordinary input tow or rendered journey. Existing neighboring `frontier-barn-mission` native-physics pushing and economy-once tests also pass, but their fixture forces do not become a new manual-navigation claim. The complete Book 3→branch choice→Io approach, native player tow into this new guide, rendered readability, full Save/Continue and simultaneous-combat acceptance remain unverified. Existing owners and their full mission behavior remain covered by the named neighboring tests, not replaced by the helper tests.

## Continuity

Fresh fetched remote basis: `39887a0186bea79eed4c8648fa34a4eb6c4e461e`. Source baseline `/tmp/faction_frontier.before-barn-contact.js`, SHA-256 `286efb13155ff671e423cd2f0125010be70f1b03fe3fce97aacb42ba3c679b29`. Exact scope is the two source files above, `test/barn-receiving-contact.test.mjs`, and this report. Other dirty candidates and held mission files are unchanged. Backups must record shared mission/save/Frontier-data dependencies; this candidate is not a standalone clean-remote build.

SF-GAME / SF-LIVING-WORLD remain open: next acceptance is an ordinary input module tow with the guide visible, then a loss/retry/return and completed homestead visit. SF-WORLD-DIRECTION / SF-SECTOR-COHERENCE remain ongoing across all three Book 4 branches. Implemented and tested locally; not published, merged, deployed or user-accepted. No new screenshot or render is claimed.
