"""The briefs behind the station-local portrait pool (assets/portraits/locals/, src/data/localPortraits.js).

Each person is a specific face and life, a detail with a reason, and the capture device that made the picture, per
assets/concept/people/CANONICAL_PORTRAIT_DIRECTION.md. Two people per generated sheet; 8 per role.

  python tools/art/local_portrait_briefs.py <role> <prompts-dir>     # writes portrait_<role>_01..04.txt
"""
import os, sys

STYLE = ("Photoreal, gritty hard-sci-fi frontier space-station realism in the exact look of the attached reference portraits: a real person, "
         "natural skin with pores and asymmetry, practical worn clothing, available light only, subtle sensor grain and the optical flaws of the capture device named. "
         "The face must be fully readable even when shrunk to 64 pixels. No text, no letters, no numbers, no logos, no helmets, no HUD frames, no neon rim lighting, "
         "no glamour retouching, nothing that looks like a stock-photo model or a space-opera costume.")
LAYOUT = ("Compose a 3:2 landscape canvas (1536 by 1024) holding TWO separate vertical portrait frames side by side, each exactly half the canvas wide and the full height, touching with no gap, no border and no frame lines. "
          "Each is a different person, chest-up, the whole head and face in the upper-middle of its frame with space above the hair, looking toward or just past the camera. LEFT frame: {a} RIGHT frame: {b} ")

