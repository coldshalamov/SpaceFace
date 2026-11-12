# Foundry: learn the Anchor after the second exit

Exact integration parent: PR #942 `1b50c6ddce0272658720872b66f120cfdc3e3209`.

## Player experience

Round 20 already offers the second exit. Players who continue meet a three-round act, not a new mode or reward loop:

* 21, Split the chase: the familiar Quiet Ghost opens from NW. Six seconds of active play later a Bruiser enters from SE. The player must cross one committed approach rather than retreat into the other. Ordinary ships/Brood follow after16 seconds.
* 22, Read the anchor: the canonical first Anchor Controller enters alone as soon as the pilot acts. The existing specialist owns snare windup, armed hold and recovery; displacement can interrupt it. Fourteen active seconds separate this threat from the crowd. Its shared field owner also affects Brood; no new force or damage rule is introduced.
* 23, Uncover the anchor: a Warden and Controller enter on the same bearing. The player can break the screen or flank while respecting the snare, then meet the crowd after18 active seconds.

The implementation reuses existing `foregroundShips` scheduling and canonical22 debut in `survivalWavePlanner.js`; `survivalWave.js` and `swarmBrood.js` retain all spawn, attack, finite debt, clear and reward ownership. `swarmRoundPreview` reads the new score in the existing armory route. No extra enemies, inventory or model work is created.

## Deliberate direction and preservation

Rounds21–23 use quiet loose-plate rooms to keep these combined threats readable. That intentionally replaces their previous environment/event selection. Existing scenery is still owned by the arena; this is not a claim that a whole route is obstacle-free. Roster clocks, quotas and concurrency are unchanged.

An initial24 extension was rejected during review:24 already owns a mass-gap physical challenge. It remains untouched.25's boss and26–28's Mooring Line act are untouched. Other arenas, mutators and circuits do not opt into this score.

## Files

- `src/data/swarmFoundryScore.js`: three rows and their existing-schema foreground composition.
- `test/swarm-foundry-anchor-act.test.mjs`: planner/preview, roster, delayed admissions, idle and out-of-flight clocks, finite initial pending budget and no false clear.
- `test/swarm-foundry-post-foreman.test.mjs`: only the intentional end-of-score assertion moves from21 to24.

Temporary loader pins all nonoverlay project modules to the exact parent, rather than testing against stale shared checkout source. Source edits exist only in isolated files; shared checkout is untouched.

## Evidence and limits

Focused seven tests pass against the exact parent overlay. Combined result is in `combined.log`; includes existing post-Foreman, specialist ownership/interrupt and native field trajectory tests. New tests use real ship/Brood owners but a spawn adapter, not a rendered combat playthrough. Existing specialist tests verify counter behavior separately. No fresh screenshot, full run clear, controller route, complete Save/Continue or balance acceptance is claimed. This is an implementation candidate, not publication or integration acceptance.
