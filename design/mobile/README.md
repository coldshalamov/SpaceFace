# Mobile flight controls

- Touch empty flight space: floating joystick. Direction steers the nose through normal yaw limits.
- Small displacement: analog fine thrust. Full ring: full thrust. Dashed outer ring: deliberate held boost.
- Fast straight flick and release: brief existing boost request. Slow/curved drags do not flick-boost.
- Release to coast. Hold centered for 260 ms of simulation time to brake.
- GUN: hold; drag that thumb for independent aim.
- TETHER: tap latch/cut; hold and slide up/down for dedicated reel-in/pay-out while the other thumb flies.
- POWERS: inward right-edge swipe, arc selection, release to request. Neutral center/outside cancels.
- Tap POWERS for a pinned accessible wheel, then pick Ordnance, Fieldwork, Flight or Navigation.
- Pause stays at the upper right. The only main bottom buttons are TETHER and GUN.

Four banks, six choices each; existing gameplay systems decide whether a request can execute.
The desktop key map, physics, inventory costs, boost limits and Massline grammar are not replaced.

Run `node --test test/mobile-flight.test.mjs`. See [AGENT_TASKS.md](AGENT_TASKS.md) for
integration details, verification boundaries and six follow-on work packages. The control-lab/browser
screenshots shipped with the accompanying ZIP are not screenshots of the complete game.
