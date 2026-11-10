"""The briefs behind the cast portrait set (assets/portraits/portrait_*.jpg, src/data/portraits.js).

Row 543 (build_map §34.8, 05 §6): portraits for the missing canon cast (Sula Dree, Callum Oakes,
Wex, Sump — the Witness stays terminal-register only, Elroy memory only, Vale never shown), the
eleven new faces of 03 §4.2, the three authored recurring contacts that still had no face
(Sallow, Ferrow — Kurtz stays unphotographed because he IS the Witness), and the Settlement Courier.

Each person is a specific face and life, a detail with a reason, and the capture device that made
the picture, per assets/concept/people/CANONICAL_PORTRAIT_DIRECTION.md. Two people per generated
sheet; SHEETS pairs them.

  python tools/art/cast_portrait_briefs.py <prompts-dir>   # writes cast_NN.txt prompt files
  python tools/art/cast_portrait_briefs.py record v1,v2,... assets/portraits/manifest.json
"""
import json, os, sys

STYLE = ("Photoreal, gritty hard-sci-fi frontier space-station realism in the exact look of the attached reference portraits: a real person, "
         "natural skin with pores and asymmetry, practical worn clothing, available light only, subtle sensor grain and the optical flaws of the capture device named. "
         "The face must be fully readable even when shrunk to 64 pixels. No text, no letters, no numbers, no logos, no helmets, no HUD frames, no neon rim lighting, "
         "no glamour retouching, nothing that looks like a stock-photo model or a space-opera costume.")
LAYOUT = ("Compose a 3:2 landscape canvas (1536 by 1024) holding TWO separate vertical portrait frames side by side, each exactly half the canvas wide and the full height, touching with no gap, no border and no frame lines. "
          "Each is a different person, chest-up, the whole head and face in the upper-middle of its frame with space above the hair, looking toward or just past the camera. LEFT frame: {a} RIGHT frame: {b} ")

