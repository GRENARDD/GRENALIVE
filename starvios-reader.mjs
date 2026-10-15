// GREÑA LIVE · Starvios reader (chat público, sin credenciales)
// Usa el popout público de Starvios. Los selectores pertenecen a la web externa
// y deben validarse con un LIVE real antes de promover esta fase a producción.
import { chromium } from 'playwright-core';
import {normalizeStarviosEvent,parseStarviosViewerLabel} from './starvios-events.mjs';

export function normalizeStarviosChannel(input) {
  let value=String(input||'').trim();
  if(!value) return '';
  if(value.includes('/') || /^https?:/i.test(value)) {
    let parsed;
    try {
      parsed=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);
    } catch { return ''; }
    if(!/^(www\.)?starvios\.com$/i.test(parsed.hostname)) return '';
    const parts=parsed.pathname.split('/').filter(Boolean);
    if(!parts.length) return '';
    value=parts[parts.length-1];
  }
  value=value.replace(/^@/,'').trim();
  return /^[a-zA-Z0-9_.-]{2,40}$/.test(value)?value:'';
}

export class StarviosReader {
  constructor({onChat=()=>{},onState=()=>{},onError=()=>{},onEvent=()=>{},onViewers=()=>{},onLive=()=>{},cloud=false,chromiumPath=''}={}) {
    this.onEvent=onEvent;
    this.onViewers=onViewers;
    this.onLive=onLive;
    this.onChat=onChat;
    this.onState=onState;
    this.onError=onError;
    this.cloud=cloud;
    this.chromiumPath=chromiumPath;
    this.browser=null;
    this.page=null;
    this.livePage=null;
    this.liveTimer=null;
    this.lastLive=null;
    this.eventKeys=new Map();
    this.timer=null;
    this.running=false;
    this.connected=false;
    this.channel='';
    this.busy=false;
    this.generation=0;
    this.lastErrorAt=0;
  }
  async connect(input) {
    const channel=normalizeStarviosChannel(input);
    if(!channel) throw new Error('Escribe un usuario o enlace válido de Starvios.');
    await this.disconnect();
    const generation=++this.generation;
    const opts={
      headless:true,
      args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--mute-audio']
    };
    try {
      if(this.cloud) {
        this.browser=await chromium.launch({
          ...opts,
          executablePath:this.chromiumPath||'/usr/bin/chromium',
          args:[...opts.args,'--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']
        });
      } else {
        try { this.browser=await chromium.launch({...opts,channel:'chrome'}); }
        catch { this.browser=await chromium.launch({...opts,channel:'msedge'}); }
      }
      this.page=await this.browser.newPage({viewport:{width:1100,height:800}});
      this.livePage=await this.browser.newPage({viewport:{width:1100,height:800}});
      const handleSocket=socket=>socket.on('framereceived',frame=>this.acceptFrame(frame?.payload));
      this.page.on('websocket',handleSocket);
      this.livePage.on('websocket',handleSocket);
      this.channel=channel;
      const target='https://starvios.com/popout/chat/'+encodeURIComponent(channel);
      const response=await this.page.goto(target,{waitUntil:'domcontentloaded',timeout:35000});
      if(!response || response.status()>=500) throw new Error('Starvios no respondió correctamente.');
      if(generation!==this.generation) return false;
      this.livePage.goto('https://starvios.com/live/'+encodeURIComponent(channel),{waitUntil:'domcontentloaded',timeout:25000}).catch(()=>{});
      this.running=true;
      this.onState({connected:false,channel,label:'Starvios · esperando chat público de @'+channel});
      this.timer=setInterval(()=>this.scan().catch(()=>{}),850);
      this.liveTimer=setInterval(()=>this.scanLive().catch(()=>{}),12000);
      setTimeout(()=>{if(this.running)this.scanLive().catch(()=>{})},5000);
      await this.scan();
      return true;
    } catch(error) {
      await this.disconnect();
      throw error;
    }
  }
  async scan() {
    if(this.busy || !this.page || !this.running) return;
    this.busy=true;
    const generation=this.generation;
    try {
      const result=await this.page.evaluate(()=>{
        const selector='main div.overscroll-contain.overflow-y-auto';
        const container=document.querySelector(selector);
        const state=window.__grenaStarvios||(window.__grenaStarvios={
          container:null,seen:new WeakSet(),seenIds:new Set(),readyAt:0
        });
        if(!container) return {ready:false,messages:[]};
        if(container!==state.container) {
          state.container=container;
          state.seen=new WeakSet();
          state.seenIds=new Set();
          state.readyAt=Date.now()+1800;
        }
        const messages=[];
        const extract=node=>{
          if(node.nodeType===3) return node.textContent||'';
          if(node.nodeType!==1) return '';
          if(node.tagName==='IMG') return node.getAttribute('alt')||'';
          if(/^(SCRIPT|STYLE|BUTTON|SVG)$/.test(node.tagName)) return '';
          if(node.tagName==='BR') return '\n';
          return Array.from(node.childNodes).map(extract).join('');
        };
        for(const row of container.children) {
          if(state.seen.has(row)) continue;
          const name=row.querySelector('p.break-words button.font-semibold');
          const body=name?.parentElement?.querySelector('span[class~="text-foreground/90"]');
          if(!name || !body) continue;
          const user=String(name.textContent||'').trim();
          const text=extract(body).trim();
          if(!user || !text) continue;
          // La primera carga contiene historial, no mensajes nuevos.
          state.seen.add(row);
          let id='';
          try {
            const fiberKey=Object.keys(row).find(k=>k.startsWith('__reactFiber$'));
            id=fiberKey?String(row[fiberKey]?.key||''):'';
          } catch {}
          if(id.startsWith('tmp-')) continue;
          if(id && state.seenIds.has(id)) continue;
          if(id) {
            state.seenIds.add(id);
            if(state.seenIds.size>1000) state.seenIds.delete(state.seenIds.values().next().value);
          }
          if(Date.now()<state.readyAt) continue;
          let starvies=0;
          if(row.classList.contains('border-chat-starvie/70')) {
            const value=String(row.querySelector('p.tabular-nums')?.textContent||'');
            const match=value.match(/([\d.,\s]+)\s+Starvies/i);
            if(match) {
              const digits=match[1].replace(/[^\d]/g,'');
              starvies=Number(digits)||0;
            }
          }
          messages.push({user:user.slice(0,80),text:text.slice(0,1500),starvies,id:id.slice(0,128)});
        }
        return {ready:true,messages};
      });
      if(generation!==this.generation || !this.running)return;
      if(result.ready!==this.connected) {
        this.connected=result.ready;
        this.onState({
          connected:result.ready,channel:this.channel,
          label:result.ready?'Starvios · chat conectado @'+this.channel:'Starvios · esperando LIVE de @'+this.channel
        });
      }
      for(const m of result.messages){
        this.onChat({...m,channel:this.channel});
        if(m.starvies>0)this.deliverEvent({kind:'gift',user:m.user,amount:m.starvies,count:1,id:m.id,message:m.text});
      }
    } catch(error) {
      if(this.connected) {
        this.connected=false;
        this.onState({connected:false,channel:this.channel,label:'Starvios · reconectando chat'});
      }
      if(Date.now()-this.lastErrorAt>30000) {
        this.lastErrorAt=Date.now();
        this.onError(error);
      }
    } finally { this.busy=false; }
  }

