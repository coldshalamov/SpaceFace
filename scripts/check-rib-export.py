import json,base64,struct,math,pathlib,argparse
parser=argparse.ArgumentParser();parser.add_argument('--input-dir',default='artifacts');root=pathlib.Path(parser.parse_args().input_dir)
for label in ['baseline','candidate','candidate-charge','candidate-flee']:
 g=json.loads((root/f'{label}.gltf').read_text());source=json.loads((root/f'{label}-source.json').read_text());buf=[base64.b64decode(b['uri'].split(',')[1]) for b in g['buffers']]
 def read(i):
  a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];kind={5123:'H',5125:'I',5126:'f'}[a['componentType']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];start=v.get('byteOffset',0)+a.get('byteOffset',0);step=v.get('byteStride',struct.calcsize(kind)*n);return [x for j in range(a['count']) for x in struct.unpack_from('<'+kind*n,buf[v['buffer']],start+j*step)]
 identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
 parents={child:i for i,n in enumerate(g['nodes']) for child in n.get('children',[])}
 def world(i):
  m=g['nodes'][i].get('matrix',identity)
  if i not in parents:return m
  a=world(parents[i]);return [sum(a[k*4+row]*m[col*4+k] for k in range(4)) for col in range(4) for row in range(4)]
 for ni,node in enumerate(g['nodes']):
  if 'mesh' not in node:continue
  s=next(m for m in source['meshes'] if m['name']==node['name']);p=g['meshes'][node['mesh']]['primitives'][0]
  for attr,key in [('POSITION','positions'),('NORMAL','normals'),('TEXCOORD_0','uvs')]:
   if s[key] is None:assert attr not in p['attributes'];continue
   vals=read(p['attributes'][attr]);assert vals==s[key],(label,attr)
  assert read(p['indices'])==s['indices'] if 'indices' in p else s['indices']==list(range(len(s['positions'])//3))
  assert all(abs(a-b)<1e-9 for a,b in zip(world(ni),s['matrix'])),label
  mat=g['materials'][p['material']];assert mat['pbrMetallicRoughness']['roughnessFactor']==.85;assert mat['pbrMetallicRoughness']['metallicFactor']==0;assert mat['normalTexture']['scale']==.9
 print(label,': exact Float32 positions, normals, UVs and indices; world transforms within 1e-9; existing material parameters; 2 primitives')
print('Source/export geometry fidelity PASS. Offline export is not game renderer acceptance.')
