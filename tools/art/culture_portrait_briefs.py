"""The briefs behind the culture portrait pools (assets/portraits/cultures/, src/data/localPortraits.js).

Row 543 (build_map §34.8, 05 §6, 03 §2): eight culture pools of eight faces each, so local contacts
look like they belong to their station. A culture is a people, not a faction — the pools key off the
station's people (STATION_CULTURE in localPortraits.js), and like the role pools each face is one
specific invented person: a life, a justified detail, and the capture device that made the picture.

  python tools/art/culture_portrait_briefs.py <culture> <prompts-dir>   # writes portrait_<culture>_NN.txt
  python tools/art/culture_portrait_briefs.py record <culture> v1,v2,v3,v4,v5,v6,v7,v8 <manifest>
"""
import json, os, sys

STYLE = ("Photoreal, gritty hard-sci-fi frontier space-station realism in the exact look of the attached reference portraits: a real person, "
         "natural skin with pores and asymmetry, practical worn clothing, available light only, subtle sensor grain and the optical flaws of the capture device named. "
         "The face must be fully readable even when shrunk to 64 pixels. No text, no letters, no numbers, no logos, no helmets, no HUD frames, no neon rim lighting, "
         "no glamour retouching, nothing that looks like a stock-photo model or a space-opera costume.")
LAYOUT = ("Compose a 3:2 landscape canvas (1536 by 1024) holding TWO separate vertical portrait frames side by side, each exactly half the canvas wide and the full height, touching with no gap, no border and no frame lines. "
          "Each is a different person, chest-up, the whole head and face in the upper-middle of its frame with space above the hair, looking toward or just past the camera. LEFT frame: {a} RIGHT frame: {b} ")

