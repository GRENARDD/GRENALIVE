/* GREÑA · Comunidad: canales en vivo de quienes usan la app (el usuario decide si aparece) */
(()=>{
  const zone=document.querySelector('.ops-zone'); if(!zone) return;
  const SHARE='grena-community-share', $=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
  const get=k=>{try{return localStorage.getItem(k)}catch{return null}}, set=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};
  const fmt=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e4?Math.round(n/1e3)+'k':n>=1e3?(n/1e3).toFixed(1)+'k':String(n|0);
  const FALLBACK={tiktok:'#25f4ee',twitch:'#9146ff',kick:'#53fc18',youtube:'#ff3030',starvios:'#ff6ab9'};
  const cs=getComputedStyle(document.documentElement);
  const COLORS=Object.fromEntries(Object.keys(FALLBACK).map(p=>[p,cs.getPropertyValue('--p-'+p).trim()||FALLBACK[p]]));
  let shown=8, data=null;
  const panel=$('section','panel-shell community-panel');
  const head=$('div','panel-head'), hl=$('div'); hl.append($('div','eyebrow','COMUNIDAD GREÑA'));
  const title=$('h2','', 'Canales en vivo (0)'); hl.append(title); head.append(hl);
  const sw=$('label','gx-switch'); const cb=$('input'); cb.type='checkbox'; cb.checked=get(SHARE)==='1';
  sw.append(cb,$('i'),$('span','','Aparecer en la lista')); sw.title='Si lo activas, los demás verán tu nombre, tu foto y tus espectadores cuando estés en vivo.'; head.append(sw);
  const stats=$('div','gx-stats'), grid=$('div','gx-live-grid'), more=$('button','gx-more','Ver más'); more.type='button';
  panel.append(head,stats,grid,more); zone.append(panel);

  function render(){
    const d=data; grid.textContent=''; stats.textContent='';
    if(!d||d.offline){title.textContent='Canales en vivo';stats.append($('span','gx-empty','Sin conexión con el servidor central de GREÑA.'));more.hidden=true;return}
    title.textContent=`Canales en vivo (${d.liveCount})`;
    [[d.usersOnline,'usando GREÑA ahora'],[d.liveCount,'en directo'],[fmt(d.totalViewers),'espectadores en total']].forEach(([v,l])=>{
      const s=$('div','gx-stat'); s.append($('b','',v),$('small','',l)); stats.append(s)});
    if(!d.users.length){grid.append($('div','gx-empty','Nadie ha activado “Aparecer en la lista” y está en vivo. ¡Sé el primero!'))}
    d.users.slice(0,shown).forEach(u=>{
      const c=$('div','gx-live-card'), a=$('div','gx-live-av');
      if(/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(u.avatar||''))a.style.backgroundImage=`url(${u.avatar})`; else a.textContent=(u.name||'?').trim().slice(0,1).toUpperCase();
      const t=$('div','gx-live-txt'), n=$('b','',u.name); n.title=u.name;
      const m=$('div','gx-live-meta'); m.append($('span','gx-live-tag','LIVE'),$('span','gx-live-v','👁 '+fmt(u.viewers)));
      const dots=$('span','gx-dots'); (u.platforms||[]).forEach(p=>{const i=$('i');i.style.background=COLORS[p]||'#888';i.title=p;dots.append(i)});
      m.append(dots); t.append(n,m); c.append(a,t); grid.append(c)});
    more.hidden=d.users.length<=shown;
  }
  async function load(){try{const r=await fetch('/api/license/community',{cache:'no-store'});data=r.ok?await r.json():{offline:true}}catch{data={offline:true}}render()}
  more.onclick=()=>{shown+=8;render()};
  const small=url=>new Promise(res=>{if(!url)return res('');const i=new Image();i.onload=()=>{const c=document.createElement('canvas');c.width=c.height=80;c.getContext('2d').drawImage(i,0,0,80,80);res(c.toDataURL('image/jpeg',.75))};i.onerror=()=>res('');i.src=url});
  async function send(){
    const on=cb.checked; let body={share:false};
    if(on){
      const st=window.grenaState||(typeof state!=='undefined'?state:{}), v=st.viewers||{}, pl=Object.keys(COLORS).filter(k=>Number(v[k])>0);
      const id=st.profile&&st.profile.id; body={share:true,live:pl.length>0,platforms:pl,viewers:pl.reduce((t,k)=>t+Number(v[k]||0),0),avatar:await small(get('grena-avatar:'+(id||'guest')))};
    }
    try{await fetch('/api/license/presence',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})}catch{}
  }
  cb.onchange=()=>{set(SHARE,cb.checked?'1':'0');send().then(load)};
  const tick=()=>send().then(()=>{if(!document.hidden)load()});
  setTimeout(tick,2500); setInterval(tick,30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
  addEventListener('pagehide',()=>{if(cb.checked&&navigator.sendBeacon)navigator.sendBeacon('/api/license/presence',new Blob([JSON.stringify({share:false})],{type:'application/json'}))});
})();
