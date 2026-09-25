"""Mount the real local lab ES-module graph into a blank Chromium page.

A deterministic offline test fixture, not a VFX renderer. Only module import specifiers are
rewritten; production source, shaders, state adapter, and lab geometry run unchanged.
No browser policies or system settings are changed. Use the ordinary HTTP lab for gameplay
integration, asset/network checks, or a full-game acceptance run.
"""
from pathlib import Path
import re, json
ROOT=Path(__file__).resolve().parents[2]
PAT=re.compile(r"\b(?:from\s*|import\s*\(\s*|import\s*)(['\"])([^'\"\n]+)\1")
def collect():
    modules={}
    def resolve(ref,base):
        if ref=='three':return ROOT/'vendor/three.module.js'
        if ref.startswith('three/addons/'):return ROOT/'vendor/addons'/ref[len('three/addons/'):]
        if ref=='three.quarks':return ROOT/'node_modules/three.quarks/dist/three.quarks.esm.js'
        if ref=='quarks.core':return ROOT/'node_modules/quarks.core/dist/quarks.core.esm.js'
        if ref.startswith('.'):
            return (base.parent/ref).resolve()
        return None
    def add(path):
        path=path.resolve(); name='sf:'+path.relative_to(ROOT).as_posix()
        if name in modules:return name
        modules[name]=''
        text=path.read_text(encoding='utf-8')
        def replace(m):
            ref=m.group(2); target=resolve(ref,path)
            if target and target.exists() and target.is_file():
                return m.group(0).replace(m.group(1)+ref+m.group(1),m.group(1)+add(target)+m.group(1))
            return m.group(0)
        text=PAT.sub(replace,text)
        # Preserve module-relative URL semantics for code that computes an asset URI on import.
        text=text.replace('import.meta.url',json.dumps('http://127.0.0.1:8765/'+path.relative_to(ROOT).as_posix()))
        modules[name]=text
        return name
    html=(ROOT/'scripts/vfx-force-language-lab.html').read_text(encoding='utf-8')
    entry=re.search(r'<script type="module">(.*?)</script>',html,re.S).group(1)
    ep=ROOT/'scripts/__inline_cycle_lab__.js'
    def replace_entry(m):
        ref=m.group(2); target=resolve(ref,ep)
        if target and target.exists():
            return m.group(0).replace(m.group(1)+ref+m.group(1),m.group(1)+add(target)+m.group(1))
        return m.group(0)
    entry=PAT.sub(replace_entry,entry)
    modules['sf:entry']=entry
    html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
    return html, modules

def mount(page, root=None):
    global ROOT
    if root is not None:
        ROOT=Path(root).resolve()
    html,modules=collect()
    page.set_content(html)
    page.evaluate('''async (modules)=>{
      const imports={};for(const [name,source] of Object.entries(modules))imports[name]=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
      const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.append(map);
      await import('sf:entry');
    }''',modules)
    page.wait_for_function('!!window.__forceLab')
    page.evaluate('window.__forceLab.pause()')
    return len(modules)
