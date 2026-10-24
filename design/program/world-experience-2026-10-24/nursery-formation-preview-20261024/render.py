
import os,sys,json,subprocess,hashlib,io,base64,math
os.environ['PYTHONDONTWRITEBYTECODE']='1'

import argparse
from pathlib import Path
parser = argparse.ArgumentParser(description="Reproduce the measured Nursery source-model preview; no simulation is rerun.")
parser.add_argument("--repo", required=True, help="Existing SpaceFace source root with installed Three.js")
parser.add_argument("--poses", required=True, help="Measured pose evidence JSON")
parser.add_argument("--font", required=True, help="DejaVuSans.ttf path")
parser.add_argument("--bold-font", required=True, help="DejaVuSans-Bold.ttf path")
parser.add_argument("--output", required=True, help="JPEG output path")
args = parser.parse_args()
REPO = Path(args.repo).resolve()
HERE = Path(__file__).resolve().parent

# Verify the public visual/model sources rather than silently using a different mesh.
for relative, expected in {
    "src/render/veilRayNurseryVisuals.js": "75d84b1f6b13d8f42c32cf2ebb920fb9e2969cc3",
    "src/render/faunaVisuals.js": "5cf8dd8bbcef9364726928f44e4412d39be2193f",
    "src/data/alienEcology.js": "0ccbde6794a9a27a26bdae68bf83efa2fb0907de",
}.items():
    content = (REPO / relative).read_bytes()
    actual = hashlib.sha1(b"blob " + str(len(content)).encode() + b"\0" + content).hexdigest()
    if actual != expected:
        raise RuntimeError(f"Source identity mismatch: {relative}")

EXTRACT = (HERE / "extract.mjs").read_text()
POSES = json.loads(Path(args.poses).read_text())
ROWS = {}
for variant in ("baseline", "candidate"):
    ROWS[variant] = []
    for entity in POSES[variant]["entities"]:
        if entity["kind"] == "rib":
            data = {"veilNurseryRib": entity["ribIndex"]}
        else:
            data = {"strainId": entity["strainId"], "ecology": {
                "siteId": "veil_ray_nursery", "speciesId": entity["speciesId"],
                "nurseryMode": entity["nurseryMode"], "phase": entity["phase"],
                "aggregate": entity["kind"] == "aggregate",
                "visibleMembers": entity["visibleMembers"]}}
        ROWS[variant].append({"key": entity["key"], "x": entity["x"], "z": entity["z"], "rot": entity["rot"], "data": data})
    ROWS[variant].sort(key=lambda row: (0 if ":veil_ray:" in row["key"] else 1 if "juvenile-flock" in row["key"] else 2, row["key"]))

import numpy as np
from PIL import Image,ImageDraw,ImageFont
sys.path.insert(0, str(HERE))
import raster_core as rc
raw=subprocess.check_output(['node','--input-type=module','-e',EXTRACT],input=json.dumps(ROWS).encode(),cwd=str(REPO))
data=json.loads(raw)
for scene in data.values():
 for m in scene['meshes']:
  for key in ['v','n','ix']:m[key]=np.array(m[key])
BG=(12,20,28);WHITE=(232,239,244);MUTED=(157,178,194);TEAL=(104,224,206);GOLD=(243,190,106);LINE=(49,70,87)
im=Image.new('RGB',(1600,1180),BG);draw=ImageDraw.Draw(im);rc.im=im;rc.draw=draw;rc.line=LINE
FONT=args.font;BOLD=args.bold_font
def txt(x,y,s,size=20,col=WHITE,bold=False):
 draw.text((x,y),s,font=ImageFont.truetype(BOLD if bold else FONT,size),fill=col)
def dash(points,col=LINE,width=1):
 for j in range(len(points)-1):
  if j%3!=2:draw.line([points[j],points[j+1]],fill=col,width=width)
