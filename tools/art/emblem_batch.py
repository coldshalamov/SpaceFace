import os, subprocess, shutil, time
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
CODEX = shutil.which('codex') or 'codex'
STYLE = ("flat single-colour warm bone-white (#E8E2D4) linework on a fully TRANSPARENT background, fine precise engraved "
         "strokes of varied weight like a watchmaker's dial or an astronomical orrery plate, lots of negative space, "
         "centred, square 2048x2048, the design fills the square edge to edge as a perfect circle. No text, no letters, no numbers, "
         "no gradient, no shading, no 3D, no glow, no background fill.")
ITEMS = {
  'emblem_a': ("the emblem of SPACEFACE, a gritty space-frontier game about swinging asteroids on a tether line: a grand orrery "
               "dial — many concentric orbit rings with fine graduated tick scales, three small planets riding different rings, "
               "one heavy rock at the end of a long curved tether line sweeping around the centre, a sun disc with a crosshair at "
               "the exact centre, a thin outer ring of ninety-six ticks."),
  'emblem_b': ("the emblem of SPACEFACE, a gritty space-frontier game: an astronomical instrument plate — an armillary of "
               "concentric and slightly tilted elliptical orbits around a central star, graduated rings with major and minor ticks, "
               "a single long pointer arm from the centre to the outer rim like a clock hand, a small ship silhouette riding one "
               "orbit, delicate compass-rose rays behind the star."),
}
def run(item):
    fid, motif = item
    target = os.path.join(HERE, fid + '.png')
    if os.path.exists(target):
        return fid, 'exists'
    prompt = (f"Use your image generation tool to create ONE image: {motif} Style: {STYLE} "
              f"Save the PNG in the current directory as {fid}.png and reply with the path only.")
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
    for fid, status in ex.map(run, ITEMS.items()):
        print(time.strftime('%H:%M:%S'), fid, status, flush=True)
print('BATCH_DONE', flush=True)