# 03 §2 Peoples of the Reach — the look column made into eight specific citizens per culture.
PEOPLE = {
 # Core-born — Helios and Dione citizens: pressed uniforms, ID lanyards, good teeth, tired eyes.
 'coreborn': [
  "a woman of about 50, a pressed Concord clerk's uniform, an ID lanyard with a frayed edge, good teeth in a tired professional smile; captured by a lobby directory camera, flat clean light.",
  "a man of about 38, a customs inspector's pressed collar, a stylus behind one ear, polite bored eyes; captured by an inspection-lane camera, cool white.",
  "a man of about 64, a senior registrar's waistcoat over a uniform shirt, thin spectacles, a careful comb-over, unhurried patience; captured by a records-office document camera.",
  "a woman of about 27, a junior licensing clerk, hairnet, a badge still too new to be scratched, eager tired eyes; captured by a service-window camera, bright even light.",
  "a nonbinary person of about 45, a hearing officer's robe over a uniform shirt, a thermos in hand, patient procedural fatigue; captured by a tribunal webcam, slightly soft focus.",
  "a man of about 55, a port-operations jacket with a row of stamped badge pins, a safety-office smile that has given the same talk all year; captured by a gate-status board camera.",
  "a woman of about 33, a dental-perfect polite smile, a lanyard doubled under a grey cardigan, a billing desk lamp behind her; captured by a payment kiosk camera, slightly oversharpened.",
  "a man of about 41, a deputy harbormaster's sash over a thermal shirt, tired affable eyes; captured by a berth-assignment camera, low angle.",
 ],
 # Beltborn — Drift miners and their families: hi-vis, burn scars, missing fingers, tool belts.
 'beltborn': [
  "a woman of about 48, a hi-vis mining vest over thermals, a cord of old claim tags at her collar, a scar through one eyebrow; captured by a claim-stake camera, dusty flat light.",
  "a man of about 55, a tool belt over coveralls, the last two fingers of his right hand gone to an old pinch accident, ore dust ground into the creases of his knuckles; captured by a tug-cab camera.",
  "a woman of about 31, reflective stripe tape on her coveralls, lamp-burn freckles, a rock-hammer lanyard, a wry squint; captured by a face-sampling window camera.",
  "a man of about 42, a barge jacket with hi-vis gone grey at the cuffs, a chipped-tooth grin; captured by a hopper-scale camera, slight motion blur.",
  "a nonbinary person of about 36, a drill-rig crew thermal, respirator tan-lines along the jaw, calm measuring eyes; captured by a rig intercom camera.",
  "a woman of about 69, a knuckle-bridge prosthetic on her left hand from a conveyor years ago, survey pins in her collar, kind assessing eyes; captured by an assay-office camera.",
  "a man of about 29, a new hi-vis barely scuffed, a family claim pin, eager tired eyes of a first-season claim hand; captured by a shift-muster camera.",
  "a woman of about 60, a burned sleeve patched with foil tape, a melt-scar running collar to ear, an unhurried senior hand's stillness; captured by a furnace-deck camera.",
 ],
 # The Released — first-generation Pit survivors: chalk-pale, flinch at bright rooms, prison
 # tattoos kept as intake numbers; couriers, weighers, welders, sweepers.
 'released': [
  "a man of about 58, chalk-pale skin that never tans, an intake number tattooed at his wrist visible as he holds a weighing slip, a flinching half-smile; captured by a weigh-station camera, flat grey light.",
  "a woman of about 63, pale, an intake number kept loyally uncovered on her inner forearm, a welder's scorched leathers; captured by a yard gate camera.",
  "a man of about 47, pale under courier grime, a weatherproof wrap over shoulders that still carry a prisoner's posture; captured by a courier-desk camera.",
  "a woman of about 52, chalk-pale, shaded lenses pushed up on her forehead — eyes that water in bright rooms; captured by a tunnel-lamp camera, dim warm light.",
  "a man of about 70, the oldest survivor in the room, a sweeping brush over one shoulder, patient weightless calm; captured by a bay-deck dome camera, high and hazy.",
  "a woman of about 44, pale, an intake number at the collarbone above a patched work shirt, a steady dry stare; captured by a supply-window camera.",
  "a nonbinary person of about 39, pale, a sweeps-team sash over grey work clothes, caught mid-word in a soft careful voice; captured by a corridor camera.",
  "a man of about 55, pale, a welder's arc-tan mask line across his forehead, knuckles cross-hatched with small old burns; captured by a fab-shop CCTV camera, greenish.",
 ],
 # Pitborn — the Pit's second generation: rust and gold, string lights, layered junk-jewellery, loud.
 'pitborn': [
  "a woman of about 35, rust-and-gold wraps, a necklace of stamped claim tags, caught mid-laugh at the crowd; captured by a Cull arena crowd camera, warm glare.",
  "a man of about 28, gold-painted knuckles, a magnet-foil streak combed through his hair, the grin of someone who talks first; captured by a pit-yard floodlight camera.",
  "a woman of about 52, layered junk-jewellery — rivet rings, a ballast charm — over rust coveralls, a yard boss's appraising eye; captured by a yard-office camera.",
  "a man of about 44, a loud patterned shirt under gold-piped leathers, a scorecard tucked behind his ear; captured by a betting-window camera.",
  "a nonbinary person of about 24, a string-light earring, rust-streaked cheeks, mouth open mid-chant; captured by a crowd drone camera, strobes at the edge.",
  "a woman of about 67, a rust-and-gold headwrap, a salvaged circuit broach, an auntie's weighing eye; captured by a gate-camp camera, low sun glare.",
  "a man of about 38, a scrapyard thermal with painted numbers on the sleeve, junk rings on every finger; captured by a crane-cab camera.",
  "a woman of about 41, a gold-stitched ball cap, a mouthful of laughter, tally marks chalked on her sleeve; captured by a scoreboard camera, warm haze.",
 ],
 # Vael contract-folk — the Veil's people: nacre fabrics, gloves always on, script-etched cuffs.
 'vael': [
  "a woman of about 46, a nacre-weave collar, pale gloves, script etched along the cuff edge, measured courteous eyes; captured by a contract-desk camera, cool white.",
  "a man of about 53, a mother-of-pearl sheen coat, gloves with reinforced palms, a clause-stamp ring; captured by a notary camera, flat light.",
  "a woman of about 29, a soft nacre scarf, glove cuffs clipped with a stylus, a precise sympathetic tilt of the head; captured by a courier-drop camera.",
  "a man of about 61, heavy nacre robes, etched script at throat and cuff, patient dangerous calm; captured by a review-panel camera.",
  "a nonbinary person of about 37, white gloves, a nacre bib tabard, cool attentive stillness; captured by a mediation-booth camera.",
  "a woman of about 70, a silver-threaded nacre shawl, gloves worn thin at the fingertips, a kind negotiated smile; captured by an archive-reader camera, warm low light.",
  "a man of about 34, a hazard-crew collar open over a nacre underlayer, gloves taped at the wrist; captured by an airlock camera, slight condensation on the lens.",
  "a woman of about 40, a script-etched headband, a notary's hand-lamp in frame, a weighing look; captured by a clause-review camera.",
 ],
 # Homesteaders — Free Frontier families: patched work clothes, homemade insignia, hope that owes.
 'homesteader': [
  "a man of about 45, a patched work jacket with a child's hand-drawn patch on the shoulder, tired hope; captured by a homestead hatch camera, warm dim light.",
  "a woman of about 38, layered patched thermals, a knitted cap in the homestead's colors, a practical smile; captured by a family-cabin camera.",
  "a young man of about 19, a too-big hand-me-down work coat, a homemade pilot badge, bright stubborn eyes; captured by an airlock camera.",
  "a woman of about 56, a patched apron over thermals, a locket held shut with tape, guarded warmth; captured by a galley camera, steam at the edge.",
  "a man of about 52, a homestead guard's sash of woven cord over a patched jacket, a homemade insignia pin; captured by a watch-post camera.",
  "a nonbinary person of about 33, a quilted vest sewn from old enviro-liner, paint-stained fingers; captured by a nursery-dome camera, soft grow-light.",
  "a woman of about 29, a runner's light jacket with cargo straps, a hand-stitched route patch, quick warm eyes; captured by a mail-slot camera.",
  "a man of about 73, a patriarch's patched coat, a tin wedding band on a cord, a face of weathered patience; captured by a porch camera, dusk light.",
 ],
 # Choir faithful — relic pilgrims and zealots: bronze ornaments, bell charms, shaved temples.
 'choir': [
  "a woman of about 50, a bronze bell charm on a cord, temples shaved, serene certainty; captured by a shrine threshold camera, warm flicker.",
  "a man of about 37, a pilgrim's patched robe with a stitched bronze hem, a small hand-bell at his belt, lit eyes; captured by a toll-gate camera.",
  "a woman of about 63, bronze ornaments at throat and wrist, temples regrown grey, the low steady face of someone mid-pause in a chant; captured by a votive alcove camera.",
  "a man of about 26, a zealot's close shave, a cracked bell pendant, a fervent unblinking stare; captured by a procession-route camera.",
  "a nonbinary person of about 44, bell charms braided at the wrist, a bronze-ink line along one temple, quiet joy; captured by a pilgrim-hostel camera.",
  "a woman of about 58, a shrine keeper's layered bronze cords, one hand resting on a hand-bell, kind immovable calm; captured by a shrine-lamp camera.",
  "a man of about 71, an old pilgrim with bronze buttons, caught mid-hymn, eyes somewhere further than the room; captured by a cloister camera, thin light.",
  "a woman of about 33, a pilgrim staff at the frame edge, a bronze charm at her brow, exalted tired joy; captured by a toll-lane camera.",
 ],
 # Understory — the gardeners: moss-dyed wraps, breathing masks grown not made, spores in the hair.
 'understory': [
  "a woman of about 48, layered moss-dyed wraps in damp greens, a grown breathing mask — lichen-textured, not made — pushed up off her face, spore-dust in grey curls; captured by a garden-dome camera, soft green light.",
  "a man of about 55, a green-brown draped work wrap, a living mask resting at his collarbone, compost-stained hands; captured by a mulch-line camera.",
  "a woman of about 26, a moss-green hood, fine spore freckles across her cheeks, the slow plural way of standing that gardeners have; captured by a spore-nursery camera.",
  "a nonbinary person of about 72, moss-dyed shroud layers, a grown mask like lichen at the throat, meditative eyes; captured by a compost-vault camera, very low light.",
  "a man of about 34, a wrap cinched with corded root-fibre, a sapling sprig tucked behind one ear, quiet attention; captured by a seed-vault camera.",
  "a woman of about 61, an elder's layered moss-dye, a mask of woven tendrils resting at her shoulder, dust motes in the frame; captured by a bloom-garden camera.",
  "a man of about 40, a tending-knife lanyard, spores caught in his beard, an undertaker's gentle manner; captured by a burial-grove camera.",
  "a woman of about 30, a young gardener, a moss-dye bandana, pollen on her lashes, unhurried friendliness; captured by an irrigation-line camera.",
 ],
}