txt(32,23,'NURSERY / A shelter that is actually occupied',36,WHITE,True)
txt(32,78,'SOURCE-MODEL RECONSTRUCTION  |  Measured scene poses, not a live game-camera capture',19,TEAL,True)
txt(32,112,'Same seed 1, epoch 0 and 12.1-second quiet visit. Same procedural models, camera scale and neutral light.',19,MUTED)
for which,x,title,subtitle in [('baseline',32,'BEFORE / Adults drift beyond the shelter','Survey granted despite adults being far from the ribs.'),('candidate',816,'AFTER / Adults remain around the flock','Survey granted with the real bodies inside the habitat.')]:
 txt(x,160,title,25,WHITE,True);txt(x,200,subtitle,17,MUTED)
 rect=(x,240,752,500)
 proj,k=rc.render(rect,data[which]['meshes'],440,center=(-70,0,-65))
 dash([proj(60*math.cos(a),60*math.sin(a)) for a in np.linspace(0,math.pi*2,100)],LINE,1)
 cx,cy=proj(0,0);draw.line((cx-3,cy,cx+3,cy),fill=MUTED);draw.line((cx,cy-3,cx,cy+3),fill=MUTED)
 sx,sy=proj(-260,-157);draw.line((sx,sy,sx+50*k,sy),fill=MUTED,width=3);txt(sx,sy+10,'50 WU',13,MUTED)
 txt(x+16,254,'TOP VIEW / SAME WORLD SCALE',13,MUTED,True)
 txt(x+16,703,'Survey: yes   |   Quiet watch: 12.0 s',17,GOLD if which=='baseline' else TEAL,True)
 txt(x,755,'Adult distances: '+('195.5 / 152.3 / 227.1 WU' if which=='baseline' else '28.3 / 27.7 / 28.0 WU'),18,MUTED)
# Separate inset has explicitly independent camera and magnification.
rc.render((32,822,752,252),data['candidate']['meshes'],260,center=(-5,8,0),cam=(.25,1.5,1.6))
txt(32,795,'SEPARATE DETAIL CROP / AFTER / INDEPENDENTLY ENLARGED',13,TEAL,True)
txt(816,824,'What changed',25,WHITE,True)
txt(816,867,'Actual movement now forms the shelter.',20,WHITE)
txt(816,902,'Actual body geometry gates the 12-second survey.',20,WHITE)
txt(816,942,'Three adults, eight juvenile instances, seven mineral ribs.',17,MUTED)
txt(816,970,'Dashed circle: 60-WU rib centerline, not a protection boundary.',16,MUTED)
txt(816,998,'Rest articulation is frozen with reduced motion for comparison.',16,MUTED)
txt(816,1026,'No flown paths, invented poses or enlarged animals in the top views.',16,MUTED)
txt(32,1094,'Limits: controlled component graph; no live camera, textures, normal maps, PBR lighting or animation history.',18,TEAL)
txt(32,1124,'Actual procedural triangles + untextured source color factors. Technical preview, not final visual acceptance.',18,MUTED)
txt(32,1152,'24 Oct 2026  |  PR594 eee0a811  |  Snapshot time 12.1 s  |  Root Y=0, yaw=-rot, no entity-radius scaling',15,MUTED)
buf=io.BytesIO();im.save(buf,format='JPEG',quality=89,optimize=True);b=buf.getvalue()
provenance={'method':'Actual Three.js nursery builder triangles rendered by existing CPU raster helper','preview':'Source-model reconstruction, not live camera or final visual acceptance','sourceCommit':'eee0a811f56b9ea9d9de3b1b914fe3115e2f18e3','visualBlobs':{'nursery':'75d84b1f6b13d8f42c32cf2ebb920fb9e2969cc3','fauna':'5cf8dd8bbcef9364726928f44e4412d39be2193f','palette':'0ccbde6794a9a27a26bdae68bf83efa2fb0907de'},'poseEvidenceBlob':'0f11511305c71f90ef524c0c9af8b7f8f6f813f6','poseSource':'One authorized paired actual tickAlienEcology capture; seed1 epoch0 tick726 time12.1','sourceLimits':'Exact selected public-module overlay over read-only canonical remainder; not full public graph','articulation':'Actual updateAuthoredMotion callback, reducedMotion=true at12.1; intentionally frozen rest articulation; no render animation history claimed','transforms':'Site-relative X/Z,Y0,yaw=-rot; no entity-radius scaling','material':'Actual source untextured tissue fallback factors; no skin preload. Vertex colors retained. CPU ambient/diffuse approximation; no textures, normal maps, roughness, metalness, native lighting or PBR reproduction. Source emissive*intensity retained then helper approximate contribution0.36.','views':'Matched top camera span440 center[-70,0,-65]; separate independently enlarged oblique detail crop span260','rows':ROWS,'counts':{k:v['counts'] for k,v in data.items()},'image':{'filename':'nursery-formation-source-comparison-20261024.jpg','sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'width':1600,'height':1180}}
Path(args.output).write_bytes(b)
Path(str(args.output) + '.provenance.json').write_text(json.dumps(provenance, indent=2))
print(json.dumps(provenance['image']))
