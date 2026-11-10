import os, subprocess, shutil, time
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
CODEX = shutil.which('codex') or 'codex'
MOTIF = {
  'faction_scn': 'Solar Concord Navy, the lawful federation navy of the core worlds and jump-gate checkpoints: a stern eight-point star over a sun disc, framed by a chevron-cut octagonal outline, naval and orderly',
  'faction_mts': 'Meridian Trade Syndicate, a corporate trade syndicate of commodity exchanges and tolls: a circle bisected by a single meridian arc with fine tick marks and a small balance beam, corporate and precise',
  'faction_dmc': 'Drift Miners Collective, blue-collar asteroid miners: a stylised pickaxe crossed with an orbital ring with two small moons on the ring, sturdy and working-class',
  'faction_reach': 'Crimson Reach, pirates of the lawless ambush lanes: a hooked boarding claw breaking through a cracked ring, aggressive and jagged',
  'faction_quiet': 'The Quiet, smugglers of black markets and contraband routes: a hushed closed-eye sigil, a narrow vertical slit inside a circle with two short sealing bars, secretive and minimal',
  'faction_vael': 'The Vael, xenophobic aliens of the far rim with exotic technology: an asymmetric organic spiral thorn sigil, alien and unsettling, curved blades growing from a seed shape',
  'faction_free': 'Free Frontier, scattered independent waystations: an open compass rose whose outer ring is deliberately broken open on one side, hopeful and independent',
  'faction_choir': 'Ascendant Choir, armed religious zealots of relic shrines: a tall pointed triple arch like a cathedral window with a halo of short rays above it, severe and devotional',
  'faction_helix': 'Helix Directorate, a bureaucracy of contract allocation, audits and paperwork: a double helix drawn as an official stamp seal with ledger lines across it, clerical and cold',
  'faction_understory': 'The Understory, saprophyte scavengers of graveyard salvage and wreckage: a mushroom and mycelium network branching out of a broken hull fragment, organic and eerie',
  'faction_fulfillment': 'The Fulfillment, clinical automaton administrators of fixed shipping routes: a perfect square set inside a circle with a single check mark and segmented barcode notches, sterile and geometric',
  'faction_archive': 'The Archive, silent monastic archivists of the Severed Codex: an open book cut cleanly in two by a diagonal severing line, with a small key in the gutter, scholarly and austere',
  'faction_pitborn': 'The Pitborn, escaped scrappers of salvage yards and wreck fences: a patchwork gear ring stitched together from mismatched plates around a raised crowbar, defiant and scrappy',
  'faction_verge_layers': 'The Verge-Layers, a nacre-shelled precursor intelligence of the jump-gate network: concentric nacre layers forming a gate ring, with an inward-curling spiral like a question mark at its centre, ancient and alien',
}
STYLE = ("flat single-colour warm bone-white (#E8E2D4) emblem on a fully TRANSPARENT background, bold confident "
         "geometric shapes, heraldic yet industrial, clean negative space, must read clearly at 32 pixels, centred "
         "with a generous empty margin, square 1024x1024. No text, no letters, no gradient, no shading, no 3D, "
         "no outline box or frame around the whole image.")
def run(item):
    fid, motif = item
    target = os.path.join(HERE, fid + '.png')
    if os.path.exists(target):
        return fid, 'exists'
    prompt = (f"Use your image generation tool to create ONE image: a faction crest for a gritty industrial space-frontier "
              f"game. Faction: {motif}. Style: {STYLE} Save the PNG in the current directory as {fid}.png and reply with the path only.")
    for attempt in range(2):
        try:
            subprocess.run([CODEX, 'exec', '-m', 'gpt-5.5', '-c', 'model_reasoning_effort=low', '--skip-git-repo-check',
                            '-s', 'workspace-write', prompt], cwd=HERE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=1200)
        except Exception:
            pass
        if os.path.exists(target):
            return fid, 'ok'
    return fid, 'FAILED'
with ThreadPoolExecutor(max_workers=2) as ex:
    for fid, status in ex.map(run, MOTIF.items()):
        print(time.strftime('%H:%M:%S'), fid, status, flush=True)
print('BATCH_DONE', flush=True)
