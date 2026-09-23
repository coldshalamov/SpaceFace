import json, os, subprocess, sys, time, shutil
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
stations = json.load(open(os.path.join(HERE, 'stations.json')))
DETAIL = {
  'trade_hub': 'a central habitat ring with docking spokes, stacked cargo containers, small freighters queuing at floodlit docking bays',
  'military': 'armored hull plates, point-defense turrets, patrol craft on station, scanning arches over the approach lane, hard white floodlights mixed with the warm',
  'refinery': 'smelting towers glowing furnace-orange, ore conveyors, heat plumes venting into vacuum, captured asteroid fragments tethered alongside',
  'mining': 'a small rugged outpost bolted onto an asteroid, drilling rigs, ore hoppers, work lights, a mining barge docked',
  'fab': 'massive fabrication cranes around a skeletal dry dock holding a half-built ship hull, welding sparks, gantries',
  'blackmarket': 'a patched-together den of salvaged hulls and containers lashed together inside a debris field, dim red and amber lights, a few shady ships docked',
  'research': 'a delicate array of sensor dishes, observatory domes and long antenna booms, a few cold blue-white instrument lights among the warm, inside a glowing nebula',
}
PROMPT = ("Use your image generation tool to create ONE landscape image (1536x1024). Subject: cinematic concept-art "
  "establishing shot of {name}, a {kind} space station in the {sector} system of a gritty industrial frontier space game. "
  "Seen from a departing ship, three-quarter view, the station large in frame against deep black space with a faint dusty "
  "nebula. {detail}. Warm sodium-orange practical lights, cold starlight rim light, physically plausible hard-surface "
  "architecture: trusses, radiator fins, gantries. Muted palette of charcoal, bone and rust with warm amber light. No text, "
  "no logos, no UI, no people, no lens flare. Photographic, highly detailed. Save the PNG in the current directory as {id}.png "
  "and reply with the path only.")
KIND = {'trade_hub': 'trade hub', 'military': 'military checkpoint', 'refinery': 'ore refinery', 'mining': 'mining outpost',
        'fab': 'shipyard foundry', 'blackmarket': 'black-market', 'research': 'research'}
CODEX = shutil.which('codex') or shutil.which('codex.exe') or 'codex'
print('codex at', CODEX, flush=True)
def run(st):
    target = os.path.join(HERE, st['id'] + '.png')
    if os.path.exists(target):
        return st['id'], 'exists'
    prompt = PROMPT.format(name=st['name'], kind=KIND.get(st['type'], 'frontier'), sector=st['sector'],
                           detail=DETAIL.get(st['type'], DETAIL['trade_hub']), id=st['id'])
    for attempt in range(2):
        try:
            subprocess.run([CODEX, 'exec', '-m', 'gpt-5.5', '-c', 'model_reasoning_effort=low', '--skip-git-repo-check',
                            '-s', 'workspace-write', prompt], cwd=HERE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           timeout=600)
        except Exception as e:
            pass
        if os.path.exists(target):
            return st['id'], 'ok'
    return st['id'], 'FAILED'
with ThreadPoolExecutor(max_workers=4) as ex:
    for sid, status in ex.map(run, stations):
        print(time.strftime('%H:%M:%S'), sid, status, flush=True)
print('BATCH_DONE', flush=True)
