# EC-G20 — The Rig — one loadout screen for both doors

**Direct execution commission · Shared system**
**Commissioned by the lead designer, 2026-11-10.** Content: [11 — The Armory](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/11_THE_ARMORY.md). Components: EC-G16. Ladder: EC-G19.
**Replaces:** the Shipworks fitting and refit screens (`src/ui/commandDeckRefit.js` and the Ship Sheet), the Swarm draft and hangar screens, and the in-flight hold panel. One screen, three places it opens.

## Why

Swarm and Adventure customise the same ship with two unrelated interfaces, and the Adventure one shows engineering numbers. A player who learns one has learned nothing about the other. The owner's direction: the upgrade interface is the same in both, so the game makes sense as one game.

## The screen

**Your ship is the screen.** Large, centre, top-down, drawn from the real model with the real parts on it. You customise it by touching it.

```
┌──────────────────────────────────────────────────────────────────────┐
│  HITCH · "name you gave it"                 LINE CLASS III ▸ can hold: │
│                                             pod · fighter · ROCK · ░░░ │
│  MODS            ┌───────────────────┐                                 │
│  ◉ Overbore      │                   │      ┌─ tray (opens on a slot) ┐│
│  ◉ Long Reel     │    ◇ gun   ◇ gun  │      │ [picture]  THUMP        ││
│  ○ empty         │        ▲          │      │ Concussion Cannon       ││
│  ○ empty         │    your ship      │      │ Rate ▮▯▯▯  Punch ▮▮▯▯   ││
│                  │        ●  line    │      │ Reach ▮▮▯▯ Kick ▮▮▮▮    ││
│  HOLD            │                   │      │ "One slug. One fighter  ││
│  12 ore · 340 cr └───────────────────┘      │  leaving sideways."     ││
│  worth 1,180     1 Pull  2 Shove  3 Pin     │ ▶ TRY IT   [ FIT ]      ││
│  at Tethys       4 Bomb  5 Rig              └─────────────────────────┘│
│                  (each shows its bend)       THIS BUILD: The Quarry    │
└──────────────────────────────────────────────────────────────────────┘
```

- **Five things to choose, each where it physically is:** guns on their mounts, the Line at the nose, the five powers along the bottom on their keys, mods as canisters down the left, the ship itself by its name.
- **Touch a slot and a tray opens** with what could go there, as cards. A card is a picture, a family, **four bars — Rate, Punch, Reach, Kick** — and one sentence in plain words. No percentages. Hold one key for the numbers if you want them.
- **TRY IT** plays a five-second loop of that exact thing hitting a standard fighter and a standard rock. This is the most important button on the screen: you see what it does before you buy it.
- **Changing a part changes the ship** in front of you, at once.
- **The Line strip** shows your class as a row of silhouettes — pod, fighter, rock, hauler, and on up — lit to where you are and greyed beyond. That row is the ladder.
- **The hold** is on this screen: what you carry, how much, and what it is worth where you are going.
- **When your five choices make one of the ten builds, the screen says its name.**

## The three places it opens

| Where | What you can do |
|---|---|
| **Swarm** — the Bench every tenth round, and any time paused | change anything you have picked up this run; the draft offer is three of these same cards |
| **Adventure, docked** | fit anything you own; buy what the town sells; see what you have *seen* and where to get it |
| **In flight, either door** | look, do not touch. One key, instant, the game does not pause in Swarm |

Same layout, same cards, same words in all three.

## How to build this and check your own work

1. **On the Kit Page first** (EC-G16): the card, the tray, the bars, the Line strip — with the longest gun name, an empty slot, a full hold and a ship with nine mounts.
2. **One slot end to end** before the rest: guns, with TRY IT working.
3. **Shoot it at three sizes** (`node scripts/ui-bench.mjs --shot=<id> --walk`) and open the pictures. Small laptop is the one that matters.
4. **Then wire Swarm's draft to the same cards**, then retire the old screens one at a time.
5. **Stranger test:** a new player, given this screen and no words from you, changes one gun and says what will be different. A player who has only played Swarm opens it in Adventure and is not lost.

**Ways this gets faked.**
- *A new skin on the old stat table.* If it has a percentage in it, it is the old screen.
- *TRY IT as a canned video.* It runs the real thing.
- *Two screens that look alike.* It is one screen.
- *A ship picture that does not change when the parts do.*

## Finish line

- The old fitting, draft and hangar screens are gone.
- Every item in 11 appears as a card with four bars, a sentence and a working TRY IT.
- Controller and keyboard both reach everything.
- Nothing on it is cut off or overlapping at any of the three sizes.

## Explicitly reject

Rarity colours. A separate "stats" tab as the default view. Tooltips that restate the name. A comparison table. Anything that needs a tutorial.
