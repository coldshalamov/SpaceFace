// ADDENDUM ON THE BORDER CHECKPOINT — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_border_checkpoint_anomaly_verge_layers_admirers",
  "title": "ADDENDUM ON THE BORDER CHECKPOINT",
  "factionId": "faction_verge_layers",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "quiet_ghost",
      "factionId": "faction_verge_layers",
      "dx": 0,
      "dz": 0,
      "scanLabel": "VERGE 1"
    },
    {
      "role": "hull_1",
      "archetype": "quiet_ghost",
      "factionId": "faction_verge_layers",
      "dx": -150,
      "dz": 90,
      "scanLabel": "VERGE 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Record the return",
      "playerLine": "I will record one return and keep the transmitter closed."
    },
    {
      "id": "b",
      "label": "Compare the traces",
      "playerLine": "Put the first addendum trace beside the newest return."
    },
    {
      "id": "c",
      "label": "Leave it unread",
      "playerLine": "I will not answer. Leave the addendum signal alone."
    }
  ],
  "timeoutChoice": "c",
  "phases": [
    {
      "id": "spawn",
      "verb": "spawn",
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "VERGE: The addendum signal repeats from border checkpoint. Do not answer its second voice.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "orbit",
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The instrument needle returns to zero one beat too late.",
      "channel": "info",
      "next": "p0"
    },
    {
      "id": "p0",
      "verb": "motion",
      "seconds": 5,
      "motion": "orbit",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "VERGE keeps the receiver muted between each pass.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "orbit",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The addendum has a serial someone still loves.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 5,
      "motion": "orbit",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "border checkpoint does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "orbit",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 8,
      "motion": "orbit",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "VERGE: Holding. This does not hurry.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "orbit",
      "onChoice": {
        "a": "say_a",
        "b": "say_b",
        "c": "say_c"
      }
    },
    {
      "id": "say_a",
      "verb": "say",
      "line": "Return recorded. The second voice arrived on the old timestamp.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_border_checkpoint_anomaly_verge_layers_admirers",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_verge_layers",
      "delta": 2,
      "reason": "lived_border_checkpoint_anomaly_verge_layers_admirers",
      "next": "done_a"
    },
    {
      "id": "done_a",
      "verb": "resolve",
      "outcome": "a"
    },
    {
      "id": "say_b",
      "verb": "say",
      "line": "Traces aligned. VERGE found the same missing interval.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_verge_layers",
      "delta": 2,
      "reason": "lived_border_checkpoint_anomaly_verge_layers_admirers",
      "next": "done_b"
    },
    {
      "id": "done_b",
      "verb": "resolve",
      "outcome": "b"
    },
    {
      "id": "say_c",
      "verb": "say",
      "line": "You left it unread. The signal stayed at border checkpoint.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_verge_layers",
      "delta": -1,
      "reason": "lived_border_checkpoint_anomaly_verge_layers_admirers",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 464;
export const trigger = deepFreeze({
  "id": "lived_border_checkpoint_anomaly_verge_layers_admirers",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "border_checkpoint"
  ],
  "script": "selfRegistered",
  "fallbackScript": "whisper",
  "pressureCost": 6,
  "cooldownS": 900,
  "proximity": true,
  "rare": true,
  "gates": {
    "externalOnly": true
  }
});
export const runtime = compileVignette(spec);
export default defineEncounter(trigger, {
  "shape": {
    "situation": "anomaly",
    "place": "border_checkpoint",
    "twist": "admirers",
    "actor": "faction_verge_layers"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "ADDENDUM ON THE BORDER CHECKPOINT",
  "primaryLine": "VERGE: The addendum signal repeats from border checkpoint. Do not answer its second voice.",
  "factionId": "faction_verge_layers",
  "choices": [
    {
      "id": "a",
      "label": "Record the return",
      "playerLine": "I will record one return and keep the transmitter closed."
    },
    {
      "id": "b",
      "label": "Compare the traces",
      "playerLine": "Put the first addendum trace beside the newest return."
    },
    {
      "id": "c",
      "label": "Leave it unread",
      "playerLine": "I will not answer. Leave the addendum signal alone."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Return recorded. The second voice arrived on the old timestamp.",
    "b": "Traces aligned. VERGE found the same missing interval.",
    "c": "You left it unread. The signal stayed at border checkpoint."
  }
});
