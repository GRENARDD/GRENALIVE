// GREÑA LIVE · Starvios reader (chat público, sin credenciales)
// Usa el popout público de Starvios. Los selectores pertenecen a la web externa
// y deben validarse con un LIVE real antes de promover esta fase a producción.
import { chromium } from 'playwright-core';
import {normalizeStarviosEvent} from './starvios-events.mjs';
import {STARVIOS_LIVE_DIRECTORY_URL,parseStarviosLiveDirectory,fetchStarviosDbLiveDirectory} from './starvios-viewers.mjs';
import {STARVIOS_PUBLIC_DB_URL,STARVIOS_PUBLIC_KEY,parseStarviosChatEvent,parseStarviosFollowerCount,buildStarviosChatEventUrl,buildStarviosFollowerCountRequest} from './starvios-public-events.mjs';

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
    this.lastDirectoryPrimaryError='';
    this.lastViewerCount=null;
    this.lastViewerReportedSource='';
    this.eventKeys=new Map();
    this.eventSeen=new Map();
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
    try {
      await this.openChatPage(generation);
      return true;
    } catch(error) {
      await this.disconnect();
      throw error;
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
      // La detección auxiliar del directo usa HTTP ligero, NUNCA un reproductor extra.
      this.liveTimer=setInterval(()=>this.scanLive().catch(()=>{}),15000);
      this.eventTimer=setInterval(()=>this.scanEvents().catch(e=>this.handleScanError(e)),4000);
      await this.scan();
      this.scanLive().catch(()=>{});
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
      if(this.liveTimer)clearInterval(this.liveTimer);
      if(this.eventTimer)clearInterval(this.eventTimer);
      this.timer=null;this.liveTimer=null;this.eventTimer=null;
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
        this.onChat({...m,channel:this.channel});
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
      let response=await fetch(buildStarviosChatEventUrl(streamId,sinceIso,200),{
        headers,signal:AbortSignal.timeout(9500)
      });
      // Si cambia la relación de perfiles, seguimos recibiendo los eventos
      // públicos sin atribuirles usuarios inventados.
      if(response.status===400){
        response=await fetch(buildStarviosChatEventUrl(streamId,sinceIso,200,false),{
          headers,signal:AbortSignal.timeout(9500)
        });
      }
      if(!response.ok)throw Error('Starvios eventos HTTP '+response.status);
      const rows=await response.json();
      if(!Array.isArray(rows))throw Error('Starvios devolvió eventos inválidos');
      if(!this.running||generation!==this.generation||streamId!==this.streamId)return;
      this.dbEventsReady=true;
      for(const row of rows){
        const id=String(row.id||'');
        if(!id||this.eventSeen.has(id))continue;
        const created=Date.parse(row.created_at||'');
        if(!Number.isFinite(created))continue;
        this.eventSeen.set(id,created);
        if(created>=this.sessionStartedAt){
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
          const response=await fetch(STARVIOS_LIVE_DIRECTORY_URL,{
            headers:{accept:'application/json'},
            signal:AbortSignal.timeout(6000)
          });
          if(!response.ok)throw Error('HTTP '+response.status);
          if(Number(response.headers.get('content-length')||0)>4*1024*1024)throw Error('Respuesta excesiva');
          payload=await response.json();
          if(!payload||!Array.isArray(payload.rows))throw Error('Sin registros de directos');
          this.lastDirectoryPrimaryError='';
        }catch(error){
          this.lastDirectoryPrimaryError=String(error?.message||error).slice(0,120);
          this.directoryPrimaryRetryAt=Date.now()+90000;
        }
      }
      // El navegador que ya usa el chat está en el origen real de Starvios.
      // Un fetch same-origin puede funcionar incluso si Node/Railway es rechazado.
      let browserViewerError='';
      if(!payload&&this.page&&!this.page.isClosed()){
        try{
          payload=await this.page.evaluate(async channel=>{
            const response=await fetch('/api/public/live-now',{
              headers:{accept:'application/json'},cache:'no-store',
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
      if(!payload){
        try{
          payload=await fetchStarviosDbLiveDirectory(this.channel,{
            baseUrl:STARVIOS_PUBLIC_DB_URL,key:STARVIOS_PUBLIC_KEY,timeoutMs:10000
          });
          directorySource='Starvios public DB · respaldo';
        }catch(error){
          throw Error('Starvios viewer primary: '+(this.lastDirectoryPrimaryError||'en pausa')+
            (browserViewerError?' · browser: '+browserViewerError:'')+
            ' · public DB fallback: '+String(error?.message||error));
        }
      }
      if(generation!==this.generation||!this.running)return;
      const state=parseStarviosLiveDirectory(payload,this.channel);
      const stream=Array.isArray(payload.rows)?payload.rows.find(row=>row&&String(row.status||'').toLowerCase()==='live'&&String(row.profiles?.username||'').toLowerCase()===this.channel.toLowerCase()):null;
      if(stream?.id&&stream?.channel_id){
        const isNew=!!this.streamId&&this.streamId!==stream.id;
        if(isNew){this.eventSeen.clear();this.eventKeys.clear();this.dbEventsReady=false;this.sessionStartedAt=Date.now();this.eventCursorAt=this.sessionStartedAt;this.followerTotal=null;}
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
    this.lastLive=null;this.liveDirectoryMisses=0;this.lastDirectoryGoodAt=0;this.directoryPrimaryRetryAt=0;this.lastDirectoryPrimaryError='';
    this.lastViewerCount=null;this.eventKeys.clear();this.eventSeen.clear();
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
