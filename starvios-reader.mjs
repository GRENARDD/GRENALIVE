// GREÑA LIVE · Starvios reader (chat público, sin credenciales)
// Usa el popout público de Starvios. Los selectores pertenecen a la web externa
// y deben validarse con un LIVE real antes de promover esta fase a producción.
import { chromium } from 'playwright-core';
import {normalizeStarviosEvent} from './starvios-events.mjs';
import {buildStarviosFreshLiveDirectoryUrl,parseStarviosLiveDirectory,fetchStarviosDbLiveDirectory} from './starvios-viewers.mjs';
import {STARVIOS_PUBLIC_DB_URL,STARVIOS_PUBLIC_KEY,parseStarviosChatEvent,parseStarviosFollowerCount,buildStarviosChatEventUrl,buildStarviosFollowerCountRequest,buildStarviosProfileLookupUrl,starviosPublicActor,parseStarviosPublicChat} from './starvios-public-events.mjs';

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
    this.reconnectTimer=null;
    this.recoverPromise=null;
    this.reconnectFailures=0;
    this.missingContainerSince=0;
    this.liveScanBusy=false;
    this.liveTimer=null;
    this.lastLive=null;
    this.liveDirectoryMisses=0;
    this.lastDirectoryGoodAt=0;
    this.directoryPrimaryRetryAt=0;
    this.directoryFallbackRetryAt=0;
    this.directoryBrowserRetryAt=0;
    this.lastDirectoryPrimaryError='';
    this.lastViewerCount=null;
    this.lastViewerReportedSource='';
    this.eventKeys=new Map();
    this.eventSeen=new Map();
    this.chatSeen=new Map();
    this.chatFingerprints=new Map();
    this.eventTimer=null;
    this.eventBusy=false;
    this.streamId='';
    this.channelId='';
    this.sessionStartedAt=0;
    this.eventCursorAt=0;
    this.dbEventsReady=false;
    this.followerTotal=null;
    this.followerPollAt=0;
    this.followNameEvents=0;
    this.profileNames=new Map();
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
    this.channel=channel;
    this.running=true;
    this.sessionStartedAt=Date.now();
    this.eventCursorAt=this.sessionStartedAt;
    this.lastViewerCount=null;
    this.lastViewerReportedSource='Starvios · esperando espectadores';
    this.onViewers({count:null,source:this.lastViewerReportedSource,channel});
    const generation=++this.generation;
    // Audience and database chat must not depend on Chrome/Edge being installed.
    // Desktop builds can use the read-only public API even when Playwright fails.
    this.liveTimer=setInterval(()=>this.scanLive().catch(e=>this.handleScanError(e)),6000);
    this.eventTimer=setInterval(()=>this.scanEvents().catch(e=>this.handleScanError(e)),4000);
    this.scanLive().catch(e=>this.handleScanError(e));
    try {
      await this.openChatPage(generation);
      return true;
    } catch(error) {
      this.onError(error);
      this.onState({connected:false,channel,label:'Starvios · lector visual no disponible, consultando datos públicos'});
      this.scheduleRecovery('lector visual no disponible');
      return true;
    }
  }
  async openChatPage(generation) {
    // Starvios no necesita que GREÑA reproduzca el video del directo.
    // Una segunda página con reproductor agotaba la RAM del contenedor de Railway.
    const opts={
      headless:true,
      args:['--disable-background-timer-throttling','--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows','--mute-audio','--disable-gpu']
    };
    let browser=null;
    try {
      if(this.cloud) {
        browser=await chromium.launch({
          ...opts,
          executablePath:this.chromiumPath||'/usr/bin/chromium',
          args:[...opts.args,'--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']
        });
      } else {
        try { browser=await chromium.launch({...opts,channel:'chrome'}); }
        catch { browser=await chromium.launch({...opts,channel:'msedge'}); }
      }
      if(generation!==this.generation||!this.running) {await browser.close();return}
      const page=await browser.newPage({
        viewport:{width:720,height:460},deviceScaleFactor:1,serviceWorkers:'block'
      });
      if(generation!==this.generation||!this.running) {await browser.close();return}
      // Conservamos JS y los WebSockets de chat; imágenes/video/fonts son innecesarios.
      await page.route('**/*',route=>{
        const type=route.request().resourceType();
        return ['image','font','media'].includes(type)?route.abort():route.continue();
      });
      this.browser=browser;
      this.page=page;
      browser.on('disconnected',()=>{
        if(this.browser===browser)this.scheduleRecovery('navegador desconectado');
      });
      page.on('crash',()=>{
        if(this.page===page)this.scheduleRecovery('pestaña bloqueada');
      });
      page.on('websocket',socket=>socket.on('framereceived',frame=>this.acceptFrame(frame?.payload)));
      const target='https://starvios.com/popout/chat/'+encodeURIComponent(this.channel);
      const response=await page.goto(target,{waitUntil:'domcontentloaded',timeout:35000});
      if(!response||response.status()>=400)throw Error('Starvios no respondió correctamente (HTTP '+(response?.status()||0)+').');
      if(generation!==this.generation||!this.running)return;
      this.onState({connected:false,channel:this.channel,label:'Starvios · esperando chat de @'+this.channel});
      this.timer=setInterval(()=>this.scan().catch(e=>this.handleScanError(e)),1100);
      // Independently running API timers were started by connect().
      await this.scan();
    } catch(error) {
      if(this.browser===browser) {this.browser=null;this.page=null;}
      if(browser)try{await browser.close()}catch{}
      throw error;
    }
  }
  scheduleRecovery(reason='conexión interrumpida') {
    if(!this.running||this.reconnectTimer||this.recoverPromise)return;
    this.connected=false;
    this.onState({connected:false,channel:this.channel,label:'Starvios · reconectando ('+reason+')'});
    const delay=Math.min(30000,1500*Math.pow(2,Math.min(5,this.reconnectFailures++)));
    this.reconnectTimer=setTimeout(()=>{
      this.reconnectTimer=null;
      this.recover().catch(error=>{
        this.onError(error);
        this.scheduleRecovery('reintento automático');
      });
    },delay);
  }
  async recover() {
    if(!this.running||this.recoverPromise)return;
    const generation=this.generation;
    this.recoverPromise=(async()=>{
      if(this.timer)clearInterval(this.timer);
      // Do not stop the public directory/database poll while repairing Chrome.
      this.timer=null;
      const browser=this.browser;
      this.browser=null;this.page=null;
      this.busy=false;
      if(browser)try{await browser.close()}catch{}
      if(generation!==this.generation||!this.running)return;
      await this.openChatPage(generation);
    })();
    try{await this.recoverPromise}finally{this.recoverPromise=null}
  }
  handleScanError(error) {
    const message=String(error?.message||error);
    if(/Target crashed|Target closed|page has been closed|browser has been closed|Session closed|Target page.*closed/i.test(message)) {
      this.scheduleRecovery('lector de chat bloqueado');
      return;
    }
    if(Date.now()-this.lastErrorAt>30000){this.lastErrorAt=Date.now();this.onError(error)}
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
      if(!result.ready) {
        if(!this.missingContainerSince)this.missingContainerSince=Date.now();
        if(Date.now()-this.missingContainerSince>40000)this.scheduleRecovery('chat no disponible');
      } else {
        this.missingContainerSince=0;
        this.reconnectFailures=0;
      }
      if(result.ready!==this.connected) {
        this.connected=result.ready;
        this.onState({
          connected:result.ready,channel:this.channel,
          label:result.ready?'Starvios · chat conectado @'+this.channel:'Starvios · esperando LIVE de @'+this.channel
        });
      }
      for(const m of result.messages){
        this.deliverChat(m);
        // El mensaje de Starvies también se conserva en el chat y TTS.
        // Una vez disponible la lectura pública de registros, evita duplicar su alerta.
        if(m.starvies>0&&!this.dbEventsReady)this.deliverEvent({kind:'gift',user:m.user,amount:m.starvies,count:1,id:m.id,message:m.text});
      }
    } catch(error) {
      if(this.connected){
        this.connected=false;
        this.onState({connected:false,channel:this.channel,label:'Starvios · reconectando chat'});
      }
      this.handleScanError(error);
    } finally { this.busy=false; }
  }

  deliverChat(message){
    const user=String(message?.user||'').trim().slice(0,80);
    const text=String(message?.text||'').trim().slice(0,1500);
    const id=String(message?.id||'').trim().slice(0,128);
    if(!user||!text)return;
    const now=Date.now();
    if(id&&this.chatSeen.has(id))return;
    if(id)this.chatSeen.set(id,now);
    // The public DB and rendered popout often report the same message with
    // different IDs; collapse only near-simultaneous identical copies.
    const fingerprint=user.toLowerCase()+'\u0000'+text;
    if(now-(this.chatFingerprints.get(fingerprint)||0)<1800)return;
    this.chatFingerprints.set(fingerprint,now);
    if(this.chatSeen.size>1200)for(const [key,at] of this.chatSeen)if(now-at>300000||this.chatSeen.size>1000)this.chatSeen.delete(key);
    if(this.chatFingerprints.size>1200)for(const [key,at] of this.chatFingerprints)if(now-at>10000||this.chatFingerprints.size>1000)this.chatFingerprints.delete(key);
    this.onChat({...message,user,text,id,channel:this.channel});
  }

  // Sólo mensajes del protocolo que anuncian explícitamente un tipo de evento.
  // No interpretamos texto libre del chat como follow/sub/raid.
  acceptFrame(payload){
    if(!this.running||!payload||typeof payload!=='string'||payload.length>64000)return;
    let root;try{root=JSON.parse(payload)}catch{return}
    // Algunas conexiones realtime envuelven el evento en JSON serializado
    // dentro de data/payload. Solo aceptamos tipos expresos normalizados.
    const queue=[root],seen=new Set();
    for(let examined=0;queue.length&&examined<24;examined++){
      let candidate=queue.shift();
      if(typeof candidate==='string'){
        if(candidate.length>32000||!/^[\s]*[\[{]/.test(candidate))continue;
        try{candidate=JSON.parse(candidate)}catch{continue}
      }
      if(!candidate||typeof candidate!=='object'||seen.has(candidate))continue;
      seen.add(candidate);
      if(Array.isArray(candidate)){queue.push(...candidate.slice(0,8));continue}
      const event=normalizeStarviosEvent(candidate);
      if(event){this.deliverEvent(event);return}
      if(candidate.kind&&candidate.id){
        if(candidate.stream_id&&this.streamId&&candidate.stream_id!==this.streamId)continue;
        const typed=parseStarviosChatEvent(candidate);
        if(typed){this.deliverEvent(typed);return}
      }
      for(const field of ['data','payload','event','message','body','details','result','record','new','msg']){
        if(candidate[field]!==undefined)queue.push(candidate[field]);
      }
    }
  }
  deliverEvent(raw){
    const kind=String(raw.kind||''),user=String(raw.user||'Usuario Starvios').trim().slice(0,80);
    const anonymous=raw.anonymous===true||/^(?:usuario(?: starvios)?|nuevo seguidor|unknown|anonymous)$/i.test(user);
    if(!['follow','sub','subrenew','giftsub','raid','gift','shower'].includes(kind))return;
    const amount=Math.max(0,Math.trunc(Number(raw.amount)||0));
    if(kind==='gift'&&amount<=0)return;
    const key=String(raw.id||'')?'id:'+raw.id:'approx:'+kind+':'+user.toLowerCase()+':'+amount+':'+(raw.count||1);
    const now=Date.now(),old=this.eventKeys.get(key)||0;
    if(now-old<(key.startsWith('id:')?300000:1800))return;
    this.eventKeys.set(key,now);
    if(this.eventKeys.size>600)for(const [id,at] of this.eventKeys)if(now-at>300000)this.eventKeys.delete(id);
    if(kind==='follow'&&!anonymous)this.followNameEvents++;
    this.onEvent({...raw,platform:'starvios',kind,user,anonymous,amount,channel:this.channel});
  }

  // Public read-only records from the same live chat Starvios displays.
  // We do not replay messages/events posted before GREÑA connected.
  async scanEvents(){
    if(!this.running||!this.streamId||this.eventBusy)return;
    this.eventBusy=true;
    const generation=this.generation;
    const streamId=this.streamId;
    try{
      const cursor=Math.max(this.sessionStartedAt,this.eventCursorAt-1500);
      const sinceIso=new Date(cursor).toISOString();
      const headers={apikey:STARVIOS_PUBLIC_KEY,accept:'application/json'};
      let response=await fetch(buildStarviosChatEventUrl(streamId,sinceIso,200,true,true,true),{
        headers,signal:AbortSignal.timeout(9500)
      });
      // Si cambia la relación de perfiles, seguimos recibiendo los eventos
      // públicos sin atribuirles usuarios inventados.
      if(response.status===400){
        // El join puede fallar aunque el evento aún incluya su user_id.
        response=await fetch(buildStarviosChatEventUrl(streamId,sinceIso,200,false,true,true),{
          headers,signal:AbortSignal.timeout(9500)
        });
      }
      if(response.status===400){
        // Compatibilidad con versiones que no exponen user_id.
        response=await fetch(buildStarviosChatEventUrl(streamId,sinceIso,200,false),{
          headers,signal:AbortSignal.timeout(9500)
        });
      }
      if(!response.ok)throw Error('Starvios eventos HTTP '+response.status);
      const rows=await response.json();
      if(!Array.isArray(rows))throw Error('Starvios devolvió eventos inválidos');
      if(!this.running||generation!==this.generation||streamId!==this.streamId)return;
      // Si la relación anidada no está disponible, consultar solo los perfiles
      // públicos de los IDs asociados a eventos recibidos durante este LIVE.
      // Nunca asociar un nombre por proximidad temporal ni por el chat.
      const ids=[...new Set(rows.filter(row=>row && Date.parse(row.created_at||'')>=this.sessionStartedAt
        &&!starviosPublicActor(row)).map(row=>String(row.user_id||'').trim())
        .filter(id=>/^[0-9a-f-]{20,80}$/i.test(id)&&!this.profileNames.has(id)))].slice(0,100);
      if(ids.length){
        try {
          const profileResponse=await fetch(buildStarviosProfileLookupUrl(ids),{
            headers,signal:AbortSignal.timeout(4500)
          });
          if(profileResponse.ok){
            const profiles=await profileResponse.json();
            if(Array.isArray(profiles)){
              for(const p of profiles){
                const id=String(p?.id||''),name=String(p?.username||'').trim();
                if(ids.includes(id)&&name&&name.length<=80)this.profileNames.set(id,name);
              }
              // Avoid repeating denied/empty lookups for the same event author.
              for(const id of ids)if(!this.profileNames.has(id))this.profileNames.set(id,'');
              if(this.profileNames.size>700){
                for(const key of [...this.profileNames.keys()].slice(0,200))this.profileNames.delete(key);
              }
            }
          }
        }catch {} // Unavailable public profiles must never interrupt alert delivery.
      }
      for(const row of rows){
        const name=this.profileNames.get(String(row?.user_id||''));
        if(name&&!starviosPublicActor(row))row.profiles={username:name};
      }
      this.dbEventsReady=true;
      for(const row of rows){
        const id=String(row.id||'');
        if(!id||this.eventSeen.has(id))continue;
        const created=Date.parse(row.created_at||'');
        if(!Number.isFinite(created))continue;
        this.eventSeen.set(id,created);
        if(created>=this.sessionStartedAt){
          const chat=parseStarviosPublicChat(row);
          if(chat)this.deliverChat(chat);
          const event=parseStarviosChatEvent(row);
          if(event)this.deliverEvent(event);
        }
        if(created>this.eventCursorAt)this.eventCursorAt=created;
      }
      if(this.eventSeen.size>2200){
        for(const [id,time] of this.eventSeen){
          if(time<this.eventCursorAt-90000||this.eventSeen.size>2000)this.eventSeen.delete(id);
        }
      }
      if(this.channelId&&Date.now()-this.followerPollAt>=12000){
        this.followerPollAt=Date.now();
        await this.scanFollowers(generation);
      }
    }catch(error){
      if(Date.now()-this.lastErrorAt>30000){
        this.lastErrorAt=Date.now();
        this.onError(error);
      }
    }finally{this.eventBusy=false}
  }
  async scanFollowers(generation){
    if(!this.channelId||!this.running)return;
    const id=this.channelId;
    try{
      const response=await fetch(STARVIOS_PUBLIC_DB_URL+'/rpc/discovery_follower_counts',{
        method:'POST',
        headers:{apikey:STARVIOS_PUBLIC_KEY,'content-type':'application/json'},
        body:buildStarviosFollowerCountRequest(id),
        signal:AbortSignal.timeout(9000)
      });
      if(!response.ok)return;
      const count=parseStarviosFollowerCount(await response.json(),id);
      if(count===null||!this.running||this.generation!==generation||this.channelId!==id)return;
      if(this.followerTotal!==null&&count>this.followerTotal){
        // This aggregate does not expose follower identity. Do NOT invent names.
        const delta=count-this.followerTotal;
        const outstanding=Math.max(0,delta-this.followNameEvents);
        if(outstanding>0&&outstanding<=25){
          this.deliverEvent({
            kind:'follow',user:'Nuevo seguidor',anonymous:true,
            count:outstanding,id:'followers:'+id+':'+count,
            source:'Starvios public verified follower count'
          });
        }
      }
      this.followerTotal=count;
      this.followNameEvents=0;
    }catch(error){
      if(Date.now()-this.lastErrorAt>30000){this.lastErrorAt=Date.now();this.onError(error)}
    }
  }

  // El directorio /live muestra tarjetas públicas con espectadores. Es un
  // respaldo independiente de /api/public/live-now, que a veces agota el
  // tiempo de espera desde Railway. Jamás deducimos una cifra del chat.
  async readViewerFromLiveDirectory(generation){
    if(!this.browser||Date.now()<this.directoryBrowserRetryAt)return null;
    this.directoryBrowserRetryAt=Date.now()+45000;
    let listing=null;
    try{
      listing=await this.browser.newPage();
      await listing.route('**/*',route=>{
        const type=route.request().resourceType();
        return ['image','font','media'].includes(type)?route.abort():route.continue();
      });
      const response=await listing.goto('https://starvios.com/live',{waitUntil:'domcontentloaded',timeout:13000});
      if(!response||response.status()>=400)return null;
      // El directorio es una SPA: los canales llegan después del HTML inicial.
      // No interpretamos un esqueleto sin tarjetas como cero espectadores.
      await listing.waitForFunction(()=>document.querySelectorAll('a[href*="/live/"]').length>0
        ||/no live streams|no hay directos|sin emisiones|no streams live/i.test(String(document.body?.innerText||'')),undefined,{timeout:11000}).catch(()=>{});
      await listing.waitForTimeout(800);
      if(generation!==this.generation||!this.running)return null;
      let found=await listing.evaluate(channel=>{
        const normalized='/live/'+channel.toLowerCase();
        const asCount=raw=>{
          const str=String(raw||'').trim();
          if(!/^(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(str))return null;
          const n=Number(str.replace(/[.,]/g,''));
          return Number.isSafeInteger(n)&&n>=0&&n<=10000000?n:null;
        };
        const links=[...document.querySelectorAll('a[href]')].filter(link=>{
          try{return new URL(link.getAttribute('href'),location.href).pathname.toLowerCase().replace(/\/$/,'')===normalized}catch{return false}
        });
        for(const link of links){
          const card=link.closest('article,[data-testid*="stream"],[data-testid*="live"],li')
            ||link.closest('[class*="card"],[class*="Card"],[class*="group"]')||link;
          // Solo valores rotulados explícitamente como audiencia del LIVE.
          const attributes=[card,...card.querySelectorAll('[aria-label],[title],[data-viewer-count],[data-viewers]')];
          for(const el of attributes){
            for(const value of [el.getAttribute?.('data-viewer-count'),el.getAttribute?.('data-viewers'),el.getAttribute?.('aria-label'),el.getAttribute?.('title')]){
              const label=String(value||'');
              const m=label.match(/(?:espectadores|viewers|watching|viendo)\s*[:：]?\s*([\d.,]+)/i)
                ||label.match(/([\d.,]+)\s*(?:espectadores|viewers|watching|viendo)/i);
              if(m){const count=asCount(m[1]);if(count!==null)return count}
            }
          }
          // En Starvios la cifra puede acompañar al icono de un ojo sin texto.
          for(const eye of card.querySelectorAll('svg,[data-lucide]')){
            const icon=(eye.getAttribute('class')||'')+' '+(eye.getAttribute('data-lucide')||'')+' '+(eye.getAttribute('aria-label')||'');
            if(!/(?:^|[^a-z])eye(?:[^a-z]|$)|visibility/i.test(icon))continue;
            for(const parent of [eye.parentElement,eye.parentElement?.parentElement]){
              const txt=String(parent?.innerText||'').trim();
              const count=asCount(txt);
              if(count!==null)return count;
              const m=txt.match(/(?:^|\s)([\d.,]+)\s*(?:espectadores|viewers)?$/i);
              if(m){const parsed=asCount(m[1]);if(parsed!==null)return parsed}
            }
          }
          const text=String(card.innerText||'').replace(/\s+/g,' ');
          const labeled=text.match(/(?:espectadores|viewers|watching|viendo)\s*[:：]?\s*([\d.,]+)/i)
            ||text.match(/([\d.,]+)\s*(?:espectadores|viewers|watching|viendo)/i);
          if(labeled){const count=asCount(labeled[1]);if(count!==null)return count}
        }
        return null;
      },this.channel);
      if(found===null){
        // Diagnóstico acotado: estructura pública del directorio, sin credenciales.
        const info=await listing.evaluate(channel=>{
          const links=[...document.querySelectorAll('a[href*="/live/"]')];
          const matched=links.filter(a=>String(a.getAttribute('href')||'').toLowerCase().includes('/live/'+channel.toLowerCase()));
          return {title:document.title,links:links.length,samples:links.slice(0,3).map(a=>({href:a.getAttribute('href'),text:String(a.closest('article,li,[class*="card"],[class*="group"]')?.innerText||a.innerText||'').slice(0,115)})),
            matched:matched.slice(0,2).map(a=>({html:String(a.parentElement?.outerHTML||'').slice(0,400)})),body:String(document.body?.innerText||'').slice(0,850),hrefs:[...document.querySelectorAll('a[href]')].slice(0,7).map(a=>a.getAttribute('href'))};
        },this.channel);
        console.info('[STARVIOS DIRECTORY CHECK]',JSON.stringify(info).slice(0,900));
      }
      if(found===null){
        // Si /live no consigue cargar las tarjetas, la página del canal puede
        // mostrar su audiencia sin depender de ese listado.
        try{
          const response=await listing.goto('https://starvios.com/live/'+encodeURIComponent(this.channel),{
            waitUntil:'domcontentloaded',timeout:12000
          });
          if(response&&response.status()<400){
            await listing.waitForTimeout(2500);
            if(generation===this.generation&&this.running){
              found=await listing.evaluate(()=>{
                const pageText=String(document.body?.innerText||'');
                if(/no est[aá] en directo|not (?:currently )?live|stream is offline|no est[aá] transmitiendo/i.test(pageText))return null;
                const numeric=value=>{
                  const x=String(value??'').trim();
                  if(!/^(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(x))return null;
                  const n=Number(x.replace(/[.,]/g,''));
                  return Number.isSafeInteger(n)&&n>=0&&n<=10000000?n:null;
                };
                const labeled=text=>{
                  const t=String(text||'');
                  const m=t.match(/(?:espectadores|viewers|watching|viendo)\s*[:：]?\s*([\d.,]+)/i)
                    ||t.match(/([\d.,]+)\s*(?:espectadores|viewers|watching|viendo)/i);
                  return m?numeric(m[1]):null;
                };
                for(const element of document.querySelectorAll('[data-viewer-count],[data-viewers],[aria-label],[title]')){
                  for(const x of [element.getAttribute('data-viewer-count'),element.getAttribute('data-viewers'),element.getAttribute('aria-label'),element.getAttribute('title')]){
                    const count=labeled(x)??(element.hasAttribute('data-viewer-count')?numeric(x):null);
                    if(count!==null)return count;
                  }
                }
                for(const eye of document.querySelectorAll('svg,[data-lucide]')){
                  const label=(eye.getAttribute('class')||'')+' '+(eye.getAttribute('data-lucide')||'')+' '+(eye.getAttribute('aria-label')||'');
                  if(!/(?:^|[^a-z])eye(?:[^a-z]|$)|visibility/i.test(label))continue;
                  for(const parent of [eye.parentElement,eye.parentElement?.parentElement]){
                    const count=numeric(parent?.innerText)??labeled(parent?.innerText);
                    if(count!==null)return count;
                  }
                }
                // Nunca leer likes, seguidores, vistas históricas ni metas.
                return null;
              });
            }
          }
        }catch(error){this.lastDirectoryChannelError=String(error?.message||error).slice(0,120)}
      }
      return found===null?null:{rows:[{status:'live',viewer_count:found,profiles:{username:this.channel}}]};
    }catch(error){
      this.lastDirectoryCardError=String(error?.message||error).slice(0,100);
      return null;
    }finally{
      if(listing)try{await listing.close()}catch{}
    }
  }

  async scanLive(){
    if(!this.running||!this.channel||this.liveScanBusy)return;
    this.liveScanBusy=true;
    const generation=this.generation;
    try{
      // Starvios publica el mismo directorio con el que muestra sus cifras en la web.
      // No abrimos video ni otra pestaña pesada; el contador es independiente del chat.
      let payload=null;
      let directorySource='Starvios public live directory';
      // Si el dominio público tarda demasiado, usamos la misma BD de lectura
      // pública que consulta la web. El respaldo jamás inventa espectadores.
      if(Date.now()>=this.directoryPrimaryRetryAt){
        try{
          const response=await fetch(buildStarviosFreshLiveDirectoryUrl(),{
            headers:{accept:'application/json','cache-control':'no-cache'},
            cache:'no-store',signal:AbortSignal.timeout(5500)
          });
          if(!response.ok)throw Error('HTTP '+response.status);
          if(Number(response.headers.get('content-length')||0)>4*1024*1024)throw Error('Respuesta excesiva');
          payload=await response.json();
          if(!payload||!Array.isArray(payload.rows))throw Error('Sin registros de directos');
          this.lastDirectoryPrimaryError='';
          this.directoryFallbackRetryAt=0;
        }catch(error){
          this.lastDirectoryPrimaryError=String(error?.message||error).slice(0,120);
          this.directoryPrimaryRetryAt=Date.now()+90000;
        }
      }
      // Refresh public primary data every 6s. Expensive browser/DB fallbacks
      // are restricted to once per 18s when the primary is unavailable.
      if(!payload){
        if(Date.now()<this.directoryFallbackRetryAt)return;
        this.directoryFallbackRetryAt=Date.now()+18000;
      }
      // El navegador que ya usa el chat está en el origen real de Starvios.
      // Un fetch same-origin puede funcionar incluso si Node/Railway es rechazado.
      let browserViewerError='';
      if(!payload&&this.page&&!this.page.isClosed()){
        try{
          payload=await this.page.evaluate(async channel=>{
            const response=await fetch('/api/public/live-now?_live_ts='+Date.now(),{
              headers:{accept:'application/json','cache-control':'no-cache'},cache:'no-store',
              signal:AbortSignal.timeout(11000)
            });
            if(!response.ok)throw Error('HTTP '+response.status);
            const raw=await response.json();
            if(!raw||!Array.isArray(raw.rows))throw Error('Directorio sin rows');
            // Sólo devolvemos al servidor el registro del canal solicitado.
            const name=String(channel).toLowerCase();
            return {rows:raw.rows.filter(row=>
              String(row?.profiles?.username||'').toLowerCase()===name).slice(0,8)};
          },this.channel);
          directorySource='Starvios public directory · navegador';
        }catch(error){browserViewerError=String(error?.message||error).slice(0,120)}
      }
      let dbViewerError='';
      if(!payload){
        try{
          payload=await fetchStarviosDbLiveDirectory(this.channel,{
            baseUrl:STARVIOS_PUBLIC_DB_URL,key:STARVIOS_PUBLIC_KEY,timeoutMs:6000
          });
          directorySource='Starvios public DB · respaldo';
        }catch(error){dbViewerError=String(error?.message||error).slice(0,160)}
      }
      // El directorio renderizado es la última fuente independiente. Solo
      // sobrescribe la lectura anterior si ofrece una cifra atribuible al canal.
      if(!payload||parseStarviosLiveDirectory(payload,this.channel).count===null){
        const rendered=await this.readViewerFromLiveDirectory(generation);
        if(rendered){payload=rendered;directorySource='Starvios live directory · contador visible'}
      }
      if(!payload){
        throw Error('Starvios viewer primary: '+(this.lastDirectoryPrimaryError||'en pausa')+
          (browserViewerError?' · browser: '+browserViewerError:'')+
          (dbViewerError?' · public DB: '+dbViewerError:'')+
          (this.lastDirectoryCardError?' · live page: '+this.lastDirectoryCardError:''));
      }
      if(generation!==this.generation||!this.running)return;
      const state=parseStarviosLiveDirectory(payload,this.channel);
      const stream=Array.isArray(payload.rows)?payload.rows.find(row=>row&&String(row.status||'').toLowerCase()==='live'&&String(row.profiles?.username||'').toLowerCase()===this.channel.toLowerCase()):null;
      if(stream?.id&&stream?.channel_id){
        const isNew=!!this.streamId&&this.streamId!==stream.id;
        if(isNew){this.eventSeen.clear();this.eventKeys.clear();this.chatSeen.clear();this.chatFingerprints.clear();this.profileNames.clear();this.dbEventsReady=false;this.sessionStartedAt=Date.now();this.eventCursorAt=this.sessionStartedAt;this.followerTotal=null;}
        this.streamId=String(stream.id);this.channelId=String(stream.channel_id);
        this.scanEvents().catch(()=>{});
      }
      if(state.state==='unavailable')throw Error('Directorio de Starvios sin datos');
      this.lastDirectoryGoodAt=Date.now();
      if(state.state==='offline'){
        this.liveDirectoryMisses++;
        // Un directorio recién actualizado puede tardar en incluir al canal.
        if(this.liveDirectoryMisses<2&&this.lastLive!==false)return;
        this.streamId='';this.channelId='';this.followerTotal=null;this.dbEventsReady=false;
        if(this.lastLive!==false){
          this.lastLive=false;
          this.onLive({live:false,channel:this.channel,source:directorySource});
        }
        if(this.lastViewerCount!==0){
          this.lastViewerCount=0;
          this.onViewers({count:0,source:'Starvios offline verificado',channel:this.channel});
        }
        return;
      }
      this.liveDirectoryMisses=0;
      if(this.lastLive!==true){
        this.lastLive=true;
        this.onLive({live:true,channel:this.channel,source:directorySource});
      }
      if(state.count===null){
        if(this.lastViewerCount!==null||this.lastViewerReportedSource!=='Starvios sin cifra verificable'){
          this.lastViewerCount=null;
          this.lastViewerReportedSource='Starvios sin cifra verificable';
          this.onViewers({count:null,source:this.lastViewerReportedSource,channel:this.channel});
        }
      }else{
        this.lastViewerCount=state.count;
        this.lastViewerReportedSource=directorySource;
        this.onViewers({count:state.count,source:directorySource,channel:this.channel});
      }
    }catch(error){
      if(this.lastDirectoryGoodAt && Date.now()-this.lastDirectoryGoodAt>60000 && this.lastViewerCount!==null){
        this.lastViewerCount=null;
        this.onViewers({count:null,source:'Starvios · cifra sin actualizar',channel:this.channel});
      }
      if(Date.now()-this.lastErrorAt>30000){
        this.lastErrorAt=Date.now();
        this.onError(error);
      }
    }finally{this.liveScanBusy=false}
  }

  async disconnect() {
    ++this.generation;
    if(this.timer) clearInterval(this.timer);
    if(this.liveTimer)clearInterval(this.liveTimer);
    if(this.eventTimer)clearInterval(this.eventTimer);
    if(this.reconnectTimer)clearTimeout(this.reconnectTimer);
    this.timer=null;this.liveTimer=null;this.eventTimer=null;this.reconnectTimer=null;
    this.reconnectFailures=0;
    this.missingContainerSince=0;
    this.lastLive=null;this.liveDirectoryMisses=0;this.lastDirectoryGoodAt=0;this.directoryPrimaryRetryAt=0;this.directoryFallbackRetryAt=0;this.directoryBrowserRetryAt=0;this.lastDirectoryPrimaryError='';this.lastDirectoryCardError='';
    this.lastViewerCount=null;this.eventKeys.clear();this.eventSeen.clear();this.chatSeen.clear();this.chatFingerprints.clear();this.profileNames.clear();
    this.dbEventsReady=false;this.eventBusy=false;this.streamId='';this.channelId='';
    this.followerTotal=null;this.followerPollAt=0;this.followNameEvents=0;
    const old=this.channel;
    this.running=false;
    this.connected=false;
    this.channel='';
    const browser=this.browser;
    this.browser=null;
    this.page=null;
    this.livePage=null;
    if(browser) try { await browser.close(); } catch {}
    if(old){
      this.onViewers({count:0,channel:old,source:'Starvios desconectado'});
      this.onLive({live:false,channel:old,source:'Starvios desconectado'});
      this.onState({connected:false,channel:old,label:'Starvios desconectado'});
    }
  }
}