PEOPLE = {
 'barkeep': [
  "a woman of about 58, broad-shouldered, a silver-streaked braid, an old pale steam-tap burn scar across her left forearm from decades behind the taps, a worn canvas apron over a thermal shirt, one hand polishing a steel cup; captured by the bar's own cheap overhead security camera, slightly wide-angle, warm tungsten.",
  "a man of about 44, South Asian, round face, close beard with early grey, rolled sleeves, a bar towel on his shoulder and a bent stylus behind his ear; captured on the cracked glass of a tip-jar payment terminal camera, low angle, cool screen light.",
  "a man of about 66, very dark skin, white close-cropped hair, thick-framed old reading lenses on a cord, a patched cardigan over a work shirt, kind tired eyes; captured by a dusty ceiling dome camera above the back shelf, flat greenish fluorescent light.",
  "a woman of about 36, East Asian, a sharp bob with one dyed-orange streak, a rubber glove on one hand, a laminated drinks list pinned to her apron, wary amused expression; captured by the bar's tablet-menu front camera, slightly oversharpened.",
  "a man of about 52, white, bald with a heavy brow, a prosthetic left hand of dull steel holding a glass, a faded work-crew jacket, deliberate calm; captured by the till's receipt-printer camera, grainy and warm.",
  "a nonbinary person of about 30, brown skin, short curly hair, small silver nose stud, a stained apron with a faded embroidered cooperative badge, dry unimpressed look; captured through the smeared glass of a cold-room window, blue-white light.",
  "a woman of about 71, Latina, deep laugh lines, long white hair under a faded headscarf, flour-dusted forearms from baking, a ladle in hand, shrewd eyes; captured by a steamed-up galley hatch camera, soft orange glow.",
  "a man of about 39, Black, tight fade, a neat moustache, a clean pressed bar shirt with the sleeves cuffed, a bar rag over one shoulder, professional guarded smile; captured by a mirrored back-bar reflection, low warm light and amber bottles behind.",
  "a Black woman of about 49, short silver twists, a clean white shirt with sleeve garters, a bar spoon tucked behind one ear, quiet authority; captured by a shelf inventory camera above the bottles, tilted down, cool light.",
  "a thin white man of about 33, a wispy beard, a loud hand-knit sweater under the apron, a lozenge tin of cough drops in his pocket from his years in the shafts; captured by a customer's raised tablet, handheld and slightly blurred, warm tungsten.",
  "an East Asian man of about 61, a pressed vest, reading glasses on a cord, the tip of his left index finger missing from his years as a ship's cook; captured by a galley pass-through camera, steam at one edge.",
  "a South Asian woman of about 45, dark hair in a high bun, burn-scarred knuckles from a kitchen's hot pans, a white chef's cloth tucked into her apron, steady amused eyes; captured by a kitchen-hood camera, bright and slightly overexposed.",
  "a Latina woman of about 27, a small nose ring, one side of her head shaved, an apron with a hand-drawn marker doodle on the bib, a tired friendliness of someone working off a debt; captured by the till's customer-facing camera.",
  "a Middle Eastern man of about 56, a grey moustache, a crisp apron, a brass tea tray in his hands, formal and kind; captured by a tea-service counter camera, warm light and steam.",
  "a Pacific Islander woman of about 63, silver hair in a long braid wrapped in cloth, a big warm laugh caught mid-breath; captured by a lamp-mounted dome camera above the bar, wide and high.",
  "a white nonbinary person of about 37, a shaved head, a small ship's registry number tattooed behind one ear from their years of crew service, a bar towel over a shoulder, leaning on the bar; captured by a doorway counter camera at an angle.",
 ],
 'merchant': [
  "a Black woman of about 47, close-cropped grey-flecked hair, reading lenses pushed up on her head, a pressed waistcoat over a work shirt, a brass pocket scale on a chain, the look of someone who weighs everything; captured by a market stall's customer-facing price camera, slightly wide, cool white light.",
  "a thin white man of about 62, a white moustache, a threadbare good coat with a repaired cuff, a ledger tablet cracked at one corner held to his chest, courteous and tired; captured by an overhead courier-desk document camera.",
  "a South Asian woman of about 34, a neat braid, a lanyard with a blank tag, a quick wary smile, a rack of sample vials beside her; captured through the glass front of a sample case, with reflections across it.",
  "a heavy-set East Asian man of about 55, rolled shirtsleeves, ink-stained fingertips, a customs seal-stamp ring on one finger, patient eyes; captured by a bonded-warehouse gate camera under greenish sodium light.",
  "a Latina woman of about 68, a silver bob, a heavy turquoise ring, a shawl over a quilted vest, a coin purse in her hand, a sharp amused look; captured by a market-lane security dome, high angle, warm light.",
  "a Middle Eastern man of about 29, stubble, a second-hand good jacket with mismatched cuffs, a brittle hopeful confidence, a handheld price scanner raised; captured by the scanner's own front camera with a harsh flash.",
  "a nonbinary white person of about 41, an undercut gone grey at the sides, a tool roll under one arm and a crate label stuck to a sleeve, a freight broker's headset around the neck; captured by a comms-booth webcam with compression artifacts.",
  "a tall Pacific Islander man of about 50, greying curls, a hand-knitted cap, a cooperative's cloth armband, a barrel-chested honest grocer's smile; captured by the weigh-slip camera above a hanging scale.",
 ],
 'pilot': [
  "a Black woman of about 38, shaved sides, a flight jacket with a missing patch (a rectangle of unpicked stitching on the chest), flight gloves tucked in her belt, calm; captured by a hangar-lane tower camera with a long lens.",
  "a freckled white man of about 26, the left side of his face sunburned from cockpit glare, a headset around his neck, a cocky half-smile; captured by a cockpit dash camera at a slight upward angle.",
  "an East Asian woman of about 52, a streak of silver in her hair, reading glasses on a cord, a pilot's paper logbook, calm veteran eyes; captured by a docking-clamp inspection camera.",
  "a South Asian man of about 45, a trimmed beard, dark circles, a rumpled thermal flight suit, a foil coffee pouch in his hand; captured by an overnight-shift security camera, greenish.",
  "a Latina woman of about 31, curly hair under a cap with a hand-stitched emblem, a scar through one eyebrow from a cracked canopy, a lopsided grin; captured by a tablet selfie camera with slight wide-angle distortion.",
  "a Black man of about 58, a white goatee, wire-framed lenses, an old analog wristwatch, a patient expression; captured through an airlock window by a camera behind thick glass.",
  "a white woman of about 24, bleached cropped hair, a grease smudge on her cheek, a jacket two sizes too big borrowed from someone else, alert eyes; captured by a cheap comms-puck camera.",
  "a Middle Eastern man of about 40, tidy hair, a short scar along the jaw from a seat-belt buckle, a calm professional look; captured by a cargo-bay overhead camera.",
 ],
 'smuggler': [
  "a white man of about 48, ginger-grey stubble, a good coat re-lined with hidden pockets whose stitching shows, a shrewd friendly face; captured by a dock inspection scanner with slightly blown highlights.",
  "a Southeast Asian woman of about 33, a long braid wrapped around her neck, a courier's wooden token on a cord, a calm unreadable smile; captured by a customs-gate camera.",
  "a Black man of about 60, a silver afro, a pressed old waistcoat and cufflinks, the manner of a retired ship's purser; captured by a lobby camera in flat ceiling light.",
  "a white woman of about 42, a hooded scarf, nervous eyes, a cracked wristband; captured through a scratched booth window by a camera behind it.",
  "a lanky East Asian man of about 27, a hoodie with taped seams, a wide grin that does not reach his eyes; captured by a motion-triggered porch camera with a washed-out infrared tint.",
  "a Latina woman of about 55, glossy dyed black hair, many rings, a dockside fence's warm appraising stare; captured by a shop-front camera from behind a metal grille.",
  "a South Asian man of about 38, a tidy beard, a baggage handler's vest stuffed with spare seals, tired and careful; captured by a baggage-scanner station camera.",
  "a brown-skinned nonbinary person of about 35, a shaved head with a thin pale scar line across it, a cargo-pocket vest, a flat measuring look; captured by a vending-kiosk camera.",
 ],
 'engineer': [
  "a white woman of about 44, a healed welding burn at the side of her neck, her hair in a bandana, welding goggles pushed up on her forehead; captured by a workshop safety camera with spark bloom at one edge.",
  "a Black man of about 57, a greying beard, a loupe on a forehead band, fine tools in a chest pocket, absorbed patience; captured by a bench-microscope camera, close and shallow.",
  "a South Asian woman of about 29, coveralls with knee patches, a headlamp on her forehead, a coil of cable over one shoulder; captured by a maintenance-shaft inspection camera.",
  "a bald East Asian man of about 63, thick glasses, a bandaged thumb, a chipped mug in his hand, dry humour; captured by a control-room overhead camera.",
  "a Latina woman of about 51, salt-and-pepper short hair, a respirator hanging at her neck, a faded crew-number tattoo on her forearm from her apprenticeship; captured by a gantry camera.",
  "a red-bearded white man of about 34, soot on the beard, a burn-scarred left hand from a coolant leak held up, a wince of a smile; captured by a reactor-bay door camera.",
  "a brown-skinned nonbinary person of about 40, long hair in a thick plait tucked in the collar, ear defenders around the neck; captured through the window of an engine test cell.",
  "a Middle Eastern woman of about 66, a headscarf tucked under a hard hat, steady unhurried eyes, a torque wrench in hand; captured by a tool-crib counter camera.",
 ],
 'bounty_hunter': [
  "a lean white man of about 43, close-cropped hair, scarred knuckles, a plain jacket under an armoured vest, a writ tablet in one hand; captured by a station security-booth camera under harsh overhead light.",
  "a Black woman of about 36, locs tied back, the top of one ear notched off, calm eyes, leather bracers; captured by a bounty-board scanner camera.",
  "a weathered East Asian man of about 52, a dust-coloured long coat with a worn collar, a quiet unreadable face; captured as a reflection in a bar mirror, low light.",
  "a South Asian woman of about 29, braids pinned in a crown, a plain fighter's jacket, a healing bruise on one cheekbone, direct stare; captured by a customs-gate camera.",
  "a Latino man of about 61, an iron-grey beard, an eyepatch over an eye lost in a decompression, a toothpick in the corner of his mouth; captured as a grainy re-photographed frame from an old security monitor.",
  "a white woman of about 47, a severe bun, thin forensic gloves, an evidence pouch on her belt, an appraising look; captured by an evidence-table camera.",
  "a heavy-set brown-skinned man of about 33, a respectful nod, a tablet showing a column of faces held low; captured by the dashboard camera of a pursuit ship.",
  "an East Asian nonbinary person of about 39, shaved sides, a red cord bracelet, a bulky wrist computer, a patient tracker's stillness; captured from a drone's slightly wide view above.",
 ],
 'miner': [
  "a heavy-set ginger-bearded white man of about 38, round freckled face, a split lip healing, a cheerful squint, ochre-stained coveralls and a dented lunch pail in one hand; captured by a mess-hall wall camera, warm tungsten, slightly wide.",
  "a Black woman of about 40, hair under a mesh cap, scraped knuckles, a dented thermos in her hand, a tired grin; captured by a shift-board timeclock camera.",
  "a South Asian man of about 28, stubble, young but weary eyes, a sample bag on his shoulder, dust on his coveralls; captured by a claim-marker camera.",
  "an East Asian woman of about 58, grey braids, a small rock sample on a cord around her neck, deep sun-lines at the eyes from lamp light; captured by a drill-rig cab camera.",
  "a Latino man of about 35, a thick moustache, ochre-stained coveralls, a rock hammer over his shoulder; captured by a hopper-conveyor camera.",
  "a freckled white nonbinary person of about 32, a shaved head, freckles under grime, goggles pushed up on the forehead; captured by a tripod work-light camera, one side blown out.",
  "a slight elderly Latino man of about 72, bald with white stubble, large ears, a small hearing aid, a faded cloth cap in his hand, a kind watchful squint, a rock sample in a breast pocket; captured by a shaft-cage lift camera, flat greenish light.",
  "a Middle Eastern woman of about 45, a strong brow, a dusty scarf pulled down off the face, a stripe of reflective tape on one shoulder; captured through the windshield of a rover by its dash camera.",
 ],
}