# key -> specific face, life detail with a reason, and the capture device. Canon notes:
# - Sula Dree: Concord inspector, processed Wren's arrest nine years ago as a junior sweep;
#   honest office, Gate 3, the waived fine (NPCs-CANONICAL / CONTEMPORARY-HISTORY).
# - Callum Oakes: Meridian Exchange futures booth; clean clothes, good reputation, the crew
#   traitor Wren still looks for — a face you trust one moment too long.
# - Wex: ran Helios Bay 7 depot nineteen years; receipts, install-pending tags, smell tickets.
# - Sump: the Pit's sweeper, chalk dust pushed one side to the other; the fool, background B0–B7;
#   nobody waved back in eleven years.
# - Kurtz is deliberately absent: the Witness is shown only in the terminal register (05 §6).
PEOPLE = {
  'sula_dree': "a South Asian woman of about 48, a Concord inspector's pressed grey uniform with a gate-inspector's lanyard, hair pinned severely but softening at the temples, correct tired eyes that have read ten thousand manifests and still read them; captured by the Gate 3 customs lane's compliance scanner, clean institutional light, slight rolling-shutter skew.",
  'callum': "a white man of about 50, clean well-fitted Exchange-booth clothes with a broker's quiet collar pin, silver at the temples, warm credible eyes and a smile you would trust one moment too long — the face of a man who sells other people's secrets as futures; captured by the Meridian Exchange booth's own glass-front camera, a faint ticker reflection crossing one cheek.",
  'wex': "a man of about 61, thin and stooped, a depot keeper's worn thermal jacket with nineteen years of badge clips at the collar, a stylus worn smooth in his breast pocket, the patient harassed face of a man who files the tickets nobody else reads; captured by the Bay 7 depot cage-camera through wire mesh, flat fluorescent.",
  'sump': "an old man of about 74, chalk-pale skin the Pit never let tan, a dust-grey sweeper's coverall with a push-broom handle rising past one shoulder, intake-number tattoo faded at his wrist, a simple kind face mid-wave to a freighter that will not wave back; captured by a hangar-deck floodlight camera through chalk haze, high and wide.",
  'ma_sprocket': "a broad laughing woman of about 55, rust-and-gold Pitborn wraps hung with layered junk-jewellery — stamped claim tags, ballast charms, a necklace of bent rivets — a cracked loudspeaker mic held loose in one fist, the delighted authority of a woman who names wreckage after people; captured by a Cull broadcast drone camera, harsh arena light and crowd glare behind.",
  'clatter': "a lean Pitborn pilot of about 30, rust-and-gold flight leathers with painted tally numbers on one sleeve, a magnet-scored scar across the chin, junk rings on three fingers, the easy mean grin of a rival who already counted your hull; captured by an arena gate camera, crowd strobes kicking at the frame edge.",
  'moss_keeps_moss': "an elderly person of about 70, layered moss-dyed wraps in damp greens and browns, a grown breathing mask — lichen-textured, not made — resting at the collarbone, fine pale spores caught in silver hair, the slow plural calm of a garden elder who pays by the tonne; captured by a garden dome's condensation-beaded pane camera, soft green light.",
  'brother_index': "a man of about 52, Archive order robes with ink-darkened cuffs, a sealed-archive key on a chain at his chest, fingertips stained with reader's ink, the weighing stillness of a keeper who trades a secret for a secret; captured by a reading-room desk lamp camera, low tungsten, shelves dissolving behind.",
  'addendum_seroy': "a woman of about 45, Vael nacre-weave collar with script etched along the cuff edge, white gloves always on, one gloved hand holding a clause tablet, courteous implacable eyes; captured by a contract-desk document camera, cool white overhead light, slight gloss reflection on the nacre.",
  'cantor_lise': "a woman of about 55, Choir bronze ornaments at throat and wrist, a small bell charm on a cord, temples shaved and regrowing grey, the serene certainty of a shrine keeper mid-pause between hymn lines; captured by a shrine votive-lamp camera, warm flicker, incense haze.",
  'mael_ost': "a man of about 52, a Helix adjudicator's immaculate high-collared coat with a polished adjudication seal at the breast, hair precise, the cold correct eyes of an officer who calls a false flag lawful interdiction and means the invoice; captured by an audit hearing's evidence camera, flat grey institutional light.",
  'petra_lusk': "a woman of about 48, a Concord relief captain's regulation jacket, service pins squared away, hair in a no-nonsense cut, spine-straight tired posture and the honest direct stare of an officer who believes the file and will not ask twice; captured by her cutter's duty-log camera, cool bridge light.",
  'nine_finger_abe': "a man of about 58, Drift claim-boss hi-vis over a miner's thermal, a cord of claim tags at his belt, a broad weathered face missing nothing but the little finger of his left hand — which he holds up when he counts; captured by a claim-office window camera, dusty midday glare.",
  'tamsin': "a woman of about 30, a Free Frontier homesteader's patched work jacket with a hand-drawn family insignia on the shoulder, a homemade pilot badge, cargo straps still clipped, hopeful practical eyes that are still deciding whether to trust you; captured by a homestead hatch webcam, one side lit by a grow lamp.",
  'clerk_0003': "a person of about 35 in a white Fulfillment routing clerk's uniform with a routing headset still on, a blank-patient service face that has said 'your order has always been important to us' so many times it is almost true again; captured by the routing desk's customer-facing camera, flat even white light, slightly overexposed.",
  'sallow': "a person of about 50 in a plain undyed jacket, no insignia, hair the colour of nothing, a face professionally easy to forget — the Quiet's contract broker, whose only ornament is a payout stylus held like a pen; captured through the scratched glass of a mercenary-booth window camera, low neutral light.",
  'ferrow': "a man of about 45, a Drift writ clerk's vest over a hi-vis mining shirt, a bounty-tag stamp ring on one finger, knuckles ink-scarred from filing, the bored precision of a man who knows which distress calls nobody will pay on; captured by the bounty-board scanner camera, cool terminal light.",
  'next_run_courier': "a tired express courier of about 40, a sealed packet under one arm, a nondescript pressure-suit liner under a road-worn jacket, the calm flat face of someone who has already read your answer and is only waiting for you to say it; captured by a dockside parcel-window camera, flat light through reinforced glass.",
}

