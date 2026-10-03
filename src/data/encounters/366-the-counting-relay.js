// 366 — THE COUNTING RELAY. A strange signal (the vision's texture list) played as a
// three-hop physical chase: a lonely automated ledger buoy from a lost convoy is still out
// here counting ships that never came. Each hop is a real body in the world you find by
// flying the bearing it names; the chain ends at the convoy's mail hulk with a real salvage
// pool and one honest choice — take the dead their mail, or leave the count unbroken.
//
// No new system: the whole chain rides the director's own spawnProp / spawnWreck /
// offerChoices machinery, exactly like the love-letter buoy and the anomaly whisper.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 366;
export const trigger = deepFreeze({
  id: 'counting_relay',
  tier: 'ambient',
  deck: 'civilian',
  weight: 0.7,
  zoneTypes: ['anomaly_deep', 'nebula_fog', 'derelict_field', 'radiation_field'],
  pressureCost: 5,
  cooldownS: 14400,
  proximity: false,
  gates: {},
});

const CHAIN_WINDOW_S = 480;      // the whole chase; flight time across two hops, not a timer trap
const HOP_2_DIST = [640, 980];   // seeded second bearing — a real flight, not a stroll
const CACHE_DIST = [420, 700];   // the mail hulk sits closer: you are inside its history now

function seededOffset(d, live, [lo, hi], salt) {
  const stream = d.stream(live, salt);
  const ang = stream() * Math.PI * 2;
  const dist = lo + stream() * (hi - lo);
  return { x: live.anchor.x + Math.cos(ang) * dist, z: live.anchor.z + Math.sin(ang) * dist };
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + CHAIN_WINDOW_S;
    live.data.relay = { hop: 0 };

    d.spawnProp(live, {
      pos: seededOffset(d, live, [90, 220], 'hop1'),
      radius: 5,
      scanLabel: 'Faint repeater — unregistered cycle',
      storyPropKind: 'counting_relay_1',
    });
    live.phase = 'offer';
    d.say(live, 'alert',
      'COMMS INTERCEPT: …a repeating triple-pulse on no registered band. It is not a beacon. Beacons ask. This one counts.',
      null, { literal: true, primary: true });
    d.offerChoices(live, ['listen', 'ignore'], 'ignore', live.deadlineAt);
  },

  choose(d, live, state, choiceId) {
    const w = live.data.relay || (live.data.relay = { hop: 0 });

    if (choiceId === 'listen') {
      w.hop += 1;
      if (w.hop === 1) {
        // Hop two: the pulse answers itself from a second point, farther out.
        d.spawnProp(live, {
          pos: seededOffset(d, live, HOP_2_DIST, 'hop2'),
          radius: 5,
          scanLabel: 'Repeater echo — closer to something',
          storyPropKind: 'counting_relay_2',
        });
        d.say(live, 'info',
          'RELAY: "…forty-one. Forty-two." The pulse is a count. The second carrier is louder — same voice, farther out. It has been repeating for years.',
          null, { literal: true });
        live.offerConsumed = false;
        d.offerChoices(live, ['listen', 'ignore'], 'ignore', live.deadlineAt);
        return;
      }
      if (w.hop === 2) {
        // The count breaks: the source is the convoy's mail hulk, and its pool is real.
        const pos = seededOffset(d, live, CACHE_DIST, 'cache');
        d.spawnWreck(live, {
          pos,
          scanLabel: 'Convoy mail hulk — "LEDGER-9"',
          pool: { cmdty_salvage_electronics: 3, cmdty_consumer_goods: 2 },
          storyPropKind: 'counting_relay_cache',
        });
        d.say(live, 'info',
          'RELAY: "…forty-three." Then, for the first time in years, the count stops. "Hello? The mail is still aboard. Somebody should have it."',
          null, { literal: true });
        live.offerConsumed = false;
        d.offerChoices(live, ['take_the_mail', 'leave_it', 'ignore'], 'ignore', live.deadlineAt);
        return;
      }
      return;
    }

    if (choiceId === 'take_the_mail') {
      // The dead convoy's mail, as real pods on your rope — the physical payoff.
      const qty = 3 + Math.round(d.stream(live, 'mail')() * 2);
      d.spawnCargoPod(live, {
        commodityId: 'cmdty_salvage_electronics',
        amount: qty,
        pos: { x: live.anchor.x + 40, z: live.anchor.z - 20 },
        vel: { x: 6, z: -4 },
      });
      d.grant(140, 'counting_relay:mail');
      d.emit('graffiti:show', {
        line: 'IT COUNTED US. WE CAME BACK.', where: 'hull', author: 'the forty-third',
      });
      d.say(live, 'bark',
        'RELAY: "Forty-three." The count closes like a book. Somewhere a machine stops waiting.',
        null, { literal: true });
      return d.resolve(live, 'mail_taken', { speak: true });
    }

    if (choiceId === 'leave_it') {
      d.emit('graffiti:show', {
        line: 'STILL COUNTING. LET IT.', where: 'hull', author: 'unknown',
      });
      d.say(live, 'bark',
        'You leave the dead their mail. Behind you, faint and patient: "…forty-three. Forty-four."',
        null, { literal: true });
      return d.resolve(live, 'left_with_the_count', { speak: true });
    }

    if (choiceId === 'ignore') {
      return d.resolve(live, 'ignored', { speak: false });
    }
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    if (now >= live.deadlineAt) {
      // The chain fades unanswered. Whatever already spawned stays in the world — the
      // buoys keep counting whether anyone listens or not.
      return d.resolve(live, 'ignored', { speak: false });
    }
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'anomaly',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'none',
  },
  motive: 'curiosity',
  engagementTrigger: null,
  factionId: null,
  context: 'ambient',
  title: 'THE COUNTING RELAY',
  primaryLine: 'COMMS INTERCEPT: a repeating triple-pulse on no registered band. It is not a beacon. Beacons ask. This one counts.',
  choices: [
    { id: 'listen', label: 'Listen to the cycle', playerLine: 'Say the number again.' },
    { id: 'take_the_mail', label: 'Take the convoy mail', playerLine: 'Forty-three came back.' },
    { id: 'leave_it', label: 'Leave the count unbroken', playerLine: 'It waited this long. It can wait.' },
    { id: 'ignore', label: 'Ignore the signal', playerLine: 'Not every voice is an invitation.' },
  ],
  timeoutChoice: 'ignore',
  receipts: {
    mail_taken: 'THE MAIL IS DELIVERED — you flew a dead convoy\'s cargo out by hand, and the machine that counted forty-three ships finally stopped counting.',
    left_with_the_count: 'THE COUNT CONTINUES — you left the convoy its mail. The relay is still out there, saying the numbers to nobody.',
    ignored: 'THE SIGNAL FADED — the triple-pulse counted its way back into the dark. Whatever it wanted, it wanted it quietly.',
  },
});
