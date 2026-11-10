"""Render the uploaded production modules entirely in memory; no network or browser-policy changes."""
from pathlib import Path
import re,json,base64,mimetypes
ROOT=Path(__file__).resolve().parents[1]
missing=set();modules={}
def asset_uri(path):
 if not path.is_file(): missing.add(str(path.relative_to(ROOT)));return ''
 mime=mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
 if path.suffix=='.js':mime='text/javascript'
 return 'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode()
def resolve(path,base):
 return (ROOT/path.lstrip('/') if path.startswith('/') else base.parent/path).resolve()
def css_inline(path):
 s=path.read_text()
 s=re.sub(r'@import\s+["\']([^"\']+)["\'];',lambda m:css_inline(resolve(m[1],path)),s)
 # Missing vendored fonts are omitted only in the transport, leaving the same production fallbacks.
 def ff(m):
  urls=re.findall(r'url\(["\']?([^\)"\']+)',m[0])
  if any(not resolve(u,path).is_file() for u in urls):
   for u in urls:
    if not resolve(u,path).is_file():missing.add(str(resolve(u,path).relative_to(ROOT)))
   return '/* font missing from input bundle; production fallback used */'
  return m[0]
 s=re.sub(r'@font-face\s*\{[^}]*\}',ff,s)
 def url(m):
  u=m[1].strip('"\' ')
  if u.startswith('data:') or u.startswith('#'):return m[0]
  return 'url("'+asset_uri(resolve(u,path))+'")'
 return re.sub(r'url\(([^)]+)\)',url,s)
def visit(path):
 key='/'+str(path.relative_to(ROOT))
 if key in modules:return key
 if not path.is_file():raise FileNotFoundError(path)
 s=path.read_text();modules[key]=''
 def dep(m):
  target=resolve(m[2],path);other=visit(target)
  return m[1]+json.dumps('sf:'+other)+m[3]
 s=re.sub(r'(\bfrom\s+)["\']([./][^"\']+)["\']()',dep,s)
 s=re.sub(r'(\bimport\s*\(\s*)["\']([./][^"\']+)["\'](\s*\))',dep,s)
 s=re.sub(r'new URL\(\s*["\']([^"\']+)["\'],\s*import\.meta\.url\s*\)\.href',lambda m:json.dumps(asset_uri(resolve(m[1],path))),s)
 modules[key]=s
 return key

def build(screen='title',edge=''):
 global modules;modules={}
 html=(ROOT/'test/fixtures/orbital-interface.html').read_text()
 html=re.sub(r'<link[^>]*href="([^"]+)"[^>]*>',lambda m:'<style>'+css_inline(resolve(m[1],ROOT/'test/fixtures/orbital-interface.html'))+'</style>',html)
 html=re.sub(r'<script type="module" src="[^"]+"></script>','',html)
 entry=visit(ROOT/'test/fixtures/orbital-interface.js')
 data=json.dumps(modules).replace('</script','<\\/script')
 # A native ESM graph via in-memory Blob URLs, preserving imports/module scopes rather than mocking them.
 loader='''<script>
window.ORBITAL_FIXTURE_QUERY = %s;
const sources = %s;
const imports={};for(const [name,text] of Object.entries(sources)){imports['sf:'+name]=URL.createObjectURL(new Blob([text],{type:'text/javascript'}));}
const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.appendChild(map);
import(%s).catch(e=>{window.OFFLINE_ERROR=e.stack;document.body.insertAdjacentHTML('afterbegin','<pre>MODULE ERROR: '+e.message+'</pre>');});
</script>'''%(json.dumps('?screen='+screen+'&edge='+edge),data,json.dumps('sf:'+entry))
 return html.replace('</body>',loader+'</body>')
if __name__ == '__main__':
 import sys
 html=build(*(sys.argv[1:3]))
 print(json.dumps({'method':'native ES modules via in-memory Blob/import map; original CSS and assets; no navigation-policy modifications', 'entry':'test/fixtures/orbital-interface.html', 'moduleCount':len(modules), 'modules':list(modules), 'missingAssets':sorted(missing)},indent=2))
 # Do not write a standalone HTML: it would unnecessarily duplicate licensed font binaries.