# Two faces per generated sheet (LEFT, RIGHT) — pairs chosen so a failed frame never strands a
# same-culture neighbour for comparison.
SHEETS = [
  ('cast_01', 'sula_dree', 'callum'),
  ('cast_02', 'wex', 'sump'),
  ('cast_03', 'ma_sprocket', 'clatter'),
  ('cast_04', 'moss_keeps_moss', 'brother_index'),
  ('cast_05', 'addendum_seroy', 'cantor_lise'),
  ('cast_06', 'mael_ost', 'petra_lusk'),
  ('cast_07', 'nine_finger_abe', 'tamsin'),
  ('cast_08', 'clerk_0003', 'sallow'),
  ('cast_09', 'ferrow', 'next_run_courier'),
]

# Registry key -> shipped file (assets/portraits/). Keys match canonicalKey in barContacts /
# portraits.js — `next_run_courier` is the endgame Choice-E courier's existing canonicalKey.
FILES = {
  'sula_dree': 'portrait_sula_dree.jpg',
  'callum': 'portrait_callum.jpg',
  'wex': 'portrait_wex.jpg',
  'sump': 'portrait_sump.jpg',
  'ma_sprocket': 'portrait_ma_sprocket.jpg',
  'clatter': 'portrait_clatter.jpg',
  'moss_keeps_moss': 'portrait_moss_keeps_moss.jpg',
  'brother_index': 'portrait_brother_index.jpg',
  'addendum_seroy': 'portrait_addendum_seroy.jpg',
  'cantor_lise': 'portrait_cantor_lise.jpg',
  'mael_ost': 'portrait_mael_ost.jpg',
  'petra_lusk': 'portrait_petra_lusk.jpg',
  'nine_finger_abe': 'portrait_nine_finger_abe.jpg',
  'tamsin': 'portrait_tamsin.jpg',
  'clerk_0003': 'portrait_clerk_0003.jpg',
  'sallow': 'portrait_sallow.jpg',
  'ferrow': 'portrait_ferrow.jpg',
  'next_run_courier': 'portrait_next_run_courier.jpg',
}


def write_prompts(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    names = []
    for sheet, left_key, right_key in SHEETS:
        name = f'portrait_{sheet}'
        with open(os.path.join(out_dir, name + '.txt'), 'w', encoding='utf-8') as fh:
            fh.write(LAYOUT.format(a=PEOPLE[left_key], b=PEOPLE[right_key]) + STYLE)
        names.append(name)
    return names


def record(chosen, manifest_path='assets/portraits/manifest.json'):
    """Write provenance for the cut cast faces: `chosen` lists the variant (v1..v3) taken per sheet,
    in SHEETS order; each person's entry records its own sheet frame and variant."""
    with open(manifest_path, encoding='utf-8') as fh:
        manifest = json.load(fh)
    for sheet, left_key, right_key in SHEETS:
        for side, key in (('left', left_key), ('right', right_key)):
            manifest['files'][FILES[key]] = {
                'subject': PEOPLE[key],
                'sheet': f'portrait_{sheet} ({side} frame)',
                'chosen': chosen[sheet],
            }
    manifest['files'] = dict(sorted(manifest['files'].items()))
    with open(manifest_path, 'w', encoding='utf-8', newline='') as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
        fh.write('\n')


if __name__ == '__main__':
    if sys.argv[1] == 'record':
        # record <manifest> <sheet=vN, sheet=vN, ...>
        record(dict(pair.split('=') for pair in sys.argv[3].split(',')), sys.argv[2])
    else:
        print(' '.join(write_prompts(sys.argv[1])))