def write_prompts(culture, out_dir):
    people = PEOPLE[culture]
    os.makedirs(out_dir, exist_ok=True)
    names = []
    for i in range(0, len(people), 2):
        name = f'portrait_{culture}_{i // 2 + 1:02d}'
        with open(os.path.join(out_dir, name + '.txt'), 'w', encoding='utf-8') as fh:
            fh.write(LAYOUT.format(a=people[i], b=people[i + 1]) + STYLE)
        names.append(name)
    return names


def record(culture, chosen, manifest_path='assets/portraits/cultures/manifest.json'):
    """Write provenance for a culture's cut faces: `chosen` lists the variant (v1..v3) taken for
    each person, in brief order."""
    people = PEOPLE[culture]
    with open(manifest_path, encoding='utf-8') as fh:
        manifest = json.load(fh)
    for i, brief in enumerate(people):
        name = f'{culture}_{i + 1:02d}.jpg'
        manifest['files'][name] = {
            'subject': brief,
            'sheet': f'portrait_{culture}_{i // 2 + 1:02d} ({"left" if i % 2 == 0 else "right"} frame)',
            'chosen': f'{chosen[i]} of 3',
        }
    manifest['files'] = dict(sorted(manifest['files'].items()))
    with open(manifest_path, 'w', encoding='utf-8', newline='') as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
        fh.write('\n')


if __name__ == '__main__':
    if sys.argv[1] == 'record':
        record(sys.argv[2], sys.argv[3].split(','), sys.argv[4] if len(sys.argv) > 4 else 'assets/portraits/cultures/manifest.json')
    else:
        print(' '.join(write_prompts(sys.argv[1], sys.argv[2])))
