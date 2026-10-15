// GREÑA LIVE · Starvios reader (chat público, sin credenciales)
// Usa el popout público de Starvios. Los selectores pertenecen a la web externa
// y deben validarse con un LIVE real antes de promover esta fase a producción.
import { chromium } from 'playwright-core';

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
  constructor({onChat=()=>{},onState=()=>{},onError=()=>{},cloud=false,chromiumPath=''}={}) {
    this.onChat=onChat;
    this.onState=onState;
    this.onError=onError;
    this.cloud=cloud;
    this.chromiumPath=chromiumPath;
    this.browser=null;
    this.page=null;
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
      this.channel=channel;
      const target='https://starvios.com/popout/chat/'+encodeURIComponent(channel);
      const response=await this.page.goto(target,{waitUntil:'domcontentloaded',timeout:35000});
      if(!response || response.status()>=500) throw new Error('Starvios no respondió correctamente.');
      if(generation!==this.generation) return false;
      this.running=true;
      this.onState({connected:false,channel,label:'Starvios · esperando chat público de @'+channel});
      this.timer=setInterval(()=>this.scan().catch(()=>{}),850);
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
          messages.push({user:user.slice(0,80),text:text.slice(0,1500),starvies});
        }
        return {ready:true,messages};
      });
      if(result.ready!==this.connected) {
        this.connected=result.ready;
        this.onState({
          connected:result.ready,channel:this.channel,
          label:result.ready?'Starvios · chat conectado @'+this.channel:'Starvios · esperando LIVE de @'+this.channel
        });
      }
      for(const m of result.messages) this.onChat({...m,channel:this.channel});
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
  async disconnect() {
    ++this.generation;
    if(this.timer) clearInterval(this.timer);
    this.timer=null;
    const old=this.channel;
    this.running=false;
    this.connected=false;
    this.channel='';
    const browser=this.browser;
    this.browser=null;
    this.page=null;
    if(browser) try { await browser.close(); } catch {}
    if(old) this.onState({connected:false,channel:old,label:'Starvios desconectado'});
  }
}
