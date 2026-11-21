// GREÑA YouTube Live adapter — YouTube Data API v3.
// Requires GRENA_YOUTUBE_API_KEY server-side; never expose it in browser code.
const API='https://www.googleapis.com/youtube/v3';
export function youtubeVideoId(input){
  const value=String(input||'').trim();
  if(/^[a-zA-Z0-9_-]{11}$/.test(value))return value;
  try {
    const u=new URL(value);
    if(!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname.toLowerCase()))return '';
    const id=u.hostname.endsWith('youtu.be')?u.pathname.split('/')[1]:u.searchParams.get('v')||(/\/(?:live|shorts|embed)\/([\w-]{11})/.exec(u.pathname)||[])[1];
    return /^[\w-]{11}$/.test(id||'')?id:'';
  }catch{return ''}
}
export function normalizeYouTubeMessage(item){
  const s=item?.snippet||{},a=item?.authorDetails||{},type=s.type||'';
  const user=a.displayName||'Usuario',userId=a.channelId||'';
  const base={platform:'youtube',id:String(item?.id||''),type,user,username:user,nickname:user,userId,avatar:a.profileImageUrl||'',isModerator:!!a.isChatModerator,isOwner:!!a.isChatOwner,isMember:!!a.isChatSponsor,createdAt:s.publishedAt||'',message:s.displayMessage||''};
  if(type==='textMessageEvent')return {...base,kind:'chat',message:s.textMessageDetails?.messageText||base.message};
  if(type==='superChatEvent'){const d=s.superChatDetails||{};return {...base,kind:'superchat',event:'gift',amount:Number(d.amountMicros||0)/1e6,currency:d.currency||'',displayAmount:d.amountDisplayString||'',tier:d.tier||0,message:d.userComment||base.message}}
  if(type==='superStickerEvent'){const d=s.superStickerDetails||{};return {...base,kind:'supersticker',event:'gift',amount:Number(d.amountMicros||0)/1e6,currency:d.currency||'',displayAmount:d.amountDisplayString||'',stickerId:d.superStickerMetadata?.stickerId||'',giftName:d.superStickerMetadata?.altText||'Super Sticker'}}
  if(type==='newSponsorEvent')return {...base,kind:'membership',event:'sub',membershipLevel:s.newSponsorDetails?.memberLevelName||'',isUpgrade:!!s.newSponsorDetails?.isUpgrade};
  if(type==='memberMilestoneChatEvent')return {...base,kind:'membermilestone',event:'sub',months:s.memberMilestoneChatDetails?.memberMonth||0,message:s.memberMilestoneChatDetails?.userComment||base.message};
  if(type==='membershipGiftingEvent')return {...base,kind:'membershipgift',event:'gift',count:Number(s.membershipGiftingDetails?.giftMembershipsCount||0)};
  if(type==='giftMembershipReceivedEvent')return {...base,kind:'membershipreceived',event:'sub'};
  if(type==='giftEvent')return {...base,kind:'jewelgift',event:'gift',giftName:s.giftDetails?.giftName||'Regalo',giftDetails:s.giftDetails||{},count:Math.max(1,Number(s.giftDetails?.comboCount)||1)};
  return null;
}
export class YouTubeLiveReader {
  constructor({apiKey=process.env.GRENA_YOUTUBE_API_KEY,requestProxy=null,getStreamToken=null,
    streamFactory=null,onMessage=()=>{},onStatus=()=>{},onViewers=()=>{}}={}){
    this.apiKey=String(apiKey||'').trim();this.requestProxy=requestProxy;
    this.getStreamToken=getStreamToken;this.streamFactory=streamFactory;
    this.onMessage=onMessage;this.onStatus=onStatus;this.onViewers=onViewers;
    this.running=false;this.timer=null;this.stream=null;this.streamDisabled=false;
    this.nextPageToken='';this.seen=new Set();this.giftCombos=new Map();
    this.chatId='';this.videoId='';this.backoff=0;this.pollCount=0;this.initialReceived=false;this.streamFailures=0;
  }
  async request(resource,params){
    if(this.requestProxy)return this.requestProxy(resource,params);
    const u=new URL(API+'/'+resource);
    for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));
    u.searchParams.set('key',this.apiKey);
    const ac=new AbortController(),t=setTimeout(()=>ac.abort(),12000);
    try{
      const r=await fetch(u,{signal:ac.signal});
      const data=await r.json();
      if(!r.ok)throw Error('YouTube API '+r.status+': '+(data?.error?.message||'No disponible'));
      return data;
    }finally{clearTimeout(t)}
  }
  async start(input){
    await this.stop();
    if(!this.apiKey&&!this.requestProxy)throw Error('Vincula YouTube con Google para usar GREÑA.');
    const id=youtubeVideoId(input);
    if(!id)throw Error('Introduce el enlace público de YouTube, no el enlace de Studio.');
    this.videoId=id;this.running=true;this.nextPageToken='';
    this.seen.clear();this.giftCombos.clear();this.backoff=0;this.streamFailures=0;
    try{await this.discoverChat()}catch(e){await this.stop();throw e}
    return {videoId:id,chatId:this.chatId,waiting:!this.chatId};
  }
  async discoverChat(){
    if(!this.running)return;
    const data=await this.request('videos',{part:'liveStreamingDetails,snippet,status',id:this.videoId});
    if(!this.running)return;
    const v=data.items?.[0];if(!v)throw Error('No se encuentra el vídeo de YouTube.');
    const chat=v.liveStreamingDetails?.activeLiveChatId||'';
    if(chat){
      this.chatId=chat;
      this.onStatus({connected:true,videoId:this.videoId,title:v.snippet?.title||''});
      if(this.getStreamToken&&!this.streamDisabled)void this.beginStream();
      else void this.poll();
      return;
    }
    this.onStatus({connected:false,waiting:true,videoId:this.videoId,error:'Esperando que YouTube active el chat LIVE.'});
    this.scheduleDiscovery(30000);
  }
  // A failed discovery must never strand a reader in running=true with no chat.
  // Continue rediscovering the SAME broadcast after temporary Google API errors.
  scheduleDiscovery(delay=30000){
    if(!this.running)return;
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>{
      this.timer=null;
      void this.discoverChat().catch(e=>{
        if(!this.running)return;
        this.backoff=Math.min(120000,Math.max(30000,(this.backoff||15000)*2));
        this.onStatus({connected:false,waiting:true,videoId:this.videoId,
          error:'YouTube: reintentando detectar chat LIVE · '+String(e.message||e).slice(0,150)});
        this.scheduleDiscovery(this.backoff);
      });
    },Math.max(5000,delay));
  }
  consumeBatch(data){
    const initial=!this.initialReceived&&!this.nextPageToken;
    this.initialReceived=true;
    for(const item of data.items||[]){
      if(!item.id)continue;
      const combo=item.snippet?.type==='giftEvent';
      const total=combo?Math.max(1,Number(item.snippet?.giftDetails?.comboCount)||1):0;
      const previous=combo?(this.giftCombos.get(item.id)||0):0;
      if(this.seen.has(item.id)&&(!combo||total<=previous))continue;
      this.seen.add(item.id);
      if(combo)this.giftCombos.set(item.id,total);
      const mapped=normalizeYouTubeMessage(item);
      if(mapped&&combo)mapped.count=Math.max(1,total-previous);
      // Evitar pagos antiguos solo en el primer historial inicial.
      // Al reanudar con pageToken, los pagos nuevos sí se entregan.
      if(mapped&&(!initial||mapped.kind==='chat'))this.onMessage(mapped);
    }
    if(this.seen.size>1500){
      this.seen=new Set([...this.seen].slice(-700));
      for(const id of this.giftCombos.keys())if(!this.seen.has(id))this.giftCombos.delete(id);
    }
    if(data.nextPageToken)this.nextPageToken=data.nextPageToken;
    this.backoff=0;this.streamFailures=0;
    this.onStatus({connected:true,videoId:this.videoId,transport:this.stream?'streamList':'poll'});
  }
  async beginStream(){
    if(!this.running||!this.chatId||this.stream||this.streamDisabled)return;
    try{
      const token=await this.getStreamToken();
      if(!this.running)return;
      const factory=this.streamFactory||((await import('./youtube-live-stream.mjs')).openYouTubeLiveStream);
      if(!this.running)return;
      const chatId=this.chatId;
      this.stream=factory({token,chatId,pageToken:this.nextPageToken,
        onBatch:batch=>{
          if(!this.running||this.chatId!==chatId)return;
          try{
            this.consumeBatch(batch);
            if(batch.offlineAt)this.onStatus({connected:false,videoId:this.videoId,error:'Directo de YouTube finalizado.'});
          }catch(e){this.onStatus({connected:false,error:String(e.message||e)})}
        },
        onError:error=>{
          if(!this.running||this.chatId!==chatId)return;
          this.stream=null;
          const code=Number(error?.code);
          const msg=String(error?.details||error?.message||error).slice(0,220);
          this.onStatus({connected:false,videoId:this.videoId,error:'YouTube streamList: '+msg});
          this.streamFailures++;
          const isQuota=code===8||/quota|rate.?limit|exhausted/i.test(msg);
          if(isQuota){
            // Respect YouTube quotas: do not add REST requests during a quota failure.
            this.backoff=Math.min(900000,Math.max(300000,(this.backoff||15000)*2));
            this.scheduleStream(this.backoff);
          }else if([3,7,12,16].includes(code)||this.streamFailures>=2){
            // Permission/grpc unsupported or repeated broken streams: REST can
            // still deliver live messages without requiring this gRPC transport.
            this.streamDisabled=true;
            this.onStatus({connected:false,waiting:true,videoId:this.videoId,
              error:'YouTube: recuperando comentarios mediante API REST.'});
            this.schedulePoll(30000);
          }else{
            this.backoff=Math.min(120000,Math.max(15000,(this.backoff||7500)*2));
            this.scheduleStream(this.backoff);
          }
        },
        onEnd:()=>{
          if(!this.running||this.chatId!==chatId)return;
          this.stream=null;this.streamFailures++;
          if(this.streamFailures>=2){
            this.streamDisabled=true;
            this.onStatus({connected:false,waiting:true,videoId:this.videoId,
              error:'YouTube: canal en tiempo real cerrado, cambiando a API REST.'});
            this.schedulePoll(30000);
          }else this.scheduleStream(10000);
        }
      });
    }catch(e){
      if(!this.running)return;
      this.onStatus({connected:false,videoId:this.videoId,error:'Stream YouTube no disponible: '+String(e.message||e).slice(0,180)});
      this.streamDisabled=true;this.schedulePoll(45000);
    }
  }
  scheduleStream(delay){
    if(!this.running)return;
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>{this.timer=null;void this.beginStream()},Math.max(5000,delay));
  }
  schedulePoll(delay){
    if(!this.running)return;
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>{this.timer=null;void this.poll()},Math.max(30000,delay));
  }
  async poll(){
    if(!this.running||!this.chatId)return;
    let interval=45000;
    try{
      const data=await this.request('liveChat/messages',{
        liveChatId:this.chatId,part:'id,snippet,authorDetails',
        maxResults:200,pageToken:this.nextPageToken
      });
      if(!this.running)return;
      this.pollCount+=1;this.consumeBatch(data);
      interval=Math.max(30000,Number(data.pollingIntervalMillis)||45000);
    }catch(e){
      if(!this.running)return;
      const msg=String(e.message||e);
      if(/liveChatEnded|liveChatNotFound|liveChatDisabled/i.test(msg)){
        // The broadcaster can restart LIVE with a new chat ID, while the
        // broadcast's video ID stays the same. Rediscover instead of polling
        // the dead chat forever.
        this.chatId='';this.nextPageToken='';this.streamDisabled=false;
        this.onStatus({connected:false,waiting:true,videoId:this.videoId,
          error:'YouTube: recuperando el chat de la transmisión.'});
        this.scheduleDiscovery(30000);
        return;
      }
      if(/invalidPageToken|pageTokenInvalid/i.test(msg)){
        this.nextPageToken='';
        this.onStatus({connected:false,waiting:true,videoId:this.videoId,
          error:'YouTube: sincronizando historial del chat.'});
        this.schedulePoll(30000);
        return;
      }
      const quota=/quota|rateLimitExceeded|403|429/i.test(msg);
      this.backoff=Math.min(quota?900000:120000,Math.max(quota?300000:30000,(this.backoff||15000)*2));
      interval=this.backoff;
      this.onStatus({connected:false,error:'YouTube: '+msg.slice(0,180),retryMs:interval});
    }
    this.schedulePoll(interval);
  }
  async refreshViewers(){
    if(!this.running)return;
    try{
      const d=await this.request('videos',{part:'liveStreamingDetails',id:this.videoId});
      const n=d.items?.[0]?.liveStreamingDetails?.concurrentViewers;
      // "null", empty and absent are UNKNOWN, never an official count of 0.
      const count=n===undefined||n===null||n===''?null:Number(n);
      this.onViewers(Number.isFinite(count)&&count>=0?count:null);
    }catch{this.onViewers(null)}
  }
  async stop(){
    this.running=false;clearTimeout(this.timer);this.timer=null;
    if(this.stream){try{this.stream.cancel()}catch{}this.stream=null}
    this.nextPageToken='';this.seen.clear();this.giftCombos.clear();
    this.videoId='';this.chatId='';this.initialReceived=false;
    this.streamDisabled=false;this.streamFailures=0;
  }
}
