#!/usr/bin/env python3
"""Merge Halloween and compact preview UI after the pre-existing 4-theme Desktop kit.
No modifications to the original 3D Minecraft / Domino theme pack logic.
"""
from pathlib import Path
import re
import sys

root=Path(sys.argv[1]).resolve()
new=root/'.grena-halloween-new'
def get(rel): return (root/rel).read_text(encoding='utf-8')
def put(rel,content): (root/rel).write_text(content,encoding='utf-8')
def newget(rel): return (new/rel).read_text(encoding='utf-8')
def once(source,old,replacement,label):
    if source.count(old)!=1: raise RuntimeError(f'{label}: se esperaba una coincidencia, hay {source.count(old)}')
    return source.replace(old,replacement,1)

# Real desktop integration provides the four existing themes.
dashboard=get('alerts.html')
user_dashboard=newget('alerts.html')
marker='<section class="style-hub"'
end='<div class="welcome">'
start_ours=user_dashboard.index(marker)
end_ours=user_dashboard.index(end,start_ours)
hub=user_dashboard[start_ours:end_ours]
extra='''  <button type="button" class="style-choice" data-grena-theme="minecraft3d" aria-pressed="false"><span class="style-illustration minecraft3d" aria-hidden="true"><span class="hw-logo">🧊</span><span class="logo-type">MINECRAFT 3D</span></span><span class="style-choice-name"><strong>Minecraft 3D</strong><span>Elegir</span></span></button>
  <button type="button" class="style-choice" data-grena-theme="domino" aria-pressed="false"><span class="style-illustration domino" aria-hidden="true"><span class="hw-logo">🁫</span><span class="logo-type">DOMINÓ</span></span><span class="style-choice-name"><strong>Dominó</strong><span>Elegir</span></span></button>
'''
anchor=' </div>\n <div id="styleSaveStatus"'
hub=once(hub,anchor,extra+anchor,'cards for Minecraft 3D + Domino')
if dashboard.count(marker)!=1 or dashboard.count(end)!=1:
    raise RuntimeError('No se reconoció el selector del Desktop kit.')
a=dashboard.index(marker)
b=dashboard.index(end,a)
dashboard=dashboard[:a]+hub+dashboard[b:]
# Keep the already-verified OBS URL/token script and all Studio hooks.
dashboard=dashboard.replace('src="/assets/alerts-theme-picker.js?v=1"','src="/assets/alerts-theme-picker.js?v=3"')
if dashboard.count('id="overlayUrl"')>1:
    start_legacy=dashboard.index('<div class="panel obs-panel">',dashboard.index(end))
    legacy=dashboard[start_legacy:]
    for old,replacement in [('id="overlayUrl"','id="legacyOverlayUrl"'),('id="overlayUrlHorizontal"','id="legacyOverlayUrlHorizontal"'),('id="copyOverlay"','id="legacyCopyOverlay"'),('data-ag-copy="overlayUrlHorizontal"','data-ag-copy="legacyOverlayUrlHorizontal"')]:
        legacy=legacy.replace(old,replacement,1)
    dashboard=dashboard[:start_legacy]+legacy
put('alerts.html',dashboard)

css=get('assets/alerts-simple.css')
extra_css=newget('assets/alerts-simple.css')
key='/* GREÑA · compact live theme picker'
if key not in extra_css: raise RuntimeError('No se encontraron estilos compactos nuevos.')
if key not in css: css+='\n'+extra_css[extra_css.index(key):]
css+='''\n/* Kit de escritorio: seis temas completos, sin perder Dominó / Minecraft 3D. */
.grena-alerts .style-options{grid-template-columns:repeat(6,minmax(0,1fr))}
.grena-alerts .style-illustration.domino{background:radial-gradient(circle at 50% 100%,#ffaa3344,transparent),linear-gradient(120deg,#191f31,#13151e)}
.grena-alerts .style-illustration.minecraft3d{background:radial-gradient(circle at 50% 100%,#65ff9c44,transparent),linear-gradient(120deg,#123a2f,#111c28)}
.grena-alerts .style-illustration.domino .hw-logo,.grena-alerts .style-illustration.minecraft3d .hw-logo{font-size:41px}
@media(max-width:760px){.grena-alerts .style-options{grid-template-columns:repeat(3,minmax(0,1fr))}}
'''
put('assets/alerts-simple.css',css)