def write_prompts(role, out_dir):
    people = PEOPLE[role]
    os.makedirs(out_dir, exist_ok=True)
    names = []
    for i in range(0, len(people), 2):
        name = f'portrait_{role}_{i // 2 + 1:02d}'
        with open(os.path.join(out_dir, name + '.txt'), 'w', encoding='utf-8') as fh:
            fh.write(LAYOUT.format(a=people[i], b=people[i + 1]) + STYLE)
        names.append(name)
    return names


def record(role, chosen, manifest_path='assets/portraits/locals/manifest.json'):
    """Write provenance for a role's cut faces: `chosen` lists the variant (v1..v3) taken for each person, in brief order."""
    import json
    people = PEOPLE[role]
    with open(manifest_path, encoding='utf-8') as fh:
        manifest = json.load(fh)
    for i, brief in enumerate(people):
        name = f'{role}_{i + 1:02d}.jpg'
        manifest['files'][name] = {
            'subject': brief,
            'sheet': f'portrait_{role}_{i // 2 + 1:02d} ({"left" if i % 2 == 0 else "right"} frame)',
            'chosen': f'{chosen[i]} of 3',
        }
    manifest['files'] = dict(sorted(manifest['files'].items()))
    with open(manifest_path, 'w', encoding='utf-8', newline='') as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
        fh.write('\n')


if __name__ == '__main__':
    if sys.argv[1] == 'record':
        record(sys.argv[2], sys.argv[3].split(','))
    else:
        print(' '.join(write_prompts(sys.argv[1], sys.argv[2])))