  // Sólo mensajes del protocolo que anuncian explícitamente un tipo de evento.
  // No interpretamos texto libre del chat como follow/sub/raid.
  acceptFrame(payload){
    if(!this.running||!payload||typeof payload!=='string'||payload.length>64000)return;
    let root;try{root=JSON.parse(payload)}catch{return}
    const objects=[root,root?.data,root?.payload,root?.event].filter(v=>v&&typeof v==='object'&&!Array.isArray(v));
    for(const candidate of objects){
      const event=normalizeStarviosEvent(candidate);
      if(event){this.deliverEvent(event);break}
    }
  }
  deliverEvent(raw){
    const kind=String(raw.kind||''),user=String(raw.user||'Usuario').slice(0,80);
    if(!['follow','sub','subrenew','giftsub','raid','gift','shower'].includes(kind))return;
    const amount=Math.max(0,Math.trunc(Number(raw.amount)||0));
    if(kind==='gift'&&amount<=0)return;
    const key=String(raw.id||'')?'id:'+raw.id:'approx:'+kind+':'+user.toLowerCase()+':'+amount+':'+(raw.count||1);
    const now=Date.now(),old=this.eventKeys.get(key)||0;
    if(now-old<(key.startsWith('id:')?300000:1800))return;
    this.eventKeys.set(key,now);
    if(this.eventKeys.size>600)for(const [id,at] of this.eventKeys)if(now-at>300000)this.eventKeys.delete(id);
    this.onEvent({...raw,platform:'starvios',kind,user,amount,channel:this.channel});
  }
  async scanLive(){
    if(!this.running||!this.livePage||this.livePage.isClosed())return;
    const generation=this.generation;
    try{
      const state=await this.livePage.evaluate(()=>{
        const text=String(document.body?.innerText||'').slice(0,15000);
        const offline=/no está en directo ahora|is not live right now|currently offline/i.test(text);
        const live=!offline&&(/live stream/i.test(text)||!!document.querySelector('video[src], video source[src]'));
        const labels=[...document.querySelectorAll('[aria-label],[title],[data-testid]')]
          .filter(el=>/viewers?|espectadores?|watching/i.test([el.getAttribute('aria-label'),el.getAttribute('title'),el.getAttribute('data-testid')].join(' ')))
          .slice(0,20).map(el=>[el.getAttribute('aria-label'),el.getAttribute('title'),el.textContent].filter(Boolean).join(' ').slice(0,130));
        return {live:offline?false:live?true:null,labels};
      });
      if(generation!==this.generation||!this.running)return;
      if(typeof state.live==='boolean'&&state.live!==this.lastLive){
        this.lastLive=state.live;
        this.onLive({live:state.live,channel:this.channel,source:'Starvios live page'});
        if(!state.live)this.onViewers({count:0,source:'Starvios offline verificado',channel:this.channel});
      }
      if(state.live===true){
        for(const label of state.labels){
          const count=parseStarviosViewerLabel(label);
          if(count!==null){this.onViewers({count,source:'Starvios public live page',channel:this.channel});break}
        }
      }
    }catch(error){if(Date.now()-this.lastErrorAt>30000){this.lastErrorAt=Date.now();this.onError(error)}}
  }

  async disconnect() {
    ++this.generation;
    if(this.timer) clearInterval(this.timer);
    if(this.liveTimer)clearInterval(this.liveTimer);
    this.timer=null;this.liveTimer=null;
    this.lastLive=null;this.eventKeys.clear();
    const old=this.channel;
    this.running=false;
    this.connected=false;
    this.channel='';
    const browser=this.browser;
    this.browser=null;
    this.page=null;
    this.livePage=null;
    if(browser) try { await browser.close(); } catch {}
    if(old) this.onState({connected:false,channel:old,label:'Starvios desconectado'});
  }
}
