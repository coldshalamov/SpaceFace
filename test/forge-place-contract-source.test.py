"""Pure selection tests plus actual exported socket/identity checks (no Blender needed)."""
import ast,json,struct,pathlib,unittest,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
src=(ROOT/'tools/blender/forge/forge_export.py').read_text()
f=next(n for n in ast.parse(src).body if isinstance(n,ast.FunctionDef) and n.name=='place_contract')
lookups=[]
donor={'sockets':[('SOCKET_Bridge',object(),{'semanticRole':'bridge_zone'})],'root':'DONOR_ROOT','meta':{'assetId':'DONOR'}}
def read(name,path,strict=False):
 lookups.append((name,path))
 if name=='missing':raise FileNotFoundError(name)
 return donor
ns={'live_place_contract':read};exec(compile(ast.Module(body=[f],type_ignores=[]),'forge_export.py','exec'),ns)
def glb(p):
 b=p.read_bytes();return json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
class Contract(unittest.TestCase):
 def test_absent_equivalence(self):
  self.assertIs(ns['place_contract']({'file':'old'},'parts',False),donor)
  self.assertEqual(ns['place_contract']({'file':'new'},'parts',True),{'sockets':[],'root':None,'meta':{}})
 def test_explicit_transfer_without_identity(self):
  got=ns['place_contract']({'file':'new','contract_source':'donor'},'parts',True)
  self.assertIs(got['sockets'],donor['sockets']);self.assertIsNone(got['root']);self.assertEqual(got['meta'],{})
 def test_reject_missing_invalid(self):
  with self.assertRaises(FileNotFoundError):ns['place_contract']({'contract_source':'missing'},'parts',True)
  for bad in ['', '../donor', '/tmp/donor', 42, 'donor.glb']:
   with self.assertRaises(ValueError):ns['place_contract']({'contract_source':bad},'parts',True)
 def test_invalid_glb_headers_fail_only_strict_donor(self):
  parse=next(n for n in ast.parse(src).body if isinstance(n,ast.FunctionDef) and n.name=='_read_glb_json')
  env={'struct':struct,'json':json};exec(compile(ast.Module(body=[parse],type_ignores=[]),'forge_export.py','exec'),env)
  payload=b'{"nodes": [], "scenes": []}';payload+=b' '*((-len(payload))%4)
  valid=struct.pack('<5I',0x46546c67,2,20+len(payload),len(payload),0x4e4f534a)+payload
  with tempfile.TemporaryDirectory() as temp:
   path=pathlib.Path(temp)/'donor.glb';path.write_bytes(valid)
   self.assertEqual(env['_read_glb_json'](path,strict=True),{'nodes':[],'scenes':[]})
   for offset,value in [(0,0),(4,1),(8,12),(12,len(payload)+100),(16,0)]:
    malformed=bytearray(valid);struct.pack_into('<I',malformed,offset,value);path.write_bytes(malformed)
    with self.assertRaises(ValueError):env['_read_glb_json'](path,strict=True)
   path.write_bytes(valid[:12])
   with self.assertRaises(ValueError):env['_read_glb_json'](path,strict=True)
 def test_exported_sockets_and_identity(self):
  base=glb(ROOT/'assets/ships/parts/places/place_conveyor_barge.glb');new=glb(ROOT/'assets/ships/parts/places/place_charon_colony_service_barge.glb')
  sockets=lambda d:{n['name']:n for n in d['nodes'] if n.get('name','').startswith('SOCKET_')}
  a,b=sockets(base),sockets(new)
  self.assertEqual(set(a),set(b))
  for name in a:
   self.assertEqual(a[name].get('extras'),b[name].get('extras'))
   for x,y in zip(a[name].get('translation',[0,0,0]),b[name].get('translation',[0,0,0])):self.assertAlmostEqual(x,y,places=5)
  self.assertEqual(new['scenes'][0]['extras']['spacefaceAsset']['assetId'],'SF_PLACE_CHARON_COLONY_SERVICE_BARGE')
  self.assertNotIn('SF_PLACE_CONVEYOR_BARGE_ROOT',[n.get('name') for n in new['nodes']])
unittest.main()