picker=newget('assets/alerts-theme-picker.js')
picker=once(picker,"['original','minecraft','halloween','christmas']","['original','minecraft','minecraft3d','domino','halloween','christmas']",'picker allowed themes')
picker=once(picker,"halloween:'Halloween',christmas:'Navidad'","minecraft3d:'Minecraft 3D',domino:'Dominó',halloween:'Halloween',christmas:'Navidad'",'picker labels')
put('assets/alerts-theme-picker.js',picker)

server=get('server.mjs')
start=server.index('function normalizeAfterglowSettings(')
end=server.index('\n}',start)+2
settings=server[start:end]
match=re.search(r"return \{theme:.*?,intensity:",settings)
if not match: raise RuntimeError('No se encontró la normalización del tema en el Desktop kit: '+settings[:850])
settings=settings[:match.start()]+("return {theme:['minecraft','minecraft3d','domino','halloween','christmas'].includes(x.theme)?x.theme:'original',intensity:")+settings[match.end():]
server=server[:start]+settings+server[end:]
server=once(server,"'/afterglow-overlay.html',","'/afterglow-overlay.html','/halloween-alertas-3d.html','/navidad-alertas-3d.html',",'private OBS route')
put('server.mjs',server)

overlay=get('afterglow-overlay.html')
fresh=newget('afterglow-overlay.html')
hbeg=fresh.index('// The Halloween engine stays')
hend=fresh.index('function applySettings(src)',hbeg)
helpers=fresh[hbeg:hend]
if 'function ensureHalloweenFrame()' not in helpers or 'function ensureChristmasFrame()' not in helpers: raise RuntimeError('La nueva capa Halloween no está disponible.')
if 'function ensureHalloweenFrame()' in overlay: raise RuntimeError('La capa Halloween se duplicaría.')
overlay=once(overlay,'function applySettings(src)',helpers+'function applySettings(src)','Halloween frame functions')
# Retain old theme logic (including 3D Minecraft and Domino), then extend it.
normalized_start=overlay.index('function normalizedSettings(')
normalized_end=overlay.index('\n}',normalized_start)+2
settings=overlay[normalized_start:normalized_end]
match=re.search(r"return \{theme:.*?,intensity:",settings)
if not match: raise RuntimeError('No se reconoció el tema del overlay Desktop: '+settings[:850])
settings=settings[:match.start()]+("return {theme:['minecraft','minecraft3d','domino','halloween','christmas'].includes(src.theme)?src.theme:'original',intensity:")+settings[match.end():]
overlay=overlay[:normalized_start]+settings+overlay[normalized_end:]
wrapper="""const grenaBaseApplySettings=applySettings;
applySettings=function(src){
 grenaBaseApplySettings(src);
 if(['halloween','christmas'].includes(src?.theme)){cfg.theme=src.theme;live.dataset.theme=src.theme}
 const halloween=cfg.theme==='halloween',christmas=cfg.theme==='christmas';
 if(halloween)ensureHalloweenFrame();
 if(christmas)ensureChristmasFrame();
 if(halloweenFrame)halloweenFrame.style.display=halloween?'block':'none';
 if(christmasFrame)christmasFrame.style.display=christmas?'block':'none';
 root.style.display=halloween||christmas?'none':'block';
};
"""
overlay=once(overlay,'function duration(event)',wrapper+'function duration(event)','Halloween switch wrapper')
needle="  const {event,data}=mapAlert(next)||{};if(!event){working=false;drain();return}"
needle2=" const {event,data}=mapAlert(next)||{};if(!event){working=false;drain();return}"
target=needle if needle in overlay else needle2
overlay=once(overlay,target,target+"""
  if(cfg.theme==='halloween'||cfg.theme==='christmas'){
    if(cfg.theme==='christmas')christmasAlertFor(event,data,next);
    else halloweenAlertFor(event,data,next);
    activeTimer=setTimeout(()=>{working=false;if(!refreshWhenIdle())drain()},80);
    return;
  }""",'Halloween event forwarding')
overlay=overlay.replace('\n connect();\n checkOverlayRelease();','\n if(qp.get(\'preview\')!==\'1\')connect();\n checkOverlayRelease();',1)
put('afterglow-overlay.html',overlay)
print('OK: GREÑA Desktop: original, Minecraft, Minecraft 3D, Dominó, Halloween, Navidad; previsualización y OBS estables.')
